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
    let importPatterns: string[] | undefined;
    if (typeof r.imports === "string") {
      importPatterns = [r.imports];
    } else if (Array.isArray(r.imports)) {
      const invalidIndex = r.imports.findIndex((item) => typeof item !== "string");
      if (invalidIndex !== -1) {
        errors.push({
          message: `Rule #${index}: "imports" entries must be strings`,
          path: `${rulePath}.imports[${invalidIndex}]`,
        });
      } else {
        importPatterns = r.imports as string[];
      }
    } else {
      errors.push({
        message: `Rule #${index}: "imports" is required and must be a string or string[]`,
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
      validateContainedTo({ ruleRecord: r, index, rulePath, errors });
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
    if (r.group !== undefined && typeof r.group !== "string") {
      errors.push({
        message: `Rule #${index}: "group" must be a string`,
        path: `${rulePath}.group`,
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

    let exportsRules: ExportRule | ExportRule[] | undefined;
    if (r.exports !== undefined) {
      if (Array.isArray(r.exports)) {
        const parsed: ExportRule[] = [];
        r.exports.forEach((entry, exportIndex) => {
          const parsedEntry = parseExportRule(entry, `${rulePath}.exports[${exportIndex}]`, errors);
          if (parsedEntry) {
            parsed.push(parsedEntry);
          }
        });
        if (parsed.length > 0) {
          exportsRules = parsed;
        }
      } else {
        const parsedEntry = parseExportRule(r.exports, `${rulePath}.exports`, errors);
        if (parsedEntry) {
          exportsRules = parsedEntry;
        }
      }
    }

    if (importPatterns) {
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
      } else if (typeof r.containedTo === "object" && r.containedTo !== null && typeof (r.containedTo as { path?: unknown; }).path === "string") {
        warnOnUnboundVariables((r.containedTo as { path: string; }).path, `${rulePath}.containedTo.path`, `"containedTo.path"`);
      }
    }

    if (!importPatterns) {
      return;
    }

    const validatedRule: BoundaryRule = {
      imports: typeof r.imports === "string" ? r.imports : importPatterns,
    };

    if (typeof r.importer === "string") {
      validatedRule.importer = r.importer;
    }
    if (typeof r.allow === "boolean") {
      validatedRule.allow = r.allow;
    }
    if (typeof r.only === "boolean") {
      validatedRule.only = r.only;
    }
    if (r.containedTo !== undefined && (typeof r.containedTo === "string" || (typeof r.containedTo === "object" && r.containedTo !== null))) {
      validatedRule.containedTo = r.containedTo as BoundaryRule["containedTo"];
    }
    if (typeof r.message === "string") {
      validatedRule.message = r.message;
    }
    if (r.severity === "error" || r.severity === "warn") {
      validatedRule.severity = r.severity;
    }
    if (typeof r.name === "string") {
      validatedRule.name = r.name;
    }
    if (typeof r.group === "string") {
      validatedRule.group = r.group;
    }
    if (typeof r.maxViolations === "number" && Number.isInteger(r.maxViolations) && r.maxViolations >= 0) {
      validatedRule.maxViolations = r.maxViolations;
    }
    if (exportsRules) {
      validatedRule.exports = exportsRules;
    }

    validatedRules.push(validatedRule);
  });

  return { severity, rules: validatedRules };
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

