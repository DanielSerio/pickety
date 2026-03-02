import type {
  ConfigError,
} from "../shared/types";

/**
 * Options for validating containedTo property.
 */
export interface ValidateContainedToOptions {
  ruleRecord: Record<string, unknown>;
  index: number;
  rulePath: string;
  errors: ConfigError[];
}

/**
 * Validates the "containedTo" property of a boundary rule.
 */
export function validateContainedTo(options: ValidateContainedToOptions): void {
  const { ruleRecord: r, index, rulePath, errors } = options;
  if (typeof r.containedTo === "object" && r.containedTo !== null) {
    const ct = r.containedTo as Record<string, unknown>;
    if (typeof ct.path !== "string") {
      errors.push({
        message: `Rule #${index}: "containedTo.path" is required and must be a string`,
        path: `${rulePath}.containedTo.path`,
      });
    }
    if (ct.unless !== undefined) {
      if (typeof ct.unless !== "object" || ct.unless === null || Array.isArray(ct.unless)) {
        errors.push({
          message: `Rule #${index}: "containedTo.unless" must be an object`,
          path: `${rulePath}.containedTo.unless`,
        });
      } else {
        const unlessObj = ct.unless as Record<string, unknown>;
        const unlessKeys = Object.keys(unlessObj);

        // `unless: {}` is meaningless — every() on an empty array is vacuously true
        if (unlessKeys.length === 0) {
          errors.push({
            message: `Rule #${index}: "containedTo.unless" must not be empty`,
            path: `${rulePath}.containedTo.unless`,
          });
        }

        // `unless` only works when `imports` has variables to capture
        const imports = Array.isArray(r.imports)
          ? r.imports.filter((item) => typeof item === "string")
          : typeof r.imports === "string"
            ? [r.imports]
            : [];
        const hasVariables = imports.some((pattern) => pattern.match(/\$[\w-]+/));
        if (!hasVariables) {
          errors.push({
            message: `Rule #${index}: "containedTo.unless" requires "imports" to contain at least one $variable`,
            path: `${rulePath}.containedTo.unless`,
          });
        }

        for (const [k, v] of Object.entries(unlessObj)) {
          // Keys must be variable references (start with $)
          if (!k.startsWith("$")) {
            errors.push({
              message: `Rule #${index}: "containedTo.unless" key "${k}" must start with $`,
              path: `${rulePath}.containedTo.unless`,
            });
          }
          // Each value must be a string
          if (typeof v !== "string") {
            errors.push({
              message: `Rule #${index}: "containedTo.unless.${k}" must be a string`,
              path: `${rulePath}.containedTo.unless.${k}`,
            });
          }
        }
      }
    }
  } else if (typeof r.containedTo !== "string") {
    errors.push({
      message: `Rule #${index}: "containedTo" must be a string or object with a "path" property`,
      path: `${rulePath}.containedTo`,
    });
  }
}
