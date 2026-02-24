import type {
  BoundaryRule,
  Severity,
  Violation,
  ImportStatement,
} from "../shared/types";
import {
  createViolation,
  getContainedToOptions,
  matchesModuleOrPath
} from "./utils";
import {
  captureVariablesFromPath,
  replaceVariables
} from "./interpolation";

/**
 * Logic for rules with interpolation variables.
 */
export function checkInterpolatedRule(
  rule: BoundaryRule,
  variables: string[],
  isOnly: boolean,
  allow: boolean,
  effectiveImporter: string,
  ruleSeverity: Severity,
  ruleName: string,
  sourceModule: string,
  sourceRelativePath: string,
  targetModule: string,
  targetRelativePath: string,
  filePath: string,
  importStmt: ImportStatement
): Violation | undefined {
  if (isOnly) {
    // ONLY rule with interpolation: capture variables from target path
    const captured = captureVariablesFromPath(
      rule.imports,
      targetRelativePath,
      variables
    );
    if (captured) {
      if (isRuleExempt(rule, captured)) {
        return undefined;
      }

      const expectedImporter = replaceVariables(effectiveImporter, variables, captured);
      const sourceMatches = matchesModuleOrPath(sourceModule, sourceRelativePath, expectedImporter);

      if (!sourceMatches) {
        const message =
          rule.message ||
          `Module "${sourceModule}" is not allowed to import from "${targetModule}" (contained to "${expectedImporter}")`;

        return createViolation(
          filePath,
          importStmt,
          ruleName,
          message,
          ruleSeverity,
          sourceModule,
          targetModule
        );
      }
    }
  } else {
    // Normal interpolation rule: capture variables from source file path
    const captured = captureVariablesFromPath(effectiveImporter, sourceRelativePath, variables);
    if (!captured) {
      return undefined;
    }

    if (allow) {
      const generalPattern = replaceVariables(rule.imports, variables, "*");
      const specificPattern = replaceVariables(rule.imports, variables, captured);

      const matchesGeneral = matchesModuleOrPath(targetModule, targetRelativePath, generalPattern);
      const matchesSpecific = matchesModuleOrPath(targetModule, targetRelativePath, specificPattern);

      if (matchesGeneral && !matchesSpecific) {
        const message = rule.message || `Import must match scoped pattern "${specificPattern}"`;

        return createViolation(
          filePath,
          importStmt,
          ruleName,
          message,
          ruleSeverity,
          sourceModule,
          targetModule
        );
      }
    } else {
      const specificPattern = replaceVariables(rule.imports, variables, captured);
      const toMatches = matchesModuleOrPath(targetModule, targetRelativePath, specificPattern);

      if (toMatches) {
        const message = rule.message || `Module "${sourceModule}" cannot import from "${targetModule}"`;

        return createViolation(
          filePath,
          importStmt,
          ruleName,
          message,
          ruleSeverity,
          sourceModule,
          targetModule
        );
      }
    }
  }

  return undefined;
}

/**
 * Determines if a rule is exempt based on captured variables.
 */
function isRuleExempt(rule: BoundaryRule, captured: Record<string, string>): boolean {
  const ct = getContainedToOptions(rule);
  if (ct && ct.unless) {
    const unlessEntries = Object.entries(ct.unless);
    return (
      unlessEntries.length > 0 &&
      unlessEntries.every(([varName, exemptValue]) => captured[varName] === exemptValue)
    );
  }
  return false;
}
