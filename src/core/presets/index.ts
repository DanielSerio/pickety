import type { PicketyConfig } from "../../shared/types";
import { featureModulesPreset } from "./feature-modules";
import { hexagonalPreset } from "./hexagonal";
import { layeredPreset } from "./layered";

export type PresetName = "hexagonal" | "feature-modules" | "layered";

const PRESETS: Record<PresetName, PicketyConfig> = {
  hexagonal: hexagonalPreset,
  "feature-modules": featureModulesPreset,
  layered: layeredPreset,
};

export function getPreset(name: string): PicketyConfig | undefined {
  return (PRESETS as Record<string, PicketyConfig>)[name];
}

export function listPresets(): PresetName[] {
  return Object.keys(PRESETS) as PresetName[];
}
