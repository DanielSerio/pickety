import type {
  ConfigError,
  ConfigWarning,
  BoundaryRule,
  ExportRule,
  Severity,
} from "../shared/types";

import { validateContainedTo } from "./validationContainedTo";
import { collectVariables, findVariables } from "./interpolation";

/**
 * Validates the "module-boundaries" section of the config.
 */
export function validateBoundaryRules(
  rules: unknown,
  errors: ConfigError[],
  warnings: ConfigWarning[]
): { severity: Severity; rules: BoundaryRule[]; } | undefined {
  if (rules === undefined) {
    errors.push({
      message: '"rules" is required and must be an object',
      path: "rules",
    });
    return undefined;
  }

  if (typeof rules !== "object" || rules === null) {
    errors.push({ message: '"rules" must be an object', path: "rules" });
    return undefined;
  }

  const rulesObj = rules as Record<string, unknown>;
  const boundaries = rulesObj["module-boundaries"];

  if (boundaries === undefined) {
    errors.push({
      message: '"rules.module-boundaries" is required and must be an object',
      path: "rules.module-boundaries",
    });
    return undefined;
  }

  if (typeof boundaries !== "object" || boundaries === null) {
    errors.push({
      message: '"rules.module-boundaries" must be an object',
      path: "rules.module-boundaries",
    });
    return undefined;
  }

  const bObj = boundaries as Record<string, unknown>;
  let severity: Severity = "error";

  if (bObj.severity !== undefined) {
    if (bObj.severity !== "error" && bObj.severity !== "warn") {
      errors.push({
        message: `"rules.module-boundaries.severity" must be "error" or "warn", got "${bObj.severity}"`,
        path: "rules.module-boundaries.severity",
      });
    } else {
      severity = bObj.severity;
    }
  }

  if (bObj.rules === undefined) {
    errors.push({
      message: '"rules.module-boundaries.rules" is required and must be an array',
      path: "rules.module-boundaries.rules",
    });
    return undefined;
  }

  if (!Array.isArray(bObj.rules)) {
    errors.push({
      message: '"rules.module-boundaries.rules" must be an array',
      path: "rules.module-boundaries.rules",
    });
    return undefined;
  }

  const validatedRules: BoundaryRule[] = [];
  bObj.rules.forEach((rule, index) => {
    const validatedRule = validateSingleRule({ rule, index, errors, warnings });
    if (validatedRule) {
      validatedRules.push(validatedRule);
    }
  });

  return { severity, rules: validatedRules };
}

/**
 * Validates a single boundary rule object.
 */
function validateSingleRule(options: {
  rule: unknown;
  index: number;
  errors: ConfigError[];
  warnings: ConfigWarning[];
}): BoundaryRule | undefined {
  const { rule, index, errors, warnings } = options;
  const rulePath = `rules.module-boundaries.rules[${index}]`;
  if (typeof rule !== "object" || rule === null) {
    errors.push({ message: `Rule #${index} must be an object`, path: rulePath });
    return undefined;
  }

  const r = rule as Record<string, unknown>;

  // 1. Mandatory fields: importer/containedTo and imports
  const importer = validateImporter({ r, index, rulePath, errors });
  const imports = validateImports({ r, index, rulePath, errors });
  if (!imports) {
    return undefined;
  }

  // 2. Optional behavioral fields
  const validatedRule: BoundaryRule = { imports };

  if (importer !== undefined) {
    validatedRule.importer = importer;
  }
  if (typeof r.allow === "boolean") {
    validatedRule.allow = r.allow;
  }
  if (typeof r.only === "boolean") {
    validatedRule.only = r.only;
  }
  if (r.containedTo !== undefined) {
    validateContainedTo({ ruleRecord: r, index, rulePath, errors });
    validatedRule.containedTo = r.containedTo as BoundaryRule["containedTo"];
  }

  // 3. Metadata fields (severity, name, message, etc)
  validateRuleMetadata({ r, index, rulePath, errors, result: validatedRule });

  // 4. Exports
  const exportsRules = validateExportRules(r, rulePath, errors);
  if (exportsRules) {
    validatedRule.exports = exportsRules;
  }

  // 5. Cross-field variable validation
  checkVariableBindings({ r, index, rulePath, imports, warnings });

  return validatedRule;
}

function validateImporter(options: {
  r: Record<string, unknown>;
  index: number;
  rulePath: string;
  errors: ConfigError[];
}): string | undefined {
  const { r, index, rulePath, errors } = options;
  const hasContainedTo =
    typeof r.containedTo === "string" ||
    (typeof r.containedTo === "object" && r.containedTo !== null);

  if (typeof r.importer !== "string" && !hasContainedTo) {
    errors.push({
      message: `Rule #${index}: "importer" or "containedTo" is required`,
      path: rulePath,
    });
  }

  if (r.importer !== undefined) {
    if (typeof r.importer !== "string") {
      errors.push({
        message: `Rule #${index}: "importer" must be a string`,
        path: `${rulePath}.importer`,
      });
      return undefined;
    }
    return r.importer;
  }

  return undefined;
}

function validateImports(options: {
  r: Record<string, unknown>;
  index: number;
  rulePath: string;
  errors: ConfigError[];
}): string | string[] | undefined {
  const { r, index, rulePath, errors } = options;
  if (typeof r.imports === "string") {
    return r.imports;
  }

  if (Array.isArray(r.imports)) {
    const invalidIndex = r.imports.findIndex((item) => typeof item !== "string");
    if (invalidIndex !== -1) {
      errors.push({
        message: `Rule #${index}: "imports" entries must be strings`,
        path: `${rulePath}.imports[${invalidIndex}]`,
      });
      return undefined;
    }
    return r.imports as string[];
  }

  errors.push({
    message: `Rule #${index}: "imports" is required and must be a string or string[]`,
    path: `${rulePath}.imports`,
  });
  return undefined;
}

