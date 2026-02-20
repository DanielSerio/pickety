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
exports.checkBoundaries = checkBoundaries;
const path = __importStar(require("path"));
const minimatch_1 = require("minimatch");
const imports_1 = require("./imports");
// Checks a single file for import boundary violations.
// Returns a list of violations with position info for diagnostics.
function checkBoundaries(filePath, content, config, knownFiles, root, aliases = {}) {
    const violations = [];
    const { modules } = config;
    const { severity, rules } = config.rules["module-boundaries"];
    // Determine which module this file belongs to
    const sourceModule = (0, imports_1.matchFileToModule)(filePath, modules, root);
    if (!sourceModule) {
        return [];
    }
    const sourceRelativePath = path.relative(root, filePath).replace(/\\/g, "/");
    // Extract all imports from the file content
    const imports = (0, imports_1.extractImports)(content);
    for (const importStmt of imports) {
        // Resolve the import specifier to an absolute file path
        const resolvedPath = (0, imports_1.resolveImport)(importStmt.specifier, filePath, knownFiles, root, aliases);
        if (!resolvedPath) {
            continue;
        }
        // Determine which module the imported file belongs to
        const targetModule = (0, imports_1.matchFileToModule)(resolvedPath, modules, root);
        if (!targetModule) {
            continue;
        }
        // Get the target file's relative path for glob matching
        const targetRelativePath = path
            .relative(root, resolvedPath)
            .replace(/\\/g, "/");
        // Check each boundary rule for a match
        rules.forEach((rule, index) => {
            const allow = rule.allow ?? false;
            const ruleSeverity = rule.severity ?? severity;
            const ruleName = rule.name ?? `rule[${index}]`;
            const variables = findVariables(rule.importer);
            if (variables.length > 0) {
                // Interpolation rule: capture variables from source file path
                const captured = captureVariablesFromPath(rule.importer, sourceRelativePath, variables);
                if (!captured) {
                    return; // importer pattern doesn't match this file
                }
                if (allow) {
                    // allow: true — enforce that imports matching the general pattern
                    // also match the specific interpolated pattern
                    const generalPattern = replaceVariables(rule.imports, variables, "*");
                    const specificPattern = replaceVariables(rule.imports, variables, captured);
                    const matchesGeneral = matchesTarget(targetModule, targetRelativePath, generalPattern);
                    const matchesSpecific = matchesTarget(targetModule, targetRelativePath, specificPattern);
                    if (matchesGeneral && !matchesSpecific) {
                        const message = rule.message ||
                            `Import must match scoped pattern "${specificPattern}"`;
                        violations.push({
                            file: filePath,
                            line: importStmt.line,
                            character: importStmt.character,
                            length: importStmt.length,
                            message: `[${ruleName}] ${message} (importing "${importStmt.specifier}")`,
                            severity: ruleSeverity,
                            ruleName,
                        });
                    }
                }
                else {
                    // allow: false — deny imports matching the specific interpolated pattern
                    const specificPattern = replaceVariables(rule.imports, variables, captured);
                    const toMatches = matchesTarget(targetModule, targetRelativePath, specificPattern);
                    if (toMatches) {
                        const message = rule.message ||
                            `Module "${sourceModule}" cannot import from "${targetModule}"`;
                        violations.push({
                            file: filePath,
                            line: importStmt.line,
                            character: importStmt.character,
                            length: importStmt.length,
                            message: `[${ruleName}] ${message} (importing "${importStmt.specifier}")`,
                            severity: ruleSeverity,
                            ruleName,
                        });
                    }
                }
            }
            else {
                // Regular rule: no interpolation variables
                const fromMatches = (0, minimatch_1.minimatch)(sourceModule, rule.importer) ||
                    sourceModule === rule.importer;
                const toMatches = matchesTarget(targetModule, targetRelativePath, rule.imports);
                if (fromMatches && toMatches && !allow) {
                    const message = rule.message ||
                        `Module "${sourceModule}" cannot import from "${targetModule}"`;
                    violations.push({
                        file: filePath,
                        line: importStmt.line,
                        character: importStmt.character,
                        length: importStmt.length,
                        message: `[${ruleName}] ${message} (importing "${importStmt.specifier}")`,
                        severity: ruleSeverity,
                        ruleName,
                    });
                }
            }
        });
    }
    return violations;
}
// Matches a rule's `imports` pattern against the target.
// If the pattern is a simple name (no `/`), matches against the module name.
// If the pattern contains `/`, also matches against the resolved file's relative path.
function matchesTarget(targetModule, targetRelativePath, pattern) {
    // Always try module name match
    if ((0, minimatch_1.minimatch)(targetModule, pattern) || targetModule === pattern) {
        return true;
    }
    // If pattern contains `/`, it's a file path glob — match against relative path
    if (pattern.includes("/")) {
        // Try exact match against relative path
        if ((0, minimatch_1.minimatch)(targetRelativePath, pattern)) {
            return true;
        }
        // Try with **/ prefix and /** suffix to handle missing root dirs and filenames
        if ((0, minimatch_1.minimatch)(targetRelativePath, `**/${pattern}/**`)) {
            return true;
        }
    }
    return false;
}
// Extracts $variable names from a pattern string (e.g., "$route-name" from "routes/$route-name/*")
function findVariables(pattern) {
    const matches = pattern.match(/\$[\w-]+/g);
    return matches || [];
}
// Matches a glob pattern with $variables against a file path using segment-based
// matching. Avoids regex with multiple .* quantifiers to prevent ReDoS.
// Returns captured variable values, or undefined if no match.
function captureVariablesFromPath(pattern, relativePath, variables) {
    // Split pattern and path into segments for iterative matching
    const patternSegments = pattern.split("/");
    const pathSegments = relativePath.split("/");
    // Try matching at every possible starting offset in the path
    // (pattern "routes/$name" should match "src/routes/auth/index.ts")
    const minStart = 0;
    const maxStart = pathSegments.length - patternSegments.length;
    for (let start = minStart; start <= maxStart; start++) {
        const captured = tryMatchSegments(patternSegments, pathSegments, start, variables);
        if (captured) {
            return captured;
        }
    }
    return undefined;
}
// Attempts to match pattern segments against path segments starting at a given offset.
// Returns captured variables on success, undefined on failure.
function tryMatchSegments(patternSegments, pathSegments, startOffset, variables) {
    const result = {};
    let pathIdx = startOffset;
    for (let i = 0; i < patternSegments.length; i++) {
        const seg = patternSegments[i];
        if (seg === "**") {
            // ** matches zero or more segments. Try each possible endpoint.
            const remaining = patternSegments.slice(i + 1);
            if (remaining.length === 0) {
                // ** at end matches everything remaining
                return result;
            }
            // Try matching the rest of the pattern at every remaining position
            for (let skip = pathIdx; skip <= pathSegments.length - remaining.length; skip++) {
                const subResult = tryMatchSegments(remaining, pathSegments, skip, variables);
                if (subResult) {
                    return { ...result, ...subResult };
                }
            }
            return undefined;
        }
        if (pathIdx >= pathSegments.length) {
            return undefined;
        }
        // Build a regex for this single segment (no .* — only [^/]+ and [^/]*)
        let segRegex = seg;
        const varOrder = [];
        // Replace $variables with placeholders
        for (const v of variables) {
            if (segRegex.includes(v)) {
                segRegex = segRegex.replace(v, `__VAR_${varOrder.length}__`);
                varOrder.push(v);
            }
        }
        // Escape regex special chars, preserving * for glob conversion
        segRegex = segRegex.replace(/[.+?^{}()|[\]\\]/g, "\\$&");
        // Single * matches any non-slash characters within one segment
        segRegex = segRegex.replace(/\*/g, "[^/]*");
        // Replace placeholders with capture groups
        for (let j = 0; j < varOrder.length; j++) {
            segRegex = segRegex.replace(`__VAR_${j}__`, "([^/]+)");
        }
        const match = pathSegments[pathIdx].match(new RegExp(`^${segRegex}$`));
        if (!match) {
            return undefined;
        }
        // Collect captured variables from this segment
        for (let j = 0; j < varOrder.length; j++) {
            result[varOrder[j]] = match[j + 1];
        }
        pathIdx++;
    }
    return result;
}
// Replaces $variables in a pattern with concrete values.
// If `values` is a string, all variables are replaced with that string (used for general patterns).
// If `values` is a record, each variable is replaced with its captured value.
function replaceVariables(pattern, variables, values) {
    let result = pattern;
    for (const v of variables) {
        const replacement = typeof values === "string" ? values : values[v];
        result = result.replace(v, replacement);
    }
    return result;
}
//# sourceMappingURL=boundaries.js.map