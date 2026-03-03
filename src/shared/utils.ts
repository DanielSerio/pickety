import * as path from "path";
import { minimatch } from "minimatch";
import type { Violation } from "./types";

export const CONFIG_FILENAME = "pickety.json";
export const SOURCE_EXTENSIONS = ["ts", "tsx", "js", "jsx", "mjs", "cjs"];
export const SOURCE_GLOB = `**/*.{${SOURCE_EXTENSIONS.join(",")}}`;

export const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "out", "build",
  ".turbo", ".cache", ".nx", "coverage",
]);

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

function hasGlob(pattern: string): boolean {
  const tokens = ["*", "?", "[", "]", "{", "}", "(", ")", "!", "+", "@"];
  return tokens.some((token) => pattern.includes(token));
}

export const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/*.test.{ts,tsx,js,jsx}",
  "**/*.spec.{ts,tsx,js,jsx}",
  "**/*.stories.{ts,tsx,js,jsx}",
  "**/*.config.{ts,tsx,js,jsx,mjs,cjs}",
  ".next/**",
  "dist/**",
  "out/**",
  "build/**",
];

export function isIgnoredPath(
  filePath: string,
  root: string,
  ignore: string[] | undefined
): boolean {
  const allIgnore = [...DEFAULT_IGNORE, ...(ignore || [])];

  const relative = normalizePath(path.relative(root, path.resolve(filePath)));
  if (relative === "" || relative.startsWith("..")) {
    return false;
  }

  return allIgnore.some((raw) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      return false;
    }
    const normalized = normalizePath(trimmed)
      .replace(/^\.?\//, "")
      .replace(/^\/+/, "");
    const patterns = hasGlob(normalized)
      ? [normalized]
      : [normalized, `${normalized}/**`];
    return patterns.some((pattern) =>
      minimatch(relative, pattern) || minimatch(relative, `**/${pattern}`)
    );
  });
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

export function countViolationsBySeverity(violations: Violation[]) {
  let errors = 0;
  let warnings = 0;
  let info = 0;

  for (const v of violations) {
    if (v.severity === "error") {
      errors += 1;
    } else if (v.severity === "warn") {
      warnings += 1;
    } else {
      info += 1;
    }
  }

  return { errors, warnings, info };
}
