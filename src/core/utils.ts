import type { BoundaryRule, ImportStatement, Severity, Violation, ContainedToOptions } from "../shared/types";
import {
  CONFIG_FILENAME,
  SOURCE_EXTENSIONS,
  SOURCE_GLOB,
  SKIP_DIRS,
  normalizePath,
  toRelativePath,
  matchesPattern,
  getConfigPath,
  formatHealthMetricValue,
  isIgnoredPath,
} from "../shared/utils";

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
  isIgnoredPath,
};

import { minimatch } from "minimatch";

/**
 * Resolves defaults for a boundary rule.
 */
export function resolveRuleDefaults(
  rule: BoundaryRule,
  index: number,
  globalSeverity: Severity
) {
  const ct = getContainedToOptions(rule);
  const name = rule.name ?? `rule[${index}]`;
  const group = rule.group;
  const label = group ? `${group}: ${name}` : name;
  return {
    allow: rule.allow ?? false,
    severity: rule.severity ?? globalSeverity,
    name,
    group,
    label,
    effectiveImporter: ct?.path || rule.importer || "*",
    isOnly: rule.only || !!rule.containedTo,
    isAllowStyle: (rule.allow ?? false) || !!rule.containedTo || !!rule.only,
  };
}

export type NormalizedRule = {
  rule: BoundaryRule;
  allow: boolean;
  severity: Severity;
  name: string;
  label: string;
  group?: string;
  effectiveImporter: string;
  isOnly: boolean;
  isAllowStyle: boolean;
  importPatterns: string[];
};

export function normalizeRule(
  rule: BoundaryRule,
  index: number,
  globalSeverity: Severity
): NormalizedRule {
  const defaults = resolveRuleDefaults(rule, index, globalSeverity);
  const importPatterns = Array.isArray(rule.imports) ? rule.imports : [rule.imports];
  return {
    rule,
    ...defaults,
    importPatterns: importPatterns.filter((pattern): pattern is string => typeof pattern === "string"),
  };
}

/**
 * Matches a rule pattern against a module name or relative path.
 * If the pattern is a simple name (no `/`), matches against the module name.
 * If the pattern contains `/`, also matches against the file's relative path.
 */
export function matchesModuleOrPath(
  moduleName: string,
  relativePath: string,
  pattern: string
): boolean {
  // Always try module name match
  const baseModuleName = moduleName.includes("[")
    ? moduleName.slice(0, moduleName.indexOf("["))
    : moduleName;

  if (matchesPattern(moduleName, pattern) || matchesPattern(baseModuleName, pattern)) {
    return true;
  }

  // If pattern contains `/`, it's a file path glob — match against relative path
  if (pattern.includes("/")) {
    // Try exact match against relative path
    if (minimatch(relativePath, pattern)) {
      return true;
    }
    // Match against relative path with flexibility for root dirs and subfolders
    if (
      minimatch(relativePath, `**/${pattern}`) ||
      minimatch(relativePath, `**/${pattern}/**`)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Normalizes rule.containedTo to its object form.
 */
export function getContainedToOptions(rule: BoundaryRule): ContainedToOptions | undefined {
  if (!rule.containedTo) {
    return undefined;
  }
  return typeof rule.containedTo === "object"
    ? rule.containedTo
    : { path: rule.containedTo };
}

/**
 * Options for creating a boundary violation.
 */
export interface CreateViolationOptions {
  filePath: string;
  importStmt: ImportStatement;
  ruleName: string;
  ruleLabel: string;
  message: string;
  severity: Severity;
  sourceModule?: string;
  targetModule?: string;
  ruleGroup?: string;
}

/**
 * Helper to create a Violation object consistently.
 */
export function createViolation(options: CreateViolationOptions): Violation {
  const {
    filePath,
    importStmt,
    ruleName,
    ruleLabel,
    message,
    severity,
    sourceModule,
    targetModule,
    ruleGroup,
  } = options;

  return {
    file: filePath,
    line: importStmt.line,
    character: importStmt.character,
    length: importStmt.length,
    message: `[${ruleLabel}] ${message} (importing "${importStmt.specifier}")`,
    severity,
    ruleName,
    ruleGroup,
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
