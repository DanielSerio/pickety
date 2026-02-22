import * as vscode from "vscode";
import type { PicketyConfig } from "../shared/types";

/**
 * Ensures that a configuration is available.
 * If not, shows an error message and returns false.
 */
export function requireConfig(config: PicketyConfig | undefined): config is PicketyConfig {
  if (!config) {
    vscode.window.showErrorMessage(
      "Pickety: No active configuration. Check pickety.json for errors."
    );
    return false;
  }
  return true;
}
