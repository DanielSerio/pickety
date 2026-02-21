#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { loadConfig, loadTsConfigAliases } from "./core/config";
import { checkBoundaries, applyMaxViolations, getModuleDependencies } from "./core/boundaries";
import { ImportGraph, getFileDependencies } from "./core/graph";
import { matchFileToModule } from "./core/imports";
import { SOURCE_EXTENSIONS, normalizePath, findCycles } from "./core/utils";
import { computeModuleHealth, checkHealthThresholds } from "./core/health";
import type { PicketyConfig, Violation } from "./types";

/**
 * Parses CLI arguments into a structured options object.
 * Supports: pickety check [--root <path>]
 *           pickety impact <file> [--root <path>]
 */
function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const command = args[0];
  let root = process.cwd();

  const rootFlagIndex = args.indexOf("--root");
  if (rootFlagIndex !== -1 && args[rootFlagIndex + 1]) {
    root = path.resolve(args[rootFlagIndex + 1]);
  }

  // For `impact`, the second positional arg is the target file
  const target = command === "impact" && args[1] && !args[1].startsWith("--")
    ? path.resolve(root, args[1])
    : undefined;

  return { command, root, target };
}

// Set of valid source file extensions for filtering
const SOURCE_EXT_SET = new Set(SOURCE_EXTENSIONS.map((ext) => `.${ext}`));

/**
 * Discovers all source files in the workspace, excluding node_modules.
 * Uses Node's recursive readdirSync — no external glob dependency needed.
 */
function discoverFiles(root: string): Set<string> {
  const entries = fs.readdirSync(root, { recursive: true, withFileTypes: true });
  const files = new Set<string>();

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    // Build the full path from parentPath + name
    const fullPath = path.join(entry.parentPath, entry.name);

    // Skip node_modules
    if (fullPath.includes("node_modules")) {
      continue;
    }

    // Only include source files
    if (SOURCE_EXT_SET.has(path.extname(entry.name))) {
      files.add(normalizePath(fullPath));
    }
  }

  return files;
}

/**
 * Formats a violation as a lint-style string: file:line:col: severity message
 */
function formatViolation(v: Violation, root: string): string {
  const relativePath = path.relative(root, v.file).replace(/\\/g, "/");
  // Line/col are 0-indexed internally, display as 1-indexed
  const line = v.line + 1;
  const col = v.character + 1;
  const severity = v.severity === "error" ? "error" : "warning";
  return `${relativePath}:${line}:${col}: ${severity} ${v.message}`;
}

function printUsage() {
  console.log("Usage: pickety <command> [options]");
  console.log("");
  console.log("Commands:");
  console.log("  check              Check all files for boundary violations");
  console.log("  impact <file>      Show which files and modules depend on a file");
  console.log("  health             Show module health metrics and check thresholds");
  console.log("");
  console.log("Options:");
  console.log("  --root <path>      Workspace root (defaults to current directory)");
}

// Loads config, aliases, and files — shared setup for all commands
function loadWorkspace(root: string) {
  const result = loadConfig(root);
  if (!result.ok) {
    console.error("Configuration errors:");
    for (const err of result.errors) {
      console.error(`  ${err.message}${err.path ? ` (at ${err.path})` : ""}`);
    }
    process.exit(1);
  }

  return {
    config: result.config,
    aliases: loadTsConfigAliases(root),
    knownFiles: discoverFiles(root),
  };
}

// Builds the file-level import graph for the entire workspace
function buildImportGraph(
  knownFiles: Set<string>,
  root: string,
  aliases: Record<string, string>
): ImportGraph {
  const graph = new ImportGraph();
  for (const filePath of knownFiles) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const deps = getFileDependencies(filePath, content, knownFiles, root, aliases);
      graph.updateFile(filePath, deps);
    } catch {
      continue;
    }
  }
  return graph;
}

function runCheck(root: string) {
  const { config, aliases, knownFiles } = loadWorkspace(root);

  // Check each file for violations
  const allViolations: Violation[] = [];
  for (const filePath of knownFiles) {
    const content = fs.readFileSync(filePath, "utf-8");
    const violations = checkBoundaries(filePath, content, config, knownFiles, root, aliases);
    allViolations.push(...violations);
  }

  // Apply maxViolations thresholds (downgrade/escalate severity)
  const finalViolations = applyMaxViolations(allViolations, config);

  // Build module graph for circular dependency detection
  const moduleGraph = new Map<string, Set<string>>();
  for (const filePath of knownFiles) {
    const content = fs.readFileSync(filePath, "utf-8");
    const deps = getModuleDependencies(filePath, content, config, knownFiles, root, aliases);
    if (deps) {
      if (!moduleGraph.has(deps.sourceModule)) {
        moduleGraph.set(deps.sourceModule, new Set());
      }
      const sourceSet = moduleGraph.get(deps.sourceModule)!;
      for (const target of deps.targetModules) {
        sourceSet.add(target);
      }
    }
  }

  const cycles = findCycles(moduleGraph);

  // Print results
  if (finalViolations.length === 0 && cycles.length === 0) {
    console.log("No boundary violations found.");
    process.exit(0);
  }

  for (const v of finalViolations) {
    console.log(formatViolation(v, root));
  }

  for (const cycle of cycles) {
    console.log(`error: Circular dependency detected: ${cycle.join(" -> ")}`);
  }

  const errorCount = finalViolations.filter((v) => v.severity === "error").length + cycles.length;
  const warnCount = finalViolations.filter((v) => v.severity === "warn").length;

  console.log("");
  console.log(`Found ${finalViolations.length} violation(s): ${errorCount} error(s), ${warnCount} warning(s)`);

  process.exit(errorCount > 0 ? 1 : 0);
}

