import * as path from "path";
import { minimatch } from "minimatch";
import { extractImports, resolveImport, matchFileToModule } from "./imports";
import type { PicketyConfig, Violation } from "../types";

// Checks a single file for import boundary violations.
// Returns a list of violations with position info for diagnostics.
export function checkBoundaries(
  filePath: string,
  content: string,
  config: PicketyConfig,
  knownFiles: Set<string>,
  root: string,
  aliases: Record<string, string> = {}
): Violation[] {
  const violations: Violation[] = [];
  const { modules } = config;
  const { severity, rules } = config.rules["module-boundaries"];

  // Determine which module this file belongs to
  const sourceModule = matchFileToModule(filePath, modules, root);
  if (!sourceModule) {
    return [];
  }

  const sourceRelativePath = path.relative(root, filePath).replace(/\\/g, "/");

  // Extract all imports from the file content
  const imports = extractImports(content);

  for (const importStmt of imports) {
    // Resolve the import specifier to an absolute file path
    const resolvedPath = resolveImport(
      importStmt.specifier,
      filePath,
      knownFiles,
      root,
      aliases
    );
    if (!resolvedPath) {
      continue;
    }

    // Determine which module the imported file belongs to
    const targetModule = matchFileToModule(resolvedPath, modules, root);
    if (!targetModule) {
      continue;
    }

    // Get the target file's relative path for glob matching
    const targetRelativePath = path
      .relative(root, resolvedPath)
      .replace(/\\/g, "/");

    // Check each boundary rule for a match
    rules.forEach((rule, index) => {
      const allow = rule.allow ?? false;
      const ruleSeverity = rule.severity ?? severity;
      const ruleName = rule.name ?? `rule[${index}]`;
      const variables = findVariables(rule.importer);

      if (variables.length > 0) {
        // Interpolation rule: capture variables from source file path
        const captured = captureVariablesFromPath(
          rule.importer,
          sourceRelativePath,
          variables
        );
        if (!captured) {
          return; // importer pattern doesn't match this file
        }

        if (allow) {
          // allow: true — enforce that imports matching the general pattern
          // also match the specific interpolated pattern
          const generalPattern = replaceVariables(rule.imports, variables, "*");
          const specificPattern = replaceVariables(
            rule.imports,
            variables,
            captured
          );

          const matchesGeneral = matchesTarget(
            targetModule,
            targetRelativePath,
            generalPattern
          );
          const matchesSpecific = matchesTarget(
            targetModule,
            targetRelativePath,
            specificPattern
          );

          if (matchesGeneral && !matchesSpecific) {
            const message =
              rule.message ||
              `Import must match scoped pattern "${specificPattern}"`;

            violations.push({
              file: filePath,
              line: importStmt.line,
              character: importStmt.character,
              length: importStmt.length,
              message: `[${ruleName}] ${message} (importing "${importStmt.specifier}")`,
              severity: ruleSeverity,
              ruleName,
            });
          }
        } else {
          // allow: false — deny imports matching the specific interpolated pattern
          const specificPattern = replaceVariables(
            rule.imports,
            variables,
            captured
          );

          const toMatches = matchesTarget(
            targetModule,
            targetRelativePath,
            specificPattern
          );

          if (toMatches) {
            const message =
              rule.message ||
              `Module "${sourceModule}" cannot import from "${targetModule}"`;

            violations.push({
              file: filePath,
              line: importStmt.line,
              character: importStmt.character,
              length: importStmt.length,
              message: `[${ruleName}] ${message} (importing "${importStmt.specifier}")`,
              severity: ruleSeverity,
              ruleName,
            });
          }
        }
      } else {
        // Regular rule: no interpolation variables
        const fromMatches =
          minimatch(sourceModule, rule.importer) ||
          sourceModule === rule.importer;

        const toMatches = matchesTarget(
          targetModule,
          targetRelativePath,
          rule.imports
        );

        if (fromMatches && toMatches && !allow) {
          const message =
            rule.message ||
            `Module "${sourceModule}" cannot import from "${targetModule}"`;

          violations.push({
            file: filePath,
            line: importStmt.line,
            character: importStmt.character,
            length: importStmt.length,
            message: `[${ruleName}] ${message} (importing "${importStmt.specifier}")`,
            severity: ruleSeverity,
            ruleName,
          });
        }
      }
    });

  }

  return violations;
}

// Matches a rule's `imports` pattern against the target.
// If the pattern is a simple name (no `/`), matches against the module name.
// If the pattern contains `/`, also matches against the resolved file's relative path.
function matchesTarget(
  targetModule: string,
  targetRelativePath: string,
  pattern: string
): boolean {
  // Always try module name match
  if (minimatch(targetModule, pattern) || targetModule === pattern) {
    return true;
  }

  // If pattern contains `/`, it's a file path glob — match against relative path
  if (pattern.includes("/")) {
    // Try exact match against relative path
    if (minimatch(targetRelativePath, pattern)) {
      return true;
    }
    // Try with **/ prefix and /** suffix to handle missing root dirs and filenames
    if (minimatch(targetRelativePath, `**/${pattern}/**`)) {
      return true;
    }
  }

  return false;
}

// Extracts $variable names from a pattern string (e.g., "$route-name" from "routes/$route-name/*")
function findVariables(pattern: string): string[] {
  const matches = pattern.match(/\$[\w-]+/g);
  return matches || [];
}

// Converts a glob pattern with $variables to a regex, matches it against a file path,
// and returns the captured variable values. Returns undefined if no match.
function captureVariablesFromPath(
  pattern: string,
  relativePath: string,
  variables: string[]
): Record<string, string> | undefined {
  let regexStr = pattern;
  const varOrder: string[] = [];

  // Replace $variables with unique placeholders before escaping
  for (const v of variables) {
    regexStr = regexStr.replace(v, `__VAR_${varOrder.length}__`);
    varOrder.push(v);
  }

  // Escape regex special chars (preserve * for glob conversion)
  regexStr = regexStr.replace(/[.+?^{}()|[\]\\]/g, "\\$&");

  // Convert glob patterns to regex (** before *)
  regexStr = regexStr.replace(/\*\*/g, ".*");
  regexStr = regexStr.replace(/\*/g, "[^/]*");

  // Replace placeholders with capture groups
  for (let i = 0; i < varOrder.length; i++) {
    regexStr = regexStr.replace(`__VAR_${i}__`, "([^/]+)");
  }

  // Allow optional prefix (e.g., src/) and optional trailing path segments
  // so "routes/$name" matches "src/routes/auth/index.ts"
  const regex = new RegExp(`(?:^|.+/)${regexStr}(?:/.*)?$`);
  const match = relativePath.match(regex);

  if (!match) {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (let i = 0; i < varOrder.length; i++) {
    result[varOrder[i]] = match[i + 1];
  }
  return result;
}

// Replaces $variables in a pattern with concrete values.
// If `values` is a string, all variables are replaced with that string (used for general patterns).
// If `values` is a record, each variable is replaced with its captured value.
function replaceVariables(
  pattern: string,
  variables: string[],
  values: string | Record<string, string>
): string {
  let result = pattern;
  for (const v of variables) {
    const replacement = typeof values === "string" ? values : values[v];
    result = result.replace(v, replacement);
  }
  return result;
}
