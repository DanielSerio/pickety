import * as fs from "fs";
import * as path from "path";
import { loadConfig } from "../core/config";
import { loadTsConfigAliases } from "../core/tsconfig";
import { checkBoundaries } from "../core/boundaries";
import { applyMaxViolations } from "../core/violations";
import { ImportGraph, getFileDependencies } from "../core/graph";
import {
  SOURCE_EXTENSIONS,
  normalizePath,
  getConfigPath,
  CONFIG_FILENAME,
  countViolationsBySeverity,
  isIgnoredPath
} from "../shared/utils";
import { findCycles } from "../core/utils";
import { computeModuleHealth, checkHealthThresholds } from "../core/health";
import { buildCheckReport, formatGroupSummary, formatViolation, printImpactReport, printHealthReport } from "./formatters";
import type { PicketyConfig, Violation, WorkspaceContext } from "../shared/types";
import { getPreset, listPresets } from "../core/presets";

type OutputFormat = "text" | "json";

type ParseResult =
  | {
    ok: true;
    command: string | undefined;
    root: string;
    target: string | undefined;
    format: OutputFormat;
    preset: string | undefined;
    verbose: boolean;
  }
  | {
    ok: false;
    exitCode: number;
  };

function parseArgs(argv: string[]): ParseResult {
  const args = argv.slice(2);
  const command = args[0];
  let root = process.cwd();
  let format: OutputFormat = "text";
  let preset: string | undefined;
  let verbose = false;

  const rootFlagIndex = args.indexOf("--root");
  if (rootFlagIndex !== -1 && args[rootFlagIndex + 1]) {
    root = path.resolve(args[rootFlagIndex + 1]);
  }

  const formatFlagIndex = args.indexOf("--format");
  if (formatFlagIndex !== -1) {
    const value = args[formatFlagIndex + 1];
    if (!value || value.startsWith("--")) {
      console.error('Missing value for "--format". Use "text" or "json".');
      return { ok: false, exitCode: 1 };
    }
    if (value !== "text" && value !== "json") {
      console.error(`Invalid format "${value}". Use "text" or "json".`);
      return { ok: false, exitCode: 1 };
    }
    format = value;
  }

  const presetFlagIndex = args.indexOf("--preset");
  if (presetFlagIndex !== -1) {
    const value = args[presetFlagIndex + 1];
    if (!value || value.startsWith("--")) {
      console.error('Missing value for "--preset".');
      return { ok: false, exitCode: 1 };
    }
    preset = value;
  }

  if (args.includes("--verbose")) {
    verbose = true;
  }

  const target = command === "impact" && args[1] && !args[1].startsWith("--")
    ? path.resolve(root, args[1])
    : undefined;

  return { ok: true, command, root, target, format, preset, verbose };
}

const SOURCE_EXT_SET = new Set(SOURCE_EXTENSIONS.map((ext) => `.${ext}`));

function discoverFiles(root: string, ignore: string[] | undefined): Set<string> {
  const entries = fs.readdirSync(root, { recursive: true, withFileTypes: true });
  const files = new Set<string>();

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const parentPath = (entry as { parentPath?: string; path?: string; }).parentPath
      ?? (entry as { path?: string; }).path
      ?? root;
    const fullPath = path.join(parentPath, entry.name);
    if (fullPath.includes("node_modules")) {
      continue;
    }
    if (isIgnoredPath(fullPath, root, ignore)) {
      continue;
    }
    if (SOURCE_EXT_SET.has(path.extname(entry.name))) {
      files.add(normalizePath(fullPath));
    }
  }
  return files;
}

function printUsage() {
  console.log("Usage: pickety <command> [options]");
  console.log("");
  console.log("Commands:");
  console.log("  check              Check all files for boundary violations");
  console.log("  impact <file>      Show which files and modules depend on a file");
  console.log("  health             Show module health metrics and check thresholds");
  console.log("  init               Create a starter pickety.json");
  console.log("");
  console.log("Options:");
  console.log("  --root <path>      Workspace root (defaults to current directory)");
  console.log("  --format <text|json>  Output format for check (defaults to text)");
  console.log(`  --preset <name>    Preset name for init (${listPresets().join(", ")})`);
  console.log("  --verbose          Log file read errors");
}

type WorkspaceResult =
  | { ok: true; config: PicketyConfig; ctx: WorkspaceContext; }
  | { ok: false; exitCode: number; };

function loadWorkspace(root: string): WorkspaceResult {
  const result = loadConfig(root);
  if (!result.ok) {
    console.error("Configuration errors:");
    for (const err of result.errors) {
      console.error(`  ${err.message}${err.path ? ` (at ${err.path})` : ""}`);
    }
    if (result.warnings && result.warnings.length > 0) {
      console.warn("Configuration warnings:");
      for (const warn of result.warnings) {
        console.warn(`  ${warn.message}${warn.path ? ` (at ${warn.path})` : ""}`);
      }
    }
    return { ok: false, exitCode: 1 };
  }

  if (!result.config) {
    console.log("No pickety.json found. Skipping check.");
    return { ok: false, exitCode: 0 };
  }

  if (result.warnings && result.warnings.length > 0) {
    console.warn("Configuration warnings:");
    for (const warn of result.warnings) {
      console.warn(`  ${warn.message}${warn.path ? ` (at ${warn.path})` : ""}`);
    }
  }

  const knownFiles = discoverFiles(root, result.config.ignore);
  const aliases = loadTsConfigAliases(root);

  return {
    ok: true,
    config: result.config,
    ctx: { root, knownFiles, aliases }
  };
}

