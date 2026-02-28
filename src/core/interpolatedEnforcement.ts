import type {
  BoundaryRule,
  Severity,
  Violation,
  RuleContext,
  ExportRule,
} from "../shared/types";
import {
  createViolation,
  getContainedToOptions,
  matchesModuleOrPath
} from "./utils";
import {
  captureVariablesFromPath,
  findVariables,
  replaceVariables
} from "./interpolation";

/**
 * Logic for rules with interpolation variables.
 */
type InterpolatedRuleArgs = {
  rule: BoundaryRule;
  importsPattern: string;
  variables: string[];
  isOnly: boolean;
  allow: boolean;
  effectiveImporter: string;
  ruleSeverity: Severity;
  ruleName: string;
  ruleLabel: string;
  ruleGroup: string | undefined;
  ctx: RuleContext;
};

export function checkInterpolatedRule(
  args: InterpolatedRuleArgs
): Violation | undefined {
  return args.isOnly
    ? evaluateOnlyInterpolatedRule(args)
    : evaluateStandardInterpolatedRule(args);
}

function captureVariablesFromPattern(
  pattern: string,
  variables: string[],
  moduleName: string,
  relativePath: string
): Record<string, string> | undefined {
  const target = pattern.includes("/") ? relativePath : moduleName;
  return captureVariablesFromPath(pattern, target, variables);
}

function evaluateOnlyInterpolatedRule(args: InterpolatedRuleArgs): Violation | undefined {
  const {
    rule,
    importsPattern,
    variables,
    effectiveImporter,
    ruleSeverity,
    ruleName,
    ruleLabel,
    ruleGroup,
    ctx,
  } = args;

  // ONLY rule with interpolation: capture variables from target path
  const captured = captureVariablesFromPattern(
    importsPattern,
    variables,
    ctx.targetModule,
    ctx.targetRelativePath
  );
  if (!captured) {
    return undefined;
  }

  if (isRuleExempt(rule, captured)) {
    return undefined;
  }

  const expectedImporter = replaceVariables(effectiveImporter, variables, captured);
  const sourceMatches = matchesModuleOrPath(ctx.sourceModule, ctx.sourceRelativePath, expectedImporter);

  if (!sourceMatches) {
    if (isExportExempt(rule, ctx, captured)) {
      return undefined;
    }

    const message =
      rule.message ||
      `Module "${ctx.sourceModule}" is not allowed to import from "${ctx.targetModule}" (contained to "${expectedImporter}")`;

    return createViolation(
      ctx.filePath,
      ctx.importStmt,
      ruleName,
      ruleLabel,
      message,
      ruleSeverity,
      ctx.sourceModule,
      ctx.targetModule,
      ruleGroup
    );
  }

  return undefined;
}

function evaluateStandardInterpolatedRule(args: InterpolatedRuleArgs): Violation | undefined {
  const {
    rule,
    importsPattern,
    variables,
    allow,
    effectiveImporter,
    ruleSeverity,
    ruleName,
    ruleLabel,
    ruleGroup,
    ctx,
  } = args;

  // Normal interpolation rule: capture variables from source file path
  const captured = captureVariablesFromPattern(
    effectiveImporter,
    variables,
    ctx.sourceModule,
    ctx.sourceRelativePath
  );
  if (!captured) {
    return undefined;
  }

  if (allow) {
    const generalPattern = replaceVariables(importsPattern, variables, "*");
    const specificPattern = replaceVariables(importsPattern, variables, captured);

    const matchesGeneral = matchesModuleOrPath(ctx.targetModule, ctx.targetRelativePath, generalPattern);
    const matchesSpecific = matchesModuleOrPath(ctx.targetModule, ctx.targetRelativePath, specificPattern);

    if (matchesGeneral && !matchesSpecific) {
      const message = rule.message || `Import must match scoped pattern "${specificPattern}"`;

      return createViolation(
        ctx.filePath,
        ctx.importStmt,
        ruleName,
        ruleLabel,
        message,
        ruleSeverity,
        ctx.sourceModule,
        ctx.targetModule,
        ruleGroup
      );
    }
  } else {
    const specificPattern = replaceVariables(importsPattern, variables, captured);
    const toMatches = matchesModuleOrPath(ctx.targetModule, ctx.targetRelativePath, specificPattern);

    if (toMatches) {
      const message = rule.message || `Module "${ctx.sourceModule}" cannot import from "${ctx.targetModule}"`;

      return createViolation(
        ctx.filePath,
        ctx.importStmt,
        ruleName,
        ruleLabel,
        message,
        ruleSeverity,
        ctx.sourceModule,
        ctx.targetModule,
        ruleGroup
      );
    }
  }

  return undefined;
}

function normalizeExports(exportsRule: ExportRule | ExportRule[] | undefined): ExportRule[] {
  if (!exportsRule) {
    return [];
  }
  return Array.isArray(exportsRule) ? exportsRule : [exportsRule];
}

export function isExportExempt(
  rule: BoundaryRule,
  ctx: RuleContext,
  captured?: Record<string, string>
): boolean {
  const exportsList = normalizeExports(rule.exports);
  if (exportsList.length === 0) {
    return false;
  }

  for (const entry of exportsList) {
    const pathVars = findVariables(entry.path);
    const toVars = findVariables(entry.to);
    const targetCaptured =
      pathVars.length > 0
        ? getCaptureForPattern(entry.path, pathVars, captured, ctx.targetModule, ctx.targetRelativePath)
        : {};

    if (pathVars.length > 0 && !targetCaptured) {
      continue;
    }

    const sourceCaptured =
      toVars.length > 0
        ? getCaptureForPattern(entry.to, toVars, undefined, ctx.sourceModule, ctx.sourceRelativePath)
        : {};

    if (toVars.length > 0 && !sourceCaptured) {
      continue;
    }

    const merged = mergeCaptures(targetCaptured ?? {}, sourceCaptured ?? {});
    if (!merged) {
      continue;
    }

    const exportPath = pathVars.length > 0
      ? replaceVariables(entry.path, pathVars, merged)
      : entry.path;

    if (!matchesModuleOrPath(ctx.targetModule, ctx.targetRelativePath, exportPath)) {
      continue;
    }

    const exportTo = toVars.length > 0
      ? replaceVariables(entry.to, toVars, merged)
      : entry.to;

    if (matchesModuleOrPath(ctx.sourceModule, ctx.sourceRelativePath, exportTo)) {
      return true;
    }
  }

  return false;
}

function getCaptureForPattern(
  pattern: string,
  variables: string[],
  preferred: Record<string, string> | undefined,
  moduleName: string,
  relativePath: string
): Record<string, string> | undefined {
  if (preferred && variables.every((v) => preferred[v] !== undefined)) {
    return preferred;
  }
  return captureVariablesFromPattern(pattern, variables, moduleName, relativePath);
}

function mergeCaptures(
  left: Record<string, string>,
  right: Record<string, string>
): Record<string, string> | undefined {
  const merged: Record<string, string> = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (merged[key] !== undefined && merged[key] !== value) {
      return undefined;
    }
    merged[key] = value;
  }
  return merged;
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
