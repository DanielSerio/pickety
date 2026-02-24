import type {
  BoundaryRule,
  Severity,
  Violation,
  ImportStatement,
} from "../shared/types";
import {
  resolveRuleDefaults,
  createViolation,
  matchesModuleOrPath
} from "./utils";
import {
  findVariables,
} from "./interpolation";
import { checkInterpolatedRule } from "./interpolatedEnforcement";

/**
 * Checks a single boundary rule against an import.
 */
export function checkRule(
  rule: BoundaryRule,
  index: number,
  globalSeverity: Severity,
  sourceModule: string,
  sourceRelativePath: string,
  targetModule: string,
  targetRelativePath: string,
  filePath: string,
  importStmt: ImportStatement
): Violation | undefined {
  const {
    allow,
    severity: ruleSeverity,
    name: ruleName,
    effectiveImporter,
    isOnly,
  } = resolveRuleDefaults(rule, index, globalSeverity);

  const variables = findVariables(isOnly ? rule.imports : effectiveImporter);

  if (variables.length > 0) {
    return checkInterpolatedRule(
      rule,
      variables,
      isOnly,
      allow,
      effectiveImporter,
      ruleSeverity,
      ruleName,
      sourceModule,
      sourceRelativePath,
      targetModule,
      targetRelativePath,
      filePath,
      importStmt
    );
  }

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
  } else if (fromMatches && toMatches && !allow) {
    const message =
      rule.message ||
      `Module "${sourceModule}" cannot import from "${targetModule}"`;

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

  return undefined;
}

