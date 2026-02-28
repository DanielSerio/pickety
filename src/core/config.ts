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

function mergePresetConfig(
  preset: PicketyConfig,
  override: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...preset,
    ...override,
  };

  if (override.modules === undefined) {
    merged.modules = preset.modules;
  } else if (isRecord(override.modules)) {
    merged.modules = {
      ...preset.modules,
      ...override.modules,
    };
  } else {
    merged.modules = override.modules;
  }

  if (override.rules === undefined) {
    merged.rules = preset.rules;
  } else if (!isRecord(override.rules)) {
    merged.rules = override.rules;
  } else {
    const overrideRules = override.rules as Record<string, unknown>;
    const overrideBoundaries = overrideRules["module-boundaries"];

    if (overrideBoundaries === undefined) {
      merged.rules = override.rules;
    } else if (!isRecord(overrideBoundaries)) {
      merged.rules = override.rules;
    } else {
      const presetBoundaries = preset.rules["module-boundaries"];
      const presetRules = Array.isArray(presetBoundaries.rules) ? presetBoundaries.rules : [];
      const mergedBoundaries: Record<string, unknown> = {
        ...presetBoundaries,
        ...overrideBoundaries,
      };

      if (overrideBoundaries.rules === undefined) {
        mergedBoundaries.rules = presetRules;
      } else if (Array.isArray(overrideBoundaries.rules)) {
        mergedBoundaries.rules = [...presetRules, ...overrideBoundaries.rules];
      } else {
        mergedBoundaries.rules = overrideBoundaries.rules;
      }

      merged.rules = {
        ...preset.rules,
        ...overrideRules,
        "module-boundaries": mergedBoundaries,
      };
    }
  }

  if (override.warnOnUntrackedImporters !== undefined) {
    merged.warnOnUntrackedImporters = override.warnOnUntrackedImporters;
  } else if (preset.warnOnUntrackedImporters !== undefined) {
    merged.warnOnUntrackedImporters = preset.warnOnUntrackedImporters;
  }

  if (override["boundary-diagrams"] !== undefined) {
    merged["boundary-diagrams"] = override["boundary-diagrams"];
  } else if (preset["boundary-diagrams"] !== undefined) {
    merged["boundary-diagrams"] = preset["boundary-diagrams"];
  }

  merged.health = mergeHealthConfig(preset.health, override.health);

  if (override.version !== undefined) {
    merged.version = override.version;
  } else if (preset.version !== undefined) {
    merged.version = preset.version;
  }

  return merged;
}
