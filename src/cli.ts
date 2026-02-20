#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { loadConfig, loadTsConfigAliases } from "./core/config";
import { checkBoundaries } from "./core/boundaries";
import { SOURCE_EXTENSIONS, normalizePath } from "./core/utils";
import type { Violation } from "./types";

/**
 * Parses CLI arguments into a structured options object.
 * Supports: pickety check [--root <path>]
 */
function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const command = args[0];
  let root = process.cwd();

  const rootFlagIndex = args.indexOf("--root");
  if (rootFlagIndex !== -1 && args[rootFlagIndex + 1]) {
    root = path.resolve(args[rootFlagIndex + 1]);
  }

  return { command, root };
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
  console.log("Usage: pickety check [--root <path>]");
  console.log("");
  console.log("Commands:");
  console.log("  check    Check all files for boundary violations");
  console.log("");
  console.log("Options:");
  console.log("  --root   Workspace root (defaults to current directory)");
}

function main() {
  const { command, root } = parseArgs(process.argv);

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    process.exit(0);
  }

  if (command !== "check") {
    console.error(`Unknown command: "${command}"`);
    printUsage();
    process.exit(1);
  }

  // Load configuration
  const result = loadConfig(root);
  if (!result.ok) {
    console.error("Configuration errors:");
    for (const err of result.errors) {
      console.error(`  ${err.message}${err.path ? ` (at ${err.path})` : ""}`);
    }
    process.exit(1);
  }

  const config = result.config;
  const aliases = loadTsConfigAliases(root);
  const knownFiles = discoverFiles(root);

  // Check each file for violations
  const allViolations: Violation[] = [];

  for (const filePath of knownFiles) {
    const content = fs.readFileSync(filePath, "utf-8");
    const violations = checkBoundaries(filePath, content, config, knownFiles, root, aliases);
    allViolations.push(...violations);
  }

  // Print results
  if (allViolations.length === 0) {
    console.log("No boundary violations found.");
    process.exit(0);
  }

  for (const v of allViolations) {
    console.log(formatViolation(v, root));
  }

  const errorCount = allViolations.filter((v) => v.severity === "error").length;
  const warnCount = allViolations.filter((v) => v.severity === "warn").length;

  console.log("");
  console.log(`Found ${allViolations.length} violation(s): ${errorCount} error(s), ${warnCount} warning(s)`);

  // Exit with error code if any errors (not just warnings)
  process.exit(errorCount > 0 ? 1 : 0);
}

main();
