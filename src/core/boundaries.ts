import * as path from "path";
import { minimatch } from "minimatch";
import { extractImports, resolveImport, matchFileToModule } from "./imports";
import type { PicketyConfig, Violation } from "../types";
import {
  normalizePath,
  matchesPattern,
  resolveRuleDefaults,
  createViolation
} from "./utils";

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

  const sourceRelativePath = normalizePath(path.relative(root, filePath));

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
    const targetRelativePath = normalizePath(path.relative(root, resolvedPath));
    // Check each boundary rule for a match
    rules.forEach((rule, index) => {
      const { allow, severity: ruleSeverity, name: ruleName } = resolveRuleDefaults(rule, index, severity);
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

            violations.push(
              createViolation(
                filePath,
                importStmt,
                ruleName,
                rule.message || `Import must match scoped pattern "${specificPattern}"`,
                ruleSeverity
              )
            );
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

            violations.push(
              createViolation(
                filePath,
                importStmt,
                ruleName,
                rule.message || `Module "${sourceModule}" cannot import from "${targetModule}"`,
                ruleSeverity
              )
            );
          }
        }
      } else {
        // Regular rule: no interpolation variables
        const fromMatches = matchesPattern(sourceModule, rule.importer);

        const toMatches = matchesTarget(
          targetModule,
          targetRelativePath,
          rule.imports
        );

        if (fromMatches && toMatches && !allow) {
          const message =
            rule.message ||
            `Module "${sourceModule}" cannot import from "${targetModule}"`;

          violations.push(
            createViolation(
              filePath,
              importStmt,
              ruleName,
              rule.message || `Module "${sourceModule}" cannot import from "${targetModule}"`,
              ruleSeverity
            )
          );
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
  if (matchesPattern(targetModule, pattern)) {
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

// Matches a glob pattern with $variables against a file path using segment-based
// matching. Avoids regex with multiple .* quantifiers to prevent ReDoS.
// Returns captured variable values, or undefined if no match.
function captureVariablesFromPath(
  pattern: string,
  relativePath: string,
  variables: string[]
): Record<string, string> | undefined {
  // Split pattern and path into segments for iterative matching
  const patternSegments = pattern.split("/");
  const pathSegments = relativePath.split("/");

  // Try matching at every possible starting offset in the path
  // (pattern "routes/$name" should match "src/routes/auth/index.ts")
  const minStart = 0;
  const maxStart = pathSegments.length - patternSegments.length;

  for (let start = minStart; start <= maxStart; start++) {
    const captured = tryMatchSegments(patternSegments, pathSegments, start, variables);
    if (captured) {
      return captured;
    }
  }

  return undefined;
}

// Attempts to match pattern segments against path segments starting at a given offset.
// Returns captured variables on success, undefined on failure.
function tryMatchSegments(
  patternSegments: string[],
  pathSegments: string[],
  startOffset: number,
  variables: string[]
): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  let pathIdx = startOffset;

  for (let i = 0; i < patternSegments.length; i++) {
    const seg = patternSegments[i];

    if (seg === "**") {
      // ** matches zero or more segments. Try each possible endpoint.
      const remaining = patternSegments.slice(i + 1);
      if (remaining.length === 0) {
        // ** at end matches everything remaining
        return result;
      }
      // Try matching the rest of the pattern at every remaining position
      for (let skip = pathIdx; skip <= pathSegments.length - remaining.length; skip++) {
        const subResult = tryMatchSegments(remaining, pathSegments, skip, variables);
        if (subResult) {
          return { ...result, ...subResult };
        }
      }
      return undefined;
    }

    if (pathIdx >= pathSegments.length) {
      return undefined;
    }

    // Build a regex for this single segment (no .* — only [^/]+ and [^/]*)
    let segRegex = seg;
    const varOrder: string[] = [];

    // Replace $variables with placeholders
    for (const v of variables) {
      if (segRegex.includes(v)) {
        segRegex = segRegex.replace(v, `__VAR_${varOrder.length}__`);
        varOrder.push(v);
      }
    }

    // Escape regex special chars, preserving * for glob conversion
    segRegex = segRegex.replace(/[.+?^{}()|[\]\\]/g, "\\$&");
    // Single * matches any non-slash characters within one segment
    segRegex = segRegex.replace(/\*/g, "[^/]*");

    // Replace placeholders with capture groups
    for (let j = 0; j < varOrder.length; j++) {
      segRegex = segRegex.replace(`__VAR_${j}__`, "([^/]+)");
    }

    const match = pathSegments[pathIdx].match(new RegExp(`^${segRegex}$`));
    if (!match) {
      return undefined;
    }

    // Collect captured variables from this segment
    for (let j = 0; j < varOrder.length; j++) {
      result[varOrder[j]] = match[j + 1];
    }

    pathIdx++;
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
