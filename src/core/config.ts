import * as path from "path";
import * as fs from "fs";
import * as jsonc from "jsonc-parser";
import type {
  ConfigResult,
  PicketyConfig,
  HealthConfig,
} from "../shared/types";
import { CONFIG_FILENAME } from "./utils";
import { getPreset, listPresets } from "./presets";

import { validateConfig } from "./validation";

/**
 * Loads and validates pickety.json from the given workspace root.
 * Returns a Result type indicating success or a list of validation errors.
 */
export function loadConfig(workspaceRoot: string): ConfigResult {
  const configPath = path.join(workspaceRoot, CONFIG_FILENAME);

  if (!fs.existsSync(configPath)) {
    return {
      ok: true,
      config: undefined,
    };
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    let parsed: unknown;
    try {
      // Use jsonc-parser to support comments and trailing commas in pickety.json
      parsed = jsonc.parse(raw);
    } catch (e: unknown) {
      return {
        ok: false,
        errors: [{ message: `pickety.json is not valid JSONC: ${e instanceof Error ? e.message : String(e)}` }],
      };
    }
    if (typeof parsed === "object" && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      if (obj.preset !== undefined && typeof obj.preset !== "string") {
        return {
          ok: false,
          errors: [{ message: '"preset" must be a string', path: "preset" }],
        };
      }
      if (typeof obj.preset === "string") {
        const presetConfig = getPreset(obj.preset);
        if (!presetConfig) {
          return {
            ok: false,
            errors: [{
              message: `Unknown preset "${obj.preset}". Available presets: ${listPresets().join(", ")}`,
              path: "preset",
            }],
          };
        }
        parsed = mergePresetConfig(presetConfig, obj);
      }
    }
    return validateConfig(parsed);
  } catch (e: unknown) {
    return {
      ok: false,
      errors: [{ message: `Failed to read pickety.json: ${e instanceof Error ? e.message : String(e)}` }],
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mergeHealthConfig(
  preset: HealthConfig | undefined,
  override: unknown
): unknown {
  if (override === undefined) {
    return preset;
  }
  if (!isRecord(override)) {
    return override;
  }
  if (!preset) {
    return override;
  }
  return { ...preset, ...override };
}

interface MergeOptionalFieldsOptions {
  merged: Record<string, unknown>;
  preset: Record<string, unknown>;
  override: Record<string, unknown>;
  keys: string[];
}

function mergeOptionalFields(options: MergeOptionalFieldsOptions) {
  const { merged, preset, override, keys } = options;
  for (const key of keys) {
    if (override[key] !== undefined) {
      merged[key] = override[key];
    } else if (preset[key] !== undefined) {
      merged[key] = preset[key];
    }
  }
}

function mergeModules(
  presetModules: PicketyConfig["modules"],
  overrideModules: unknown
): unknown {
  if (overrideModules === undefined) {
    return presetModules;
  }
  if (isRecord(overrideModules)) {
    return {
      ...presetModules,
      ...overrideModules,
    };
  }
  return overrideModules;
}

function mergeRules(
  presetRules: PicketyConfig["rules"],
  overrideRules: unknown
): unknown {
  if (overrideRules === undefined) {
    return presetRules;
  }
  if (!isRecord(overrideRules)) {
    return overrideRules;
  }

  const overrideBoundaries = overrideRules["module-boundaries"];
  if (!isRecord(overrideBoundaries)) {
    return overrideRules;
  }

  const mergedRules: Record<string, unknown> = {
    ...presetRules,
    ...overrideRules,
  };

  const presetBoundaries = presetRules["module-boundaries"];
  const mergedBoundaries: Record<string, unknown> = {
    ...presetBoundaries,
    ...overrideBoundaries,
  };

  const presetBoundaryRules = Array.isArray(presetBoundaries.rules) ? presetBoundaries.rules : [];
  if (overrideBoundaries.rules === undefined) {
    mergedBoundaries.rules = presetBoundaryRules;
  } else if (Array.isArray(overrideBoundaries.rules)) {
    mergedBoundaries.rules = [...presetBoundaryRules, ...overrideBoundaries.rules];
  } else {
    mergedBoundaries.rules = overrideBoundaries.rules;
  }

  mergedRules["module-boundaries"] = mergedBoundaries;
  return mergedRules;
}

function mergePresetConfig(
  preset: PicketyConfig,
  override: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...preset,
    ...override,
  };

  merged.modules = mergeModules(preset.modules, override.modules);
  merged.rules = mergeRules(preset.rules, override.rules);

  const presetRecord = preset as unknown as Record<string, unknown>;
  mergeOptionalFields({
    merged,
    preset: presetRecord,
    override,
    keys: ["warnOnUntrackedImporters", "boundary-diagrams", "ignore", "version"]
  });

  merged.health = mergeHealthConfig(preset.health, override.health);

  return merged;
}
