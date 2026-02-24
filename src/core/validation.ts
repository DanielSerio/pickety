import type {
  ConfigError,
  ConfigResult,
} from "../shared/types";

import { validateBoundaryRules } from "./validationRules";
import { validateHealthConfig } from "./validationHealth";

/**
 * Validates that the parsed JSON has the required shape for a PicketyConfig.
 * Collects all errors found instead of returning early.
 */
export function validateConfig(parsed: unknown): ConfigResult {
  const errors: ConfigError[] = [];

  if (typeof parsed !== "object" || parsed === null) {
    return {
      ok: false,
      errors: [{ message: "Configuration must be a JSON object" }],
    };
  }

  const obj = parsed as Record<string, unknown>;

  const modules = validateModules(obj.modules, errors);
  const boundaryConfig = validateBoundaryRules(obj.rules, errors);
  const boundaryDiagrams = validateBoundaryDiagrams(obj["boundary-diagrams"], errors);
  const health = validateHealthConfig(obj.health, errors);

  if (errors.length > 0 || !modules || !boundaryConfig) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    config: {
      modules,
      rules: {
        "module-boundaries": boundaryConfig,
      },
      "boundary-diagrams": boundaryDiagrams,
      health,
    },
  };
}

function validateModules(
  modules: unknown,
  errors: ConfigError[]
): Record<string, string> | undefined {
  if (modules === undefined) {
    errors.push({
      message: '"modules" is required and must be an object',
      path: "modules",
    });
    return undefined;
  }

  if (typeof modules !== "object" || modules === null) {
    errors.push({
      message: '"modules" must be an object mapping module names to patterns',
      path: "modules",
    });
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(modules)) {
    if (typeof value !== "string") {
      errors.push({
        message: `Module "${key}" pattern must be a string, got ${typeof value}`,
        path: `modules.${key}`,
      });
    } else {
      result[key] = value;
    }
  }
  return result;
}

function validateBoundaryDiagrams(
  val: unknown,
  errors: ConfigError[]
): boolean | string | undefined {
  if (val !== undefined) {
    if (typeof val !== "boolean" && typeof val !== "string") {
      errors.push({
        message: '"boundary-diagrams" must be a boolean or a string',
        path: "boundary-diagrams",
      });
      return undefined;
    }
    return val as boolean | string;
  }
  return undefined;
}
