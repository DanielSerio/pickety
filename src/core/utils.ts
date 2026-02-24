import type { BoundaryRule, ImportStatement, Severity, Violation } from "../shared/types";
export {
  CONFIG_FILENAME,
  SOURCE_EXTENSIONS,
  SOURCE_GLOB,
  SKIP_DIRS,
  normalizePath,
  toRelativePath,
  matchesPattern,
  getConfigPath,
  formatHealthMetricValue,
} from "../shared/utils";

/**
 * Resolves defaults for a boundary rule.
 */
export function resolveRuleDefaults(
  rule: BoundaryRule,
  index: number,
  globalSeverity: Severity
) {
  return {
    allow: rule.allow ?? false,
    severity: rule.severity ?? globalSeverity,
    name: rule.name ?? `rule[${index}]`,
    effectiveImporter: (
      typeof rule.containedTo === "object"
        ? rule.containedTo.path
        : rule.containedTo
    ) || rule.importer || "*",
    isOnly: rule.only || !!rule.containedTo,
    isAllowStyle: (rule.allow ?? false) || !!rule.containedTo || rule.only,
  };
}

/**
 * Helper to create a Violation object consistently.
 */
export function createViolation(
  filePath: string,
  importStmt: ImportStatement,
  ruleName: string,
  message: string,
  severity: Severity,
  sourceModule?: string,
  targetModule?: string
): Violation {
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
export function findCycles(graph: Map<string, Set<string>>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function drive(node: string) {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = graph.get(node);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          drive(neighbor);
        } else if (recStack.has(neighbor)) {
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
