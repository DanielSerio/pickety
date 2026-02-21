"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatHealthMetricValue = exports.getConfigPath = exports.matchesPattern = exports.toRelativePath = exports.normalizePath = exports.SOURCE_GLOB = exports.SOURCE_EXTENSIONS = exports.CONFIG_FILENAME = void 0;
exports.resolveRuleDefaults = resolveRuleDefaults;
exports.createViolation = createViolation;
exports.findCycles = findCycles;
var utils_1 = require("../utils");
Object.defineProperty(exports, "CONFIG_FILENAME", { enumerable: true, get: function () { return utils_1.CONFIG_FILENAME; } });
Object.defineProperty(exports, "SOURCE_EXTENSIONS", { enumerable: true, get: function () { return utils_1.SOURCE_EXTENSIONS; } });
Object.defineProperty(exports, "SOURCE_GLOB", { enumerable: true, get: function () { return utils_1.SOURCE_GLOB; } });
Object.defineProperty(exports, "normalizePath", { enumerable: true, get: function () { return utils_1.normalizePath; } });
Object.defineProperty(exports, "toRelativePath", { enumerable: true, get: function () { return utils_1.toRelativePath; } });
Object.defineProperty(exports, "matchesPattern", { enumerable: true, get: function () { return utils_1.matchesPattern; } });
Object.defineProperty(exports, "getConfigPath", { enumerable: true, get: function () { return utils_1.getConfigPath; } });
Object.defineProperty(exports, "formatHealthMetricValue", { enumerable: true, get: function () { return utils_1.formatHealthMetricValue; } });
/**
 * Resolves defaults for a boundary rule.
 */
function resolveRuleDefaults(rule, index, globalSeverity) {
    return {
        allow: rule.allow ?? false,
        severity: rule.severity ?? globalSeverity,
        name: rule.name ?? `rule[${index}]`,
        effectiveImporter: rule.containedTo || rule.importer || "*",
        isOnly: rule.only || !!rule.containedTo,
        isAllowStyle: (rule.allow ?? false) || !!rule.containedTo || rule.only,
    };
}
/**
 * Helper to create a Violation object consistently.
 */
function createViolation(filePath, importStmt, ruleName, message, severity, sourceModule, targetModule) {
    return {
        file: filePath,
        line: importStmt.line,
        character: importStmt.character,
        length: importStmt.length,
        message: `[${ruleName}] ${message} (importing "${importStmt.specifier}")`,
        severity,
        ruleName,
        sourceModule,
        targetModule,
    };
}
/**
 * Finds all cycles in a directed graph using DFS.
 * Returns an array of cycles, where each cycle is an array of node names.
 */
function findCycles(graph) {
    const cycles = [];
    const visited = new Set();
    const recStack = new Set();
    const path = [];
    function drive(node) {
        visited.add(node);
        recStack.add(node);
        path.push(node);
        const neighbors = graph.get(node);
        if (neighbors) {
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    drive(neighbor);
                }
                else if (recStack.has(neighbor)) {
                    // Cycle detected!
                    const cycleStart = path.indexOf(neighbor);
                    if (cycleStart !== -1) {
                        cycles.push([...path.slice(cycleStart), neighbor]);
                    }
                }
            }
        }
        recStack.delete(node);
        path.pop();
    }
    for (const node of graph.keys()) {
        if (!visited.has(node)) {
            drive(node);
        }
    }
    return cycles;
}
//# sourceMappingURL=utils.js.map