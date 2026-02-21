#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { loadConfig, loadTsConfigAliases } from "./core/config";
import { checkBoundaries, applyMaxViolations } from "./core/boundaries";
import { ImportGraph, getFileDependencies } from "./core/graph";
import { toRelativePath, SOURCE_EXTENSIONS, normalizePath, findCycles } from "./core/utils";
import { computeModuleHealth, checkHealthThresholds } from "./core/health";
import { formatViolation, printImpactReport, printHealthReport } from "./cli/formatters";
import type { PicketyConfig, Violation, WorkspaceContext } from "./types";

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const command = args[0];
  let root = process.cwd();

  const rootFlagIndex = args.indexOf("--root");
  if (rootFlagIndex !== -1 && args[rootFlagIndex + 1]) {
    root = path.resolve(args[rootFlagIndex + 1]);
  }

  const target = command === "impact" && args[1] && !args[1].startsWith("--")
    ? path.resolve(root, args[1])
    : undefined;

  return { command, root, target };
}

const SOURCE_EXT_SET = new Set(SOURCE_EXTENSIONS.map((ext) => `.${ext}`));

function discoverFiles(root: string): Set<string> {
  const entries = fs.readdirSync(root, { recursive: true, withFileTypes: true });
  const files = new Set<string>();

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const fullPath = path.join(entry.parentPath, entry.name);
    if (fullPath.includes("node_modules")) {
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
  console.log("");
  console.log("Options:");
  console.log("  --root <path>      Workspace root (defaults to current directory)");
}

function loadWorkspace(root: string): { config: PicketyConfig; ctx: WorkspaceContext; } {
  const result = loadConfig(root);
  if (!result.ok) {
    console.error("Configuration errors:");
    for (const err of result.errors) {
      console.error(`  ${err.message}${err.path ? ` (at ${err.path})` : ""}`);
    }
    process.exit(1);
  }

  const knownFiles = discoverFiles(root);
  const aliases = loadTsConfigAliases(root);

  return {
    config: result.config,
    ctx: { root, knownFiles, aliases }
  };
}

function buildImportGraph(ctx: WorkspaceContext): ImportGraph {
  const graph = new ImportGraph();
  for (const filePath of ctx.knownFiles) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const deps = getFileDependencies(filePath, content, ctx);
      graph.updateFile(filePath, deps);
    } catch {
      continue;
    }
  }
  return graph;
}

function runCheck(root: string) {
  const { config, ctx } = loadWorkspace(root);
  const graph = new ImportGraph();
  const allViolations: Violation[] = [];

  for (const filePath of ctx.knownFiles) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const violations = checkBoundaries(filePath, content, config, ctx);
      allViolations.push(...violations);

      const fileDeps = getFileDependencies(filePath, content, ctx);
      graph.updateFile(filePath, fileDeps);
    } catch {
      continue;
    }
  }

  const finalViolations = applyMaxViolations(allViolations, config);
  const moduleGraph = graph.getModuleLevelGraph(config.modules, root);
  const cycles = findCycles(moduleGraph);

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

function runImpact(root: string, target: string | undefined) {
  if (!target) {
    console.error("Usage: pickety impact <file> [--root <path>]");
    process.exit(1);
  }

  if (!fs.existsSync(target)) {
    console.error(`File not found: ${target}`);
    process.exit(1);
  }

  const { config, ctx } = loadWorkspace(root);
  const graph = buildImportGraph(ctx);
  printImpactReport(target, graph, config, root);
}

function runHealth(root: string) {
  const { config, ctx } = loadWorkspace(root);
  const graph = buildImportGraph(ctx);
  const health = computeModuleHealth(graph, config.modules, ctx);

  const violations = config.health ? checkHealthThresholds(health, config.health) : [];
  printHealthReport(health, violations);

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