function validateRuleMetadata(options: {
  r: Record<string, unknown>;
  index: number;
  rulePath: string;
  errors: ConfigError[];
  result: BoundaryRule;
}) {
  const { r, index, rulePath, errors, result } = options;
  if (r.allow !== undefined && typeof r.allow !== "boolean") {
    errors.push({ message: `Rule #${index}: "allow" must be a boolean`, path: `${rulePath}.allow` });
  }
  if (r.only !== undefined && typeof r.only !== "boolean") {
    errors.push({ message: `Rule #${index}: "only" must be a boolean`, path: `${rulePath}.only` });
  }
  if (r.message !== undefined) {
    if (typeof r.message !== "string") {
      errors.push({ message: `Rule #${index}: "message" must be a string`, path: `${rulePath}.message` });
    } else {
      result.message = r.message;
    }
  }
  if (r.severity !== undefined) {
    if (r.severity !== "error" && r.severity !== "warn") {
      errors.push({
        message: `Rule #${index}: "severity" must be "error" or "warn", got "${r.severity}"`,
        path: `${rulePath}.severity`,
      });
    } else {
      result.severity = r.severity;
    }
  }
  if (r.name !== undefined) {
    if (typeof r.name !== "string") {
      errors.push({ message: `Rule #${index}: "name" must be a string`, path: `${rulePath}.name` });
    } else {
      result.name = r.name;
    }
  }
  if (r.group !== undefined) {
    if (typeof r.group !== "string") {
      errors.push({ message: `Rule #${index}: "group" must be a string`, path: `${rulePath}.group` });
    } else {
      result.group = r.group;
    }
  }
  if (r.maxViolations !== undefined) {
    if (typeof r.maxViolations !== "number" || !Number.isInteger(r.maxViolations) || r.maxViolations < 0) {
      errors.push({
        message: `Rule #${index}: "maxViolations" must be a non-negative integer`,
        path: `${rulePath}.maxViolations`,
      });
    } else {
      result.maxViolations = r.maxViolations;
    }
  }
}

function validateExportRules(
  r: Record<string, unknown>,
  rulePath: string,
  errors: ConfigError[]
): ExportRule | ExportRule[] | undefined {
  if (r.exports === undefined) {
    return undefined;
  }

  if (Array.isArray(r.exports)) {
    const parsed: ExportRule[] = [];
    r.exports.forEach((entry, exportIndex) => {
      const parsedEntry = parseExportRule(entry, `${rulePath}.exports[${exportIndex}]`, errors);
      if (parsedEntry) {
        parsed.push(parsedEntry);
      }
    });
    return parsed.length > 0 ? parsed : undefined;
  }

  return parseExportRule(r.exports, `${rulePath}.exports`, errors);
}

function checkVariableBindings(options: {
  r: Record<string, unknown>;
  index: number;
  rulePath: string;
  imports: string | string[];
  warnings: ConfigWarning[];
}) {
  const { r, index, rulePath, imports, warnings } = options;
  const importPatterns = Array.isArray(imports) ? imports : [imports];
  const importVars = new Set(collectVariables(importPatterns));

  const warnOnUnboundVariables = (pattern: string, path: string, label: string) => {
    const vars = findVariables(pattern);
    const unbound = vars.filter((v) => !importVars.has(v));
    if (unbound.length > 0) {
      const unique = Array.from(new Set(unbound));
      warnings.push({
        message: `Rule #${index}: ${label} references variables not present in "imports": ${unique.join(", ")}`,
        path,
      });
    }
  };

  if (typeof r.importer === "string") {
    warnOnUnboundVariables(r.importer, `${rulePath}.importer`, `"importer"`);
  }

  if (typeof r.containedTo === "string") {
    warnOnUnboundVariables(r.containedTo, `${rulePath}.containedTo`, `"containedTo"`);
  } else if (
    typeof r.containedTo === "object" &&
    r.containedTo !== null &&
    typeof (r.containedTo as { path?: unknown; }).path === "string"
  ) {
    warnOnUnboundVariables((r.containedTo as { path: string; }).path, `${rulePath}.containedTo.path`, `"containedTo.path"`);
  }
}



function parseExportRule(
  value: unknown,
  path: string,
  errors: ConfigError[]
): ExportRule | undefined {
  if (typeof value !== "object" || value === null) {
    errors.push({
      message: `"${path}" must be an object`,
      path,
    });
    return undefined;
  }

  const entry = value as Record<string, unknown>;
  let hasError = false;

  if (typeof entry.path !== "string") {
    errors.push({
      message: `"${path}.path" is required and must be a string`,
      path: `${path}.path`,
    });
    hasError = true;
  }

  if (typeof entry.to !== "string") {
    errors.push({
      message: `"${path}.to" is required and must be a string`,
      path: `${path}.to`,
    });
    hasError = true;
  }

  if (entry.message !== undefined && typeof entry.message !== "string") {
    errors.push({
      message: `"${path}.message" must be a string`,
      path: `${path}.message`,
    });
    hasError = true;
  }

  if (hasError) {
    return undefined;
  }

  return {
    path: entry.path as string,
    to: entry.to as string,
    message: typeof entry.message === "string" ? entry.message : undefined,
  };
}

