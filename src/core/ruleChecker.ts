import type {
  Violation,
  RuleContext,
} from "../shared/types";
import {
  createViolation,
  matchesModuleOrPath,
  NormalizedRule,
} from "./utils";
import {
  findVariables,
} from "./interpolation";
import { checkInterpolatedRule, isExportExempt } from "./interpolatedEnforcement";

/**
 * Checks a single boundary rule against an import.
 */
export function checkRule(
  normalized: NormalizedRule,
  ctx: RuleContext
): Violation | undefined {
  const {
    rule,
    allow,
    severity: ruleSeverity,
    name: ruleName,
    label: ruleLabel,
    group: ruleGroup,
    effectiveImporter,
    isOnly,
    importPatterns,
  } = normalized;

  for (const importsPattern of importPatterns) {
    const variables = findVariables(isOnly ? importsPattern : effectiveImporter);
    if (variables.length > 0) {
      const violation = checkInterpolatedRule(
        {
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
          ctx,
        }
      );
      if (violation) {
        return violation;
      }
      continue;
    }

    // Regular rule: no interpolation variables
    const fromMatches = matchesModuleOrPath(
      ctx.sourceModule,
      ctx.sourceRelativePath,
      effectiveImporter
    );
    const toMatches = matchesModuleOrPath(
      ctx.targetModule,
      ctx.targetRelativePath,
      importsPattern
    );

    if (isOnly) {
      if (toMatches && !fromMatches) {
        if (isExportExempt(rule, ctx)) {
          return undefined;
        }

        const message =
          rule.message ||
          (rule.containedTo
            ? `Import is restricted: "${ctx.targetModule}" is contained to "${effectiveImporter}"`
            : `Module "${ctx.targetModule}" can only be imported by "${effectiveImporter}"`);

        return createViolation({
          filePath: ctx.filePath,
          importStmt: ctx.importStmt,
          ruleName,
          ruleLabel,
          message,
          severity: ruleSeverity,
          sourceModule: ctx.sourceModule,
          targetModule: ctx.targetModule,
          ruleGroup,
        });
      }
    } else if (fromMatches && toMatches && !allow) {
      const message =
        rule.message ||
        `Module "${ctx.sourceModule}" cannot import from "${ctx.targetModule}"`;

      return createViolation({
        filePath: ctx.filePath,
        importStmt: ctx.importStmt,
        ruleName,
        ruleLabel,
        message,
        severity: ruleSeverity,
        sourceModule: ctx.sourceModule,
        targetModule: ctx.targetModule,
        ruleGroup,
      });
    }
  }

  return undefined;
}

