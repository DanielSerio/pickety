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
    label: ruleLabel,
    group: ruleGroup,
    effectiveImporter,
    isOnly,
  } = resolveRuleDefaults(rule, index, globalSeverity);

  const importPatterns = Array.isArray(rule.imports) ? rule.imports : [rule.imports];

  for (const importsPattern of importPatterns) {
    if (typeof importsPattern !== "string") {
      continue;
    }

    const variables = findVariables(isOnly ? importsPattern : effectiveImporter);
    if (variables.length > 0) {
      const violation = checkInterpolatedRule(
        rule,
        importsPattern,
        variables,
        isOnly,
        allow,
        effectiveImporter,
        ruleSeverity,
        ruleName,
        ruleLabel,
        ruleGroup,
        sourceModule,
        sourceRelativePath,
        targetModule,
        targetRelativePath,
        filePath,
        importStmt
      );
      if (violation) {
        return violation;
      }
      continue;
    }

    // Regular rule: no interpolation variables
    const fromMatches = matchesModuleOrPath(sourceModule, sourceRelativePath, effectiveImporter);
    const toMatches = matchesModuleOrPath(targetModule, targetRelativePath, importsPattern);

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
          ruleLabel,
          message,
          ruleSeverity,
          sourceModule,
          targetModule,
          ruleGroup
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
        ruleLabel,
        message,
        ruleSeverity,
        sourceModule,
        targetModule,
        ruleGroup
      );
    }
  }

  return undefined;
}

