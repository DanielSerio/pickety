import * as path from "path";
import { minimatch } from "minimatch";
import type { BoundaryRule, ImportStatement, Severity, Violation } from "../types";

export const CONFIG_FILENAME = "pickety.json";

export const SOURCE_EXTENSIONS = ["ts", "tsx", "js", "jsx", "mjs", "cjs"];
export const SOURCE_GLOB = `**/*.{${SOURCE_EXTENSIONS.join(",")}}`;

/**
 * Normalizes a file path to use forward slashes and consistent drive letter casing on Windows.
 */
export function normalizePath(p: string): string {
  let normalized = p.replace(/\\/g, "/");
  // On Windows, drive letters can be C: or c:. Normalize to lowercase.
  if (/^[a-zA-Z]:/.test(normalized)) {
    normalized = normalized[0].toLowerCase() + normalized.slice(1);
  }
  return normalized;
}

/**
 * Converts an absolute path to a root-relative path with forward slashes.
 */
export function toRelativePath(root: string, filePath: string): string {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

/**
 * Checks if a value matches a pattern (either exactly or via glob).
 */
export function matchesPattern(value: string, pattern: string): boolean {
  return minimatch(value, pattern) || value === pattern;
}

/**
 * Resolves defaults for a boundary rule.
 */
export function resolveRuleDefaults(
  rule: BoundaryRule,
  index: number,
  globalSeverity: Severity
) {
  return {
    allow: rule.allow ?? false,
    severity: rule.severity ?? globalSeverity,
    name: rule.name ?? `rule[${index}]`,
    effectiveImporter: rule.containedTo || rule.importer || "*",
    isOnly: rule.only || !!rule.containedTo,
    isAllowStyle: (rule.allow ?? false) || !!rule.containedTo || rule.only,
  };
}

/**
 * Returns the absolute path to pickety.json for a given root.
 */
export function getConfigPath(root: string): string {
  return path.join(root, CONFIG_FILENAME);
}

/**
 * Formats a health metric value based on its type.
 */
export function formatHealthMetricValue(metric: string, value: number): string {
  return metric === "instability" ? value.toFixed(2) : String(value);
}

/**
 * Helper to create a Violation object consistently.
 */
export function createViolation(
  filePath: string,
  importStmt: ImportStatement,
  ruleName: string,
  message: string,
  severity: Severity,
  sourceModule?: string,
  targetModule?: string
): Violation {
  return {
    file: filePath,
    line: importStmt.line,
    character: importStmt.character,
    length: importStmt.length,
    message: `[${ruleName}] ${message} (importing "${importStmt.specifier}")`,
    severity,
    ruleName,
    sourceModule,
    targetModule,
  };
}

/**
 * Finds all cycles in a directed graph using DFS.
 * Returns an array of cycles, where each cycle is an array of node names.
 */
export function findCycles(graph: Map<string, Set<string>>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function drive(node: string) {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = graph.get(node);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          drive(neighbor);
        } else if (recStack.has(neighbor)) {
          // Cycle detected!
          const cycleStart = path.indexOf(neighbor);
          if (cycleStart !== -1) {
            cycles.push([...path.slice(cycleStart), neighbor]);
          }
        }
      }
    }

    recStack.delete(node);
    path.pop();
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      drive(node);
    }
  }

  return cycles;
}
