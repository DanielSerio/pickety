import * as fs from "fs";
import * as path from "path";
import * as jsonc from "jsonc-parser";
import { normalizePath, SKIP_DIRS } from "./utils";

/**
 * Recursively finds all tsconfig*.json files under a directory,
 * up to maxDepth levels deep, skipping common build/dependency directories.
 *
 * Returns files ordered shallower-first by design (files at the current level
 * are collected before recursing into subdirectories).
 */
export function findTsConfigFiles(dir: string, maxDepth: number): string[] {
  if (maxDepth < 0) { return []; }

  const results: string[] = [];
  let entries: fs.Dirent[];

  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  // Collect files at this level first so shallower tsconfigs take precedence
  for (const entry of entries) {
    if (!SKIP_DIRS.has(entry.name) && entry.isFile() && /^tsconfig(\..+)?\.json$/.test(entry.name)) {
      results.push(path.join(dir, entry.name));
    }
  }

  // Then recurse into subdirectories
  for (const entry of entries) {
    if (!SKIP_DIRS.has(entry.name) && entry.isDirectory()) {
      results.push(...findTsConfigFiles(path.join(dir, entry.name), maxDepth - 1));
    }
  }

  return results;
}

/**
 * Loads tsconfig.json and returns path aliases.
 * Searches recursively for tsconfig files to support monorepo layouts
 * where tsconfig.json may live in a subdirectory (e.g. apps/web/tsconfig.json).
 * Aliases are resolved relative to the workspace root so they work with resolveImport.
 *
 * Uses first-write-wins semantics: shallower tsconfig aliases take precedence
 * over deeper ones for the same key.
 */
export function loadTsConfigAliases(
  workspaceRoot: string
): Record<string, string> {
  const aliases: Record<string, string> = {};
  // Hardcoded depth of 4 covers most monorepos. Can be made configurable if needed.
  const tsConfigPaths = findTsConfigFiles(workspaceRoot, 4);

  for (const tsConfigPath of tsConfigPaths) {
    try {
      const raw = fs.readFileSync(tsConfigPath, "utf-8");
      // Use jsonc-parser to handle comments and trailing commas correctly
      const parsed = jsonc.parse(raw);

      const compilerOptions = parsed.compilerOptions;
      if (!compilerOptions?.paths) { continue; }

      // Compute this tsconfig's directory relative to the workspace root so
      // that alias targets are expressed as workspace-root-relative paths.
      const tsConfigDir = path.dirname(tsConfigPath);
      const relDir = path.relative(workspaceRoot, tsConfigDir);
      const baseUrl = compilerOptions.baseUrl || ".";

      for (const [key, values] of Object.entries(compilerOptions.paths)) {
        if (Array.isArray(values) && values.length > 0) {
          const target = values[0] as string;
          // Resolve alias target relative to workspace root. Shallower tsconfigs
          // (found first) take precedence over deeper ones for the same alias key.
          if (!aliases[key]) {
            aliases[key] = normalizePath(path.join(relDir, baseUrl, target));
          }
        }
      }
    } catch {
      // Silently fail for individual tsconfig errors
    }
  }

  return aliases;
}
