import type {
  ConfigError,
  ConfigResult,
  ConfigWarning,
} from "../shared/types";

import { validateBoundaryRules } from "./validationRules";
import { validateHealthConfig } from "./validationHealth";

/**
 * Validates that the parsed JSON has the required shape for a PicketyConfig.
 * Collects all errors found instead of returning early.
 */
export function validateConfig(parsed: unknown): ConfigResult {
  const errors: ConfigError[] = [];
  const warnings: ConfigWarning[] = [];

  if (typeof parsed !== "object" || parsed === null) {
    return {
      ok: false,
      errors: [{ message: "Configuration must be a JSON object" }],
    };
  }

  const obj = parsed as Record<string, unknown>;

  const modules = validateModules(obj.modules, errors);
  const boundaryConfig = validateBoundaryRules(obj.rules, errors, warnings);
  const boundaryDiagrams = validateBoundaryDiagrams(obj["boundary-diagrams"], errors);
  const health = validateHealthConfig(obj.health, errors);
  const warnOnUntrackedImporters = validateWarnOnUntrackedImporters(obj.warnOnUntrackedImporters, errors);
  const ignore = validateIgnore(obj.ignore, errors);

  if (errors.length > 0 || !modules || !boundaryConfig) {
    return warnings.length > 0
      ? { ok: false, errors, warnings }
      : { ok: false, errors };
  }

  return {
    ok: true,
    config: {
      modules,
      rules: {
        "module-boundaries": boundaryConfig,
      },
      ignore,
      warnOnUntrackedImporters,
      "boundary-diagrams": boundaryDiagrams,
      health,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
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

function validateWarnOnUntrackedImporters(
  val: unknown,
  errors: ConfigError[]
): boolean {
  if (val === undefined) {
    return true;
  }

  if (typeof val !== "boolean") {
    errors.push({
      message: '"warnOnUntrackedImporters" must be a boolean',
      path: "warnOnUntrackedImporters",
    });
    return true;
  }

  return val;
}

function validateIgnore(
  val: unknown,
  errors: ConfigError[]
): string[] | undefined {
  if (val === undefined) {
    return undefined;
  }

  if (!Array.isArray(val)) {
    errors.push({
      message: '"ignore" must be an array of glob patterns',
      path: "ignore",
    });
    return undefined;
  }

  const invalid = val.find((entry) => typeof entry !== "string");
  if (invalid !== undefined) {
    errors.push({
      message: '"ignore" entries must be strings',
      path: "ignore",
    });
    return undefined;
  }

  return val as string[];
}