function buildImportGraph(ctx: WorkspaceContext, verbose: boolean): ImportGraph {
  const graph = new ImportGraph();
  for (const filePath of ctx.knownFiles) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const deps = getFileDependencies(filePath, content, ctx);
      graph.updateFile(filePath, deps);
    } catch (err) {
      if (verbose) {
        const detail = err instanceof Error ? err.message : String(err);
        console.warn(`Skipping unreadable file: ${filePath} (${detail})`);
      }
    }
  }
  return graph;
}

function runCheck(root: string, format: OutputFormat, verbose: boolean): number {
  const workspace = loadWorkspace(root);
  if (!workspace.ok) {
    return workspace.exitCode;
  }
  const { config, ctx } = workspace;
  const graph = new ImportGraph();
  const allViolations: Violation[] = [];

  for (const filePath of ctx.knownFiles) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const violations = checkBoundaries({ filePath, content, config, ctx });
      allViolations.push(...violations);

      const fileDeps = getFileDependencies(filePath, content, ctx);
      graph.updateFile(filePath, fileDeps);
    } catch (err) {
      if (verbose) {
        const detail = err instanceof Error ? err.message : String(err);
        console.warn(`Skipping unreadable file: ${filePath} (${detail})`);
      }
    }
  }

  const finalViolations = applyMaxViolations(allViolations, config);
  const moduleGraph = graph.getModuleLevelGraph(config.modules, root);
  const cycles = findCycles(moduleGraph);

  if (format === "json") {
    const report = buildCheckReport(finalViolations, cycles, root);
    console.log(JSON.stringify(report, null, 2));
    return report.summary.errors > 0 ? 1 : 0;
  }

  if (finalViolations.length === 0 && cycles.length === 0) {
    console.log("No boundary violations found.");
    return 0;
  }

  for (const v of finalViolations) {
    console.log(formatViolation(v, root));
  }

  for (const cycle of cycles) {
    console.log(`error: Circular dependency detected: ${cycle.join(" -> ")}`);
  }

  const counts = countViolationsBySeverity(finalViolations);
  const errorCount = counts.errors + cycles.length;
  const warnCount = counts.warnings;
  const infoCount = counts.info;

  const groupSummary = formatGroupSummary(finalViolations);
  if (groupSummary) {
    console.log(groupSummary);
  }

  console.log("");
  console.log(`Found ${finalViolations.length} violation(s): ${errorCount} error(s), ${warnCount} warning(s), ${infoCount} info(s)`);
  return errorCount > 0 ? 1 : 0;
}

function runImpact(root: string, target: string | undefined, verbose: boolean): number {
  if (!target) {
    console.error("Usage: pickety impact <file> [--root <path>]");
    return 1;
  }

  if (!fs.existsSync(target)) {
    console.error(`File not found: ${target}`);
    return 1;
  }

  const workspace = loadWorkspace(root);
  if (!workspace.ok) {
    return workspace.exitCode;
  }
  const { config, ctx } = workspace;
  const graph = buildImportGraph(ctx, verbose);
  printImpactReport({ filePath: target, graph, config, root });
  return 0;
}

function runHealth(root: string, verbose: boolean): number {
  const workspace = loadWorkspace(root);
  if (!workspace.ok) {
    return workspace.exitCode;
  }
  const { config, ctx } = workspace;
  const graph = buildImportGraph(ctx, verbose);
  const health = computeModuleHealth(graph, config.modules, ctx);

  const violations = config.health ? checkHealthThresholds(health, config.health) : [];
  printHealthReport(health, violations);

  if (violations.length > 0) {
    console.log(`\n  ${violations.length} threshold violation(s) found.`);
    return 1;
  }

  console.log("\n  All modules within configured thresholds.");
  return 0;
}

function runInit(root: string, preset: string | undefined): number {
  const configPath = getConfigPath(root);
  if (fs.existsSync(configPath)) {
    console.error(`${CONFIG_FILENAME} already exists at ${configPath}.`);
    return 1;
  }

  if (preset) {
    const presetConfig = getPreset(preset);
    if (!presetConfig) {
      console.error(`Unknown preset "${preset}". Available presets: ${listPresets().join(", ")}`);
      return 1;
    }
  }

  const defaultConfig = {
    $schema: "https://raw.githubusercontent.com/DanielSerio/pickety/main/resources/pickety.schema.json",
    modules: {
      features: "src/features/*",
      components: "src/components/**/*",
      utils: "src/utils/**/*",
    },
    rules: {
      "module-boundaries": {
        severity: "error",
        rules: [
          {
            importer: "features",
            imports: "features",
            allow: true,
            message: "Features can import from their own module.",
          },
          {
            importer: "features",
            imports: "components",
            allow: true,
          },
          {
            importer: "features",
            imports: "utils",
            allow: true,
          },
        ],
      },
    },
    "boundary-diagrams": true,
  };

  const configToWrite = preset
    ? {
      $schema: defaultConfig.$schema,
      preset,
    }
    : defaultConfig;

  fs.writeFileSync(configPath, JSON.stringify(configToWrite, null, 2));
  console.log(`Created ${CONFIG_FILENAME} at ${configPath}`);
  return 0;
}

function main() {
  const parsed = parseArgs(process.argv);
  if (!parsed.ok) {
    process.exit(parsed.exitCode);
  }
  const { command, root, target, format, preset, verbose } = parsed;

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    process.exit(0);
  }

  let exitCode = 0;
  switch (command) {
    case "check":
      exitCode = runCheck(root, format, verbose);
      break;
    case "impact":
      exitCode = runImpact(root, target, verbose);
      break;
    case "health":
      exitCode = runHealth(root, verbose);
      break;
    case "init":
      exitCode = runInit(root, preset);
      break;
    default:
      console.error(`Unknown command: "${command}"`);
      printUsage();
      exitCode = 1;
  }

  process.exit(exitCode);
}

main();