// Formats a grouped impact report for a single file
function printImpactReport(
  filePath: string,
  graph: ImportGraph,
  config: PicketyConfig,
  root: string
) {
  const normalized = normalizePath(filePath);
  const relativePath = path.relative(root, normalized).replace(/\\/g, "/");
  const directDependents = graph.getDependents(normalized);
  const transitiveDependents = graph.getTransitiveDependents(normalized);

  console.log(`Impact analysis for ${relativePath}:\n`);

  if (directDependents.size === 0) {
    console.log("  No dependents found.\n");
    return;
  }

  // Direct dependents grouped by module
  console.log(`  Direct dependents (${directDependents.size} file${directDependents.size === 1 ? "" : "s"}):`);
  for (const dep of directDependents) {
    const mod = matchFileToModule(dep, config.modules, root) ?? "(unmatched)";
    const rel = path.relative(root, dep).replace(/\\/g, "/");
    console.log(`    ${rel} (${mod})`);
  }

  // Transitive summary
  if (transitiveDependents.size > directDependents.size) {
    const transitiveModules = new Set<string>();
    for (const dep of transitiveDependents) {
      const mod = matchFileToModule(dep, config.modules, root);
      if (mod) {
        transitiveModules.add(mod);
      }
    }

    console.log(
      `\n  Transitive dependents (${transitiveDependents.size} file${transitiveDependents.size === 1 ? "" : "s"} across ${transitiveModules.size} module${transitiveModules.size === 1 ? "" : "s"}):`
    );
    console.log(`    ${[...transitiveModules].join(", ")}`);
  }

  // Affected modules
  const allModules = new Set<string>();
  for (const dep of transitiveDependents) {
    const mod = matchFileToModule(dep, config.modules, root);
    if (mod) {
      allModules.add(mod);
    }
  }
  console.log(`\n  Affected modules: ${[...allModules].join(", ") || "none"}`);
  console.log("");
}

function runImpact(root: string, target: string | undefined) {
  if (!target) {
    console.error("Usage: pickety impact <file> [--root <path>]");
    process.exit(1);
  }

  if (!fs.existsSync(target)) {
    console.error(`File not found: ${target}`);
    process.exit(1);
  }

  const { config, aliases, knownFiles } = loadWorkspace(root);
  const graph = buildImportGraph(knownFiles, root, aliases);

  printImpactReport(target, graph, config, root);
}

function runHealth(root: string) {
  const { config, aliases, knownFiles } = loadWorkspace(root);
  const graph = buildImportGraph(knownFiles, root, aliases);
  const health = computeModuleHealth(graph, config.modules, root, knownFiles);

  // Print table header
  console.log("Module Health Report:\n");
  const header = ["Module", "Files", "Ca", "Ce", "Instability", "Depth"];
  const colWidths = [
    Math.max(header[0].length, ...health.map((m) => m.moduleName.length)),
    Math.max(header[1].length, ...health.map((m) => String(m.fileCount).length)),
    Math.max(header[2].length, ...health.map((m) => String(m.afferentCoupling).length)),
    Math.max(header[3].length, ...health.map((m) => String(m.efferentCoupling).length)),
    Math.max(header[4].length, 4), // instability is "0.XX"
    Math.max(header[5].length, ...health.map((m) => String(m.dependencyDepth).length)),
  ];

  const pad = (s: string, w: number) => s.padEnd(w);
  const padNum = (s: string, w: number) => s.padStart(w);

  console.log(
    "  " + header.map((h, i) => pad(h, colWidths[i])).join("   ")
  );
  console.log(
    "  " + colWidths.map((w) => "\u2500".repeat(w)).join("   ")
  );

  // Check thresholds for annotations
  const violations = config.health
    ? checkHealthThresholds(health, config.health)
    : [];
  const violationSet = new Set(violations.map((v) => `${v.moduleName}:${v.metric}`));

  for (const mod of health) {
    const cols = [
      pad(mod.moduleName, colWidths[0]),
      padNum(String(mod.fileCount), colWidths[1]),
      padNum(String(mod.afferentCoupling), colWidths[2]),
      padNum(String(mod.efferentCoupling), colWidths[3]),
      padNum(mod.instability.toFixed(2), colWidths[4]),
      padNum(String(mod.dependencyDepth), colWidths[5]),
    ];

    let line = "  " + cols.join("   ");

    // Annotate with threshold violations
    const modViolations = violations.filter((v) => v.moduleName === mod.moduleName);
    if (modViolations.length > 0) {
      const notes = modViolations.map((v) => {
        const thresholdStr = v.metric === "instability" ? v.threshold.toFixed(2) : String(v.threshold);
        return `exceeds max${v.metric.split(" ").map((w) => w[0].toUpperCase() + w.slice(1)).join("")} (${thresholdStr})`;
      });
      line += "      \u2190 " + notes.join(", ");
    }

    console.log(line);
  }

  if (violations.length > 0) {
    console.log(`\n  ${violations.length} threshold violation(s) found.`);
    process.exit(1);
  } else {
    console.log("\n  All modules within configured thresholds.");
    process.exit(0);
  }
}

function main() {
  const { command, root, target } = parseArgs(process.argv);

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    process.exit(0);
  }

  switch (command) {
    case "check":
      runCheck(root);
      break;
    case "impact":
      runImpact(root, target);
      break;
    case "health":
      runHealth(root);
      break;
    default:
      console.error(`Unknown command: "${command}"`);
      printUsage();
      process.exit(1);
  }
}

main();
