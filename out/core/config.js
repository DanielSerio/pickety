"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
exports.loadTsConfigAliases = loadTsConfigAliases;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const jsonc = __importStar(require("jsonc-parser"));
const CONFIG_FILENAME = "pickety.json";
/**
 * Loads and validates pickety.json from the given workspace root.
 * Returns a Result type indicating success or a list of validation errors.
 */
function loadConfig(workspaceRoot) {
    const configPath = path.join(workspaceRoot, CONFIG_FILENAME);
    if (!fs.existsSync(configPath)) {
        return {
            ok: false,
            errors: [{ message: `File not found: ${CONFIG_FILENAME}` }],
        };
    }
    try {
        const raw = fs.readFileSync(configPath, "utf-8");
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch (e) {
            return {
                ok: false,
                errors: [{ message: `pickety.json is not valid JSON: ${e.message}` }],
            };
        }
        return validateConfig(parsed);
    }
    catch (e) {
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
function validateConfig(parsed) {
    const errors = [];
    if (typeof parsed !== "object" || parsed === null) {
        return {
            ok: false,
            errors: [{ message: "Configuration must be a JSON object" }],
        };
    }
    const obj = parsed;
    // modules validation
    if (obj.modules === undefined) {
        errors.push({
            message: '"modules" is required and must be an object',
            path: "modules",
        });
    }
    else if (typeof obj.modules !== "object" || obj.modules === null) {
        errors.push({
            message: '"modules" must be an object mapping module names to patterns',
            path: "modules",
        });
    }
    else {
        const modules = obj.modules;
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
    }
    else if (typeof obj.rules !== "object" || obj.rules === null) {
        errors.push({ message: '"rules" must be an object', path: "rules" });
    }
    else {
        const rules = obj.rules;
        const boundaries = rules["module-boundaries"];
        if (boundaries === undefined) {
            errors.push({
                message: '"rules.module-boundaries" is required and must be an object',
                path: "rules.module-boundaries",
            });
        }
        else if (typeof boundaries !== "object" || boundaries === null) {
            errors.push({
                message: '"rules.module-boundaries" must be an object',
                path: "rules.module-boundaries",
            });
        }
        else {
            const bObj = boundaries;
            // severity validation
            let severity = "error";
            if (bObj.severity !== undefined) {
                if (bObj.severity !== "error" && bObj.severity !== "warn") {
                    errors.push({
                        message: `"rules.module-boundaries.severity" must be "error" or "warn", got "${bObj.severity}"`,
                        path: "rules.module-boundaries.severity",
                    });
                }
                else {
                    severity = bObj.severity;
                }
            }
            // rules array validation
            if (bObj.rules === undefined) {
                errors.push({
                    message: '"rules.module-boundaries.rules" is required and must be an array',
                    path: "rules.module-boundaries.rules",
                });
            }
            else if (!Array.isArray(bObj.rules)) {
                errors.push({
                    message: '"rules.module-boundaries.rules" must be an array',
                    path: "rules.module-boundaries.rules",
                });
            }
            else {
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
            // boundary-diagrams validation
            let boundaryDiagrams = undefined;
            if (obj["boundary-diagrams"] !== undefined) {
                if (typeof obj["boundary-diagrams"] !== "boolean" &&
                    typeof obj["boundary-diagrams"] !== "string") {
                    errors.push({
                        message: '"boundary-diagrams" must be a boolean or a string',
                        path: "boundary-diagrams",
                    });
                }
                else {
                    boundaryDiagrams = obj["boundary-diagrams"];
                }
            }
            if (errors.length === 0) {
                return {
                    ok: true,
                    config: {
                        modules: obj.modules,
                        rules: {
                            "module-boundaries": {
                                severity,
                                rules: bObj.rules,
                            },
                        },
                        "boundary-diagrams": boundaryDiagrams,
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
function loadTsConfigAliases(workspaceRoot) {
    const aliases = {};
    // Try common tsconfig names
    const tsConfigNames = [
        "tsconfig.json",
        "tsconfig.app.json",
        "tsconfig.web.json",
    ];
    let tsConfigPath;
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
        // Use jsonc-parser to handle comments and trailing commas correctly
        const parsed = jsonc.parse(raw);
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
                    let target = values[0];
                    const replacement = path.join(baseUrl, target).replace(/\\/g, "/");
                    aliases[key] = replacement;
                }
            }
        }
    }
    catch {
        // Silently fail for tsconfig errors, just return empty aliases
    }
    return aliases;
}
//# sourceMappingURL=config.js.map