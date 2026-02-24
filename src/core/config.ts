import * as path from "path";
import * as fs from "fs";
import * as jsonc from "jsonc-parser";
import type {
  ConfigResult,
} from "../shared/types";
import { CONFIG_FILENAME } from "./utils";

import { validateConfig } from "./validation";

/**
 * Loads and validates pickety.json from the given workspace root.
 * Returns a Result type indicating success or a list of validation errors.
 */
export function loadConfig(workspaceRoot: string): ConfigResult {
  const configPath = path.join(workspaceRoot, CONFIG_FILENAME);

  if (!fs.existsSync(configPath)) {
    return {
      ok: false,
      errors: [{ message: `File not found: ${CONFIG_FILENAME}` }],
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
    return validateConfig(parsed);
  } catch (e: unknown) {
    return {
      ok: false,
      errors: [{ message: `Failed to read pickety.json: ${e instanceof Error ? e.message : String(e)}` }],
    };
  }
}
