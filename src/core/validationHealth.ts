import type {
  ConfigError,
  HealthConfig,
} from "../shared/types";

/**
 * Validates the "health" section of the config.
 */
export function validateHealthConfig(
  health: unknown,
  errors: ConfigError[]
): HealthConfig | undefined {
  if (health === undefined) {
    return undefined;
  }

  if (typeof health !== "object" || health === null) {
    errors.push({
      message: '"health" must be an object',
      path: "health",
    });
    return undefined;
  }

  const hObj = health as Record<string, unknown>;
  const result: HealthConfig = {};

  const intThresholds = [
    { key: "maxAfferentCoupling", label: "maxAfferentCoupling" },
    { key: "maxEfferentCoupling", label: "maxEfferentCoupling" },
    { key: "maxDepth", label: "maxDepth" },
  ] as const;

  for (const { key, label } of intThresholds) {
    const val = hObj[key];
    if (val !== undefined) {
      if (typeof val !== "number" || !Number.isInteger(val) || val < 1) {
        errors.push({
          message: `"health.${label}" must be a positive integer`,
          path: `health.${label}`,
        });
      } else {
        result[key] = val;
      }
    }
  }

  if (hObj.maxInstability !== undefined) {
    const val = hObj.maxInstability;
    if (typeof val !== "number" || val < 0 || val > 1) {
      errors.push({
        message: '"health.maxInstability" must be a number between 0 and 1',
        path: "health.maxInstability",
      });
    } else {
      result.maxInstability = val;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
