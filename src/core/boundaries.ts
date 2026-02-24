import * as path from "path";
import { minimatch } from "minimatch";
import {
  matchFileToModule,
  resolveFileImports,
} from "./imports";
import type { PicketyConfig, Violation, Severity, WorkspaceContext } from "../shared/types";
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
  ctx: WorkspaceContext
): Violation[] {
  const violations: Violation[] = [];
  const { modules } = config;
  const { severity, rules } = config.rules["module-boundaries"];
  const { knownFiles: _knownFiles, root, aliases: _aliases } = ctx;

  // Determine which module this file belongs to
  const sourceModule = matchFileToModule(filePath, modules, root);
  if (!sourceModule) {
    return [];
  }

  const sourceRelativePath = normalizePath(path.relative(root, filePath));

  // Resolve all imports in the file
  const resolvedImports = resolveFileImports(
    filePath,
    content,
    ctx
  );

  for (const { statement: importStmt, resolvedPath } of resolvedImports) {
    // Determine which module the imported file belongs to
    const targetModule = matchFileToModule(resolvedPath, modules, root);
    if (!targetModule) {
      continue;
    }

    // Get the target file's relative path for glob matching
    const targetRelativePath = normalizePath(path.relative(root, resolvedPath));
    // Check each boundary rule for a match
    rules.forEach((rule, index) => {
      const {
        allow,
        severity: ruleSeverity,
        name: ruleName,
        effectiveImporter,
        isOnly,
      } = resolveRuleDefaults(rule, index, severity);
      const variables = findVariables(isOnly ? rule.imports : effectiveImporter);

      if (variables.length > 0) {
        if (isOnly) {
          // ONLY rule with interpolation: capture variables from target path
          const captured = captureVariablesFromPath(
            rule.imports,
            targetRelativePath,
            variables
          );
          if (captured) {
            // If containedTo has an `unless` condition, skip when ALL entries match (AND semantics).
            // Empty-entries guard: [].every() is vacuously true, so we require at least one entry.
            if (typeof rule.containedTo === "object" && rule.containedTo.unless) {
              const unlessEntries = Object.entries(rule.containedTo.unless);
              const isExempt =
                unlessEntries.length > 0 &&
                unlessEntries.every(([varName, exemptValue]) => captured[varName] === exemptValue);
              if (isExempt) {
                return;
              }
            }

            const expectedImporter = replaceVariables(
              effectiveImporter,
              variables,
              captured
            );
            const sourceMatches = matchesModuleOrPath(
              sourceModule,
              sourceRelativePath,
              expectedImporter
            );
            if (!sourceMatches) {
              const message =
                rule.message ||
                `Module "${sourceModule}" is not allowed to import from "${targetModule}" (contained to "${expectedImporter}")`;

              violations.push(
                createViolation(
                  filePath,
                  importStmt,
                  ruleName,
                  message,
                  ruleSeverity,
                  sourceModule,
                  targetModule
                )
              );

            }
          }
        } else {
          // Normal interpolation rule: capture variables from source file path
          const captured = captureVariablesFromPath(
            effectiveImporter,
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

            const matchesGeneral = matchesModuleOrPath(
              targetModule,
              targetRelativePath,
              generalPattern
            );
            const matchesSpecific = matchesModuleOrPath(
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
                  message,
                  ruleSeverity,
                  sourceModule,
                  targetModule
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

            const toMatches = matchesModuleOrPath(
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
                  message,
                  ruleSeverity
                )
              );
            }
          }
        }
      } else {
        // Regular rule: no interpolation variables
        const fromMatches = matchesModuleOrPath(sourceModule, sourceRelativePath, effectiveImporter);
        const toMatches = matchesModuleOrPath(targetModule, targetRelativePath, rule.imports);

        if (isOnly) {
          if (toMatches && !fromMatches) {
            const message =
              rule.message ||
              (rule.containedTo
                ? `Import is restricted: "${targetModule}" is contained to "${effectiveImporter}"`
                : `Module "${targetModule}" can only be imported by "${effectiveImporter}"`);

            violations.push(
              createViolation(
                filePath,
                importStmt,
                ruleName,
                message,
                ruleSeverity,
                sourceModule,
                targetModule
              )
            );
          }
        } else if (fromMatches && toMatches && !allow) {
          const message =
            rule.message ||
            `Module "${sourceModule}" cannot import from "${targetModule}"`;

          violations.push(
            createViolation(
              filePath,
              importStmt,
              ruleName,
              message,
              ruleSeverity,
              sourceModule,
              targetModule
            )
          );
        }
      }
    });

  }

  return violations;
}

