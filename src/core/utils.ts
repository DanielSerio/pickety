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
  };
}

/**
 * Helper to create a Violation object consistently.
 */
export function createViolation(
  filePath: string,
  importStmt: ImportStatement,
  ruleName: string,
  message: string,
  severity: Severity
): Violation {
  return {
    file: filePath,
    line: importStmt.line,
    character: importStmt.character,
    length: importStmt.length,
    message: `[${ruleName}] ${message} (importing "${importStmt.specifier}")`,
    severity,
    ruleName,
  };
}
