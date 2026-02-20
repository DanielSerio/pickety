import * as path from "path";
import * as fs from "fs";
import type {
  PicketyConfig,
  ConfigResult,
  ConfigError,
  Severity,
} from "../types";

const CONFIG_FILENAME = "pickety.json";

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
      parsed = JSON.parse(raw);
    } catch (e: any) {
      return {
        ok: false,
        errors: [{ message: `pickety.json is not valid JSON: ${e.message}` }],
      };
    }
    return validateConfig(parsed);
  } catch (e: any) {
    return {
      ok: false,
      errors: [{ message: `Failed to read pickety.json: ${e.message}` }],
    };
  }
}

/**
 * Validates that the parsed JSON has the required shape for a PicketyConfig.
 * Collects all errors found instead of returning early.
 */
function validateConfig(parsed: unknown): ConfigResult {
  const errors: ConfigError[] = [];

  if (typeof parsed !== "object" || parsed === null) {
    return {
      ok: false,
      errors: [{ message: "Configuration must be a JSON object" }],
    };
  }

  const obj = parsed as Record<string, unknown>;

  // modules validation
  if (obj.modules === undefined) {
    errors.push({
      message: '"modules" is required and must be an object',
      path: "modules",
    });
  } else if (typeof obj.modules !== "object" || obj.modules === null) {
    errors.push({
      message: '"modules" must be an object mapping module names to patterns',
      path: "modules",
    });
  } else {
    const modules = obj.modules as Record<string, unknown>;
    for (const [key, value] of Object.entries(modules)) {
      if (typeof value !== "string") {
        errors.push({
          message: `Module "${key}" pattern must be a string, got ${typeof value}`,
          path: `modules.${key}`,
        });
      }
    }
  }

  // rules validation
  if (obj.rules === undefined) {
    errors.push({
      message: '"rules" is required and must be an object',
      path: "rules",
    });
  } else if (typeof obj.rules !== "object" || obj.rules === null) {
    errors.push({ message: '"rules" must be an object', path: "rules" });
  } else {
    const rules = obj.rules as Record<string, unknown>;
    const boundaries = rules["module-boundaries"];

    if (boundaries === undefined) {
      errors.push({
        message: '"rules.module-boundaries" is required and must be an object',
        path: "rules.module-boundaries",
      });
    } else if (typeof boundaries !== "object" || boundaries === null) {
      errors.push({
        message: '"rules.module-boundaries" must be an object',
        path: "rules.module-boundaries",
      });
    } else {
      const bObj = boundaries as Record<string, unknown>;

      // severity validation
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

      // rules array validation
      if (bObj.rules === undefined) {
        errors.push({
          message:
            '"rules.module-boundaries.rules" is required and must be an array',
          path: "rules.module-boundaries.rules",
        });
      } else if (!Array.isArray(bObj.rules)) {
        errors.push({
          message: '"rules.module-boundaries.rules" must be an array',
          path: "rules.module-boundaries.rules",
        });
      } else {
        bObj.rules.forEach((rule, index) => {
          const rulePath = `rules.module-boundaries.rules[${index}]`;
          if (typeof rule !== "object" || rule === null) {
            errors.push({
              message: `Rule #${index} must be an object`,
              path: rulePath,
            });
            return;
          }

          if (typeof rule.importer !== "string") {
            errors.push({
              message: `Rule #${index}: "importer" is required and must be a string`,
              path: `${rulePath}.importer`,
            });
          }
          if (typeof rule.imports !== "string") {
            errors.push({
              message: `Rule #${index}: "imports" is required and must be a string`,
              path: `${rulePath}.imports`,
            });
          }
          if (rule.allow !== undefined && typeof rule.allow !== "boolean") {
            errors.push({
              message: `Rule #${index}: "allow" must be a boolean`,
              path: `${rulePath}.allow`,
            });
          }
          if (rule.message !== undefined && typeof rule.message !== "string") {
            errors.push({
              message: `Rule #${index}: "message" must be a string`,
              path: `${rulePath}.message`,
            });
          }
          if (rule.severity !== undefined && rule.severity !== "error" && rule.severity !== "warn") {
            errors.push({
              message: `Rule #${index}: "severity" must be "error" or "warn", got "${rule.severity}"`,
              path: `${rulePath}.severity`,
            });
          }
          if (rule.name !== undefined && typeof rule.name !== "string") {
            errors.push({
              message: `Rule #${index}: "name" must be a string`,
              path: `${rulePath}.name`,
            });
          }
        });

      }

      if (errors.length === 0) {
        return {
          ok: true,
          config: {
            modules: obj.modules as Record<string, string>,
            rules: {
              "module-boundaries": {
                severity,
                rules: bObj.rules as any[],
              },
            },
          },
        };
      }
    }
  }

  return { ok: false, errors };
}

/**
 * Loads tsconfig.json and returns path aliases.
 */
export function loadTsConfigAliases(
  workspaceRoot: string
): Record<string, string> {
  const aliases: Record<string, string> = {};

  // Try common tsconfig names
  const tsConfigNames = [
    "tsconfig.json",
    "tsconfig.app.json",
    "tsconfig.web.json",
  ];
  let tsConfigPath: string | undefined;

  for (const name of tsConfigNames) {
    const p = path.join(workspaceRoot, name);
    if (fs.existsSync(p)) {
      tsConfigPath = p;
      break;
    }
  }

  if (!tsConfigPath) {
    return aliases;
  }

  try {
    const raw = fs.readFileSync(tsConfigPath, "utf-8");
    // Strip comments manually since JSON.parse doesn't support them
    const clean = raw.replace(/\/\/.*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const parsed = JSON.parse(clean);

    const compilerOptions = parsed.compilerOptions;
    if (!compilerOptions) {
      return aliases;
    }

    const baseUrl = compilerOptions.baseUrl || ".";
    const paths = compilerOptions.paths;

    if (paths) {
      for (const [key, values] of Object.entries(paths)) {
        if (Array.isArray(values) && values.length > 0) {
          // Take the first path and join with baseUrl
          let target = values[0] as string;
          const replacement = path.join(baseUrl, target).replace(/\\/g, "/");
          aliases[key] = replacement;
        }
      }
    }
  } catch {
    // Silently fail for tsconfig errors, just return empty aliases
  }

  return aliases;
}