// Analyzes a file and returns a set of module names it depends on.
export function getModuleDependencies(
  filePath: string,
  content: string,
  config: PicketyConfig,
  ctx: WorkspaceContext
): { sourceModule: string; targetModules: Set<string>; } | undefined {
  const { modules } = config;
  const { root } = ctx;
  const sourceModule = matchFileToModule(filePath, modules, root);
  if (!sourceModule) {
    return undefined;
  }

  const targetModules = new Set<string>();
  const resolvedImports = resolveFileImports(
    filePath,
    content,
    ctx
  );

  for (const { resolvedPath } of resolvedImports) {
    const targetModule = matchFileToModule(resolvedPath, modules, root);
    if (targetModule && targetModule !== sourceModule) {
      targetModules.add(targetModule);
    }
  }

  return { sourceModule, targetModules };
}

// Matches a rule pattern against a module name or relative path.
// If the pattern is a simple name (no `/`), matches against the module name.
// If the pattern contains `/`, also matches against the file's relative path.
function matchesModuleOrPath(
  moduleName: string,
  relativePath: string,
  pattern: string
): boolean {
  // Always try module name match
  if (matchesPattern(moduleName, pattern)) {
    return true;
  }

  // If pattern contains `/`, it's a file path glob — match against relative path
  if (pattern.includes("/")) {
    // Try exact match against relative path
    if (minimatch(relativePath, pattern)) {
      return true;
    }
    // Match against relative path with flexibility for root dirs and subfolders
    if (
      minimatch(relativePath, `**/${pattern}`) ||
      minimatch(relativePath, `**/${pattern}/**`)
    ) {
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
  // ** can match zero segments, so only count non-** segments toward the minimum
  const minStart = 0;
  const nonStarCount = patternSegments.filter((s) => s !== "**").length;
  const maxStart = pathSegments.length - nonStarCount;

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

// Applies maxViolations thresholds across all collected violations.
// Groups violations by rule name, then:
// - If a rule has maxViolations set and the count is within the threshold, downgrade to "warn"
// - If the count exceeds the threshold, escalate all violations for that rule to "error"
export function applyMaxViolations(
  violations: Violation[],
  config: PicketyConfig
): Violation[] {
  const rules = config.rules["module-boundaries"].rules;

  // Build a lookup: ruleName -> maxViolations (only for rules that set it)
  const thresholds = new Map<string, number>();
  rules.forEach((rule, index) => {
    if (rule.maxViolations !== undefined) {
      const name = rule.name ?? `rule[${index}]`;
      thresholds.set(name, rule.maxViolations);
    }
  });

  if (thresholds.size === 0) {
    return violations;
  }

  // Count violations per rule
  const counts = new Map<string, number>();
  for (const v of violations) {
    if (v.ruleName && thresholds.has(v.ruleName)) {
      counts.set(v.ruleName, (counts.get(v.ruleName) ?? 0) + 1);
    }
  }

  // Adjust severity based on threshold
  return violations.map((v) => {
    if (!v.ruleName || !thresholds.has(v.ruleName)) {
      return v;
    }

    const count = counts.get(v.ruleName) ?? 0;
    const threshold = thresholds.get(v.ruleName)!;
    const newSeverity: Severity = count <= threshold ? "warn" : "error";

    if (newSeverity === v.severity) {
      return v;
    }

    return { ...v, severity: newSeverity };
  });
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
    // Use global replace to handle multiple occurrences of the same variable
    const escapedV = v.replace(/\$/g, "\\$");
    result = result.replace(new RegExp(escapedV, "g"), replacement);
  }
  return result;
}
