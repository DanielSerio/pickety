import type {
  ConfigError,
  BoundaryRule,
  Severity,
} from "../shared/types";

import { validateContainedTo } from "./validationContainedTo";

/**
 * Validates the "module-boundaries" section of the config.
 */
export function validateBoundaryRules(
  rules: unknown,
  errors: ConfigError[]
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
    const rulePath = `rules.module-boundaries.rules[${index}]`;
    if (typeof rule !== "object" || rule === null) {
      errors.push({
        message: `Rule #${index} must be an object`,
        path: rulePath,
      });
      return;
    }

    const r = rule as Record<string, unknown>;

    const hasContainedTo =
      typeof r.containedTo === "string" ||
      (typeof r.containedTo === "object" && r.containedTo !== null);
    if (typeof r.importer !== "string" && !hasContainedTo) {
      errors.push({
        message: `Rule #${index}: "importer" or "containedTo" is required`,
        path: rulePath,
      });
    }
    if (r.importer !== undefined && typeof r.importer !== "string") {
      errors.push({
        message: `Rule #${index}: "importer" must be a string`,
        path: `${rulePath}.importer`,
      });
    }
    if (typeof r.imports !== "string") {
      errors.push({
        message: `Rule #${index}: "imports" is required and must be a string`,
        path: `${rulePath}.imports`,
      });
    }
    if (r.allow !== undefined && typeof r.allow !== "boolean") {
      errors.push({
        message: `Rule #${index}: "allow" must be a boolean`,
        path: `${rulePath}.allow`,
      });
    }
    if (r.only !== undefined && typeof r.only !== "boolean") {
      errors.push({
        message: `Rule #${index}: "only" must be a boolean`,
        path: `${rulePath}.only`,
      });
    }

    if (r.containedTo !== undefined) {
      validateContainedTo(r, index, rulePath, errors);
    }

    if (r.message !== undefined && typeof r.message !== "string") {
      errors.push({
        message: `Rule #${index}: "message" must be a string`,
        path: `${rulePath}.message`,
      });
    }
    if (r.severity !== undefined && r.severity !== "error" && r.severity !== "warn") {
      errors.push({
        message: `Rule #${index}: "severity" must be "error" or "warn", got "${r.severity}"`,
        path: `${rulePath}.severity`,
      });
    }
    if (r.name !== undefined && typeof r.name !== "string") {
      errors.push({
        message: `Rule #${index}: "name" must be a string`,
        path: `${rulePath}.name`,
      });
    }
    if (r.maxViolations !== undefined) {
      if (typeof r.maxViolations !== "number" || !Number.isInteger(r.maxViolations) || r.maxViolations < 0) {
        errors.push({
          message: `Rule #${index}: "maxViolations" must be a non-negative integer`,
          path: `${rulePath}.maxViolations`,
        });
      }
    }

    validatedRules.push(r as unknown as BoundaryRule);
  });

  return { severity, rules: validatedRules };
}

