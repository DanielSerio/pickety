"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOURCE_GLOB = exports.SOURCE_EXTENSIONS = exports.CONFIG_FILENAME = void 0;
exports.normalizePath = normalizePath;
exports.matchesPattern = matchesPattern;
exports.resolveRuleDefaults = resolveRuleDefaults;
exports.createViolation = createViolation;
const minimatch_1 = require("minimatch");
exports.CONFIG_FILENAME = "pickety.json";
exports.SOURCE_EXTENSIONS = ["ts", "tsx", "js", "jsx", "mjs", "cjs"];
exports.SOURCE_GLOB = `**/*.{${exports.SOURCE_EXTENSIONS.join(",")}}`;
/**
 * Normalizes a file path to use forward slashes and consistent drive letter casing on Windows.
 */
function normalizePath(p) {
    let normalized = p.replace(/\\/g, "/");
    // On Windows, drive letters can be C: or c:. Normalize to lowercase.
    if (/^[a-zA-Z]:/.test(normalized)) {
        normalized = normalized[0].toLowerCase() + normalized.slice(1);
    }
    return normalized;
}
/**
 * Checks if a value matches a pattern (either exactly or via glob).
 */
function matchesPattern(value, pattern) {
    return (0, minimatch_1.minimatch)(value, pattern) || value === pattern;
}
/**
 * Resolves defaults for a boundary rule.
 */
function resolveRuleDefaults(rule, index, globalSeverity) {
    return {
        allow: rule.allow ?? false,
        severity: rule.severity ?? globalSeverity,
        name: rule.name ?? `rule[${index}]`,
    };
}
/**
 * Helper to create a Violation object consistently.
 */
function createViolation(filePath, importStmt, ruleName, message, severity) {
    return {
        file: filePath,
        line: importStmt.line,
        character: importStmt.character,
        length: importStmt.length,
        message: `[${ruleName}] ${message} (importing "${importStmt.specifier}")`,
        severity,
        ruleName,
    };
}
//# sourceMappingURL=utils.js.map