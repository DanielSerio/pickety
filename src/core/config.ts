import * as path from "path";
import * as fs from "fs";
import * as jsonc from "jsonc-parser";
import type {
  ConfigResult,
  ConfigError,
  BoundaryRule,
  HealthConfig,
  Severity,
} from "../types";
import { CONFIG_FILENAME, normalizePath } from "./utils";



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

function validateBoundaryRules(
  rules: unknown,
  errors: ConfigError[]
): { severity: Severity; rules: BoundaryRule[]; } | undefined {
  if (rules === undefined) {
    errors.push({
      message: '"rules" is required and must be an object',
      path: "rules",
    });
    return undefined;
  }

  if (typeof rules !== "object" || rules === null) {
    errors.push({ message: '"rules" must be an object', path: "rules" });
    return undefined;
  }

  const rulesObj = rules as Record<string, unknown>;
  const boundaries = rulesObj["module-boundaries"];

  if (boundaries === undefined) {
    errors.push({
      message: '"rules.module-boundaries" is required and must be an object',
      path: "rules.module-boundaries",
    });
    return undefined;
  }

  if (typeof boundaries !== "object" || boundaries === null) {
    errors.push({
      message: '"rules.module-boundaries" must be an object',
      path: "rules.module-boundaries",
    });
    return undefined;
  }

  const bObj = boundaries as Record<string, unknown>;
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

  if (bObj.rules === undefined) {
    errors.push({
      message: '"rules.module-boundaries.rules" is required and must be an array',
      path: "rules.module-boundaries.rules",
    });
    return undefined;
  }

  if (!Array.isArray(bObj.rules)) {
    errors.push({
      message: '"rules.module-boundaries.rules" must be an array',
      path: "rules.module-boundaries.rules",
    });
    return undefined;
  }

  const validatedRules: BoundaryRule[] = [];
  bObj.rules.forEach((rule, index) => {
    const rulePath = `rules.module-boundaries.rules[${index}]`;
    if (typeof rule !== "object" || rule === null) {
      errors.push({
        message: `Rule #${index} must be an object`,
        path: rulePath,
      });
      return;
    }

    const r = rule as Record<string, unknown>;

    if (typeof r.importer !== "string" && typeof r.containedTo !== "string") {
      errors.push({
        message: `Rule #${index}: "importer" or "containedTo" is required`,
        path: rulePath,
      });
    }
    if (r.importer !== undefined && typeof r.importer !== "string") {
      errors.push({
        message: `Rule #${index}: "importer" must be a string`,
        path: `${rulePath}.importer`,
      });
    }
    if (typeof r.imports !== "string") {
      errors.push({
        message: `Rule #${index}: "imports" is required and must be a string`,
        path: `${rulePath}.imports`,
      });
    }
    if (r.allow !== undefined && typeof r.allow !== "boolean") {
      errors.push({
        message: `Rule #${index}: "allow" must be a boolean`,
        path: `${rulePath}.allow`,
      });
    }
    if (r.only !== undefined && typeof r.only !== "boolean") {
      errors.push({
        message: `Rule #${index}: "only" must be a boolean`,
        path: `${rulePath}.only`,
      });
    }
    if (r.containedTo !== undefined && typeof r.containedTo !== "string") {
      errors.push({
        message: `Rule #${index}: "containedTo" must be a string`,
        path: `${rulePath}.containedTo`,
      });
    }
    if (r.message !== undefined && typeof r.message !== "string") {
      errors.push({
        message: `Rule #${index}: "message" must be a string`,
        path: `${rulePath}.message`,
      });
    }
    if (r.severity !== undefined && r.severity !== "error" && r.severity !== "warn") {
      errors.push({
        message: `Rule #${index}: "severity" must be "error" or "warn", got "${r.severity}"`,
        path: `${rulePath}.severity`,
      });
    }
    if (r.name !== undefined && typeof r.name !== "string") {
      errors.push({
        message: `Rule #${index}: "name" must be a string`,
        path: `${rulePath}.name`,
      });
    }
    if (r.maxViolations !== undefined) {
      if (typeof r.maxViolations !== "number" || !Number.isInteger(r.maxViolations) || r.maxViolations < 0) {
        errors.push({
          message: `Rule #${index}: "maxViolations" must be a non-negative integer`,
          path: `${rulePath}.maxViolations`,
        });
      }
    }

    validatedRules.push(r as unknown as BoundaryRule);
  });

  return { severity, rules: validatedRules };
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

function validateHealthConfig(
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


// Directories to skip when searching for tsconfig files
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "out", "build",
  ".turbo", ".cache", ".nx", "coverage",
]);

/**
 * Recursively finds all tsconfig*.json files under a directory,
 * up to maxDepth levels deep, skipping common build/dependency directories.
 */
function findTsConfigFiles(dir: string, maxDepth: number): string[] {
  if (maxDepth < 0) { return []; }

  const results: string[] = [];
  let entries: fs.Dirent[];

  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  // Collect files at this level first so shallower tsconfigs take precedence
  for (const entry of entries) {
    if (!SKIP_DIRS.has(entry.name) && entry.isFile() && /^tsconfig(\..+)?\.json$/.test(entry.name)) {
      results.push(path.join(dir, entry.name));
    }
  }

  // Then recurse into subdirectories
  for (const entry of entries) {
    if (!SKIP_DIRS.has(entry.name) && entry.isDirectory()) {
      results.push(...findTsConfigFiles(path.join(dir, entry.name), maxDepth - 1));
    }
  }

  return results;
}

/**
 * Loads tsconfig.json and returns path aliases.
 * Searches recursively for tsconfig files to support monorepo layouts
 * where tsconfig.json may live in a subdirectory (e.g. apps/web/tsconfig.json).
 * Aliases are resolved relative to the workspace root so they work with resolveImport.
 */
export function loadTsConfigAliases(
  workspaceRoot: string
): Record<string, string> {
  const aliases: Record<string, string> = {};
  const tsConfigPaths = findTsConfigFiles(workspaceRoot, 4);

  for (const tsConfigPath of tsConfigPaths) {
    try {
      const raw = fs.readFileSync(tsConfigPath, "utf-8");
      // Use jsonc-parser to handle comments and trailing commas correctly
      const parsed = jsonc.parse(raw);

      const compilerOptions = parsed.compilerOptions;
      if (!compilerOptions?.paths) { continue; }

      // Compute this tsconfig's directory relative to the workspace root so
      // that alias targets are expressed as workspace-root-relative paths.
      const tsConfigDir = path.dirname(tsConfigPath);
      const relDir = path.relative(workspaceRoot, tsConfigDir);
      const baseUrl = compilerOptions.baseUrl || ".";

      for (const [key, values] of Object.entries(compilerOptions.paths)) {
        if (Array.isArray(values) && values.length > 0) {
          const target = values[0] as string;
          // Resolve alias target relative to workspace root. Shallower tsconfigs
          // (found first) take precedence over deeper ones for the same alias key.
          if (!aliases[key]) {
            aliases[key] = normalizePath(path.join(relDir, baseUrl, target));
          }
        }
      }
    } catch {
      // Silently fail for individual tsconfig errors
    }
  }

  return aliases;
}
