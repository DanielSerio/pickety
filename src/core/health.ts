import type { ImportGraph } from "./graph";
import { matchFileToModule } from "./imports";
import type { ModuleHealth, HealthConfig, HealthViolation } from "../types";

/**
 * Computes health metrics for every module in the workspace.
 * Uses the file-level ImportGraph aggregated to module-level edges.
 */
export function computeModuleHealth(
  graph: ImportGraph,
  modules: Record<string, string>,
  root: string,
  knownFiles: Set<string>
): ModuleHealth[] {
  const moduleGraph = graph.getModuleLevelGraph(modules, root);
  const moduleNames = Object.keys(modules);

  // Count files per module
  const fileCounts = new Map<string, number>();
  for (const mod of moduleNames) {
    fileCounts.set(mod, 0);
  }
  for (const file of knownFiles) {
    const mod = matchFileToModule(file, modules, root);
    if (mod) {
      fileCounts.set(mod, (fileCounts.get(mod) ?? 0) + 1);
    }
  }

  // Ca (afferent coupling): for each module, how many other modules depend on it
  const afferent = new Map<string, number>();
  for (const mod of moduleNames) {
    afferent.set(mod, 0);
  }
  for (const [, targets] of moduleGraph) {
    for (const target of targets) {
      afferent.set(target, (afferent.get(target) ?? 0) + 1);
    }
  }

  // Compute dependency depth: longest path from each module to a leaf via BFS
  const depths = computeDependencyDepths(moduleGraph, moduleNames);

  const results: ModuleHealth[] = moduleNames.map((mod) => {
    const ca = afferent.get(mod) ?? 0;
    const ce = moduleGraph.get(mod)?.size ?? 0;
    const total = ca + ce;

    return {
      moduleName: mod,
      fileCount: fileCounts.get(mod) ?? 0,
      afferentCoupling: ca,
      efferentCoupling: ce,
      instability: total === 0 ? 0 : ce / total,
      dependencyDepth: depths.get(mod) ?? 0,
    };
  });

  // Sort by instability descending for readability
  results.sort((a, b) => a.instability - b.instability);

  return results;
}

/**
 * Computes the longest dependency chain from each module to a leaf.
 * A leaf is a module with no outgoing edges (Ce = 0).
 * Uses iterative DFS with memoization.
 */
function computeDependencyDepths(
  moduleGraph: Map<string, Set<string>>,
  moduleNames: string[]
): Map<string, number> {
  const depths = new Map<string, number>();
  // Track visited nodes during DFS to handle cycles
  const visiting = new Set<string>();

  function dfs(mod: string): number {
    if (depths.has(mod)) {
      return depths.get(mod)!;
    }
    // Cycle detected — treat as depth 0 to avoid infinite recursion
    if (visiting.has(mod)) {
      return 0;
    }

    visiting.add(mod);
    const targets = moduleGraph.get(mod);
    let maxDepth = 0;

    if (targets && targets.size > 0) {
      for (const target of targets) {
        maxDepth = Math.max(maxDepth, 1 + dfs(target));
      }
    }

    visiting.delete(mod);
    depths.set(mod, maxDepth);
    return maxDepth;
  }

  for (const mod of moduleNames) {
    dfs(mod);
  }

  return depths;
}

/**
 * Checks computed health metrics against configured thresholds.
 * Returns an array of violations for metrics that exceed their limits.
 */
export function checkHealthThresholds(
  health: ModuleHealth[],
  config: HealthConfig
): HealthViolation[] {
  const violations: HealthViolation[] = [];

  for (const mod of health) {
    if (config.maxAfferentCoupling !== undefined && mod.afferentCoupling > config.maxAfferentCoupling) {
      violations.push({
        moduleName: mod.moduleName,
        metric: "afferent coupling",
        value: mod.afferentCoupling,
        threshold: config.maxAfferentCoupling,
      });
    }
    if (config.maxEfferentCoupling !== undefined && mod.efferentCoupling > config.maxEfferentCoupling) {
      violations.push({
        moduleName: mod.moduleName,
        metric: "efferent coupling",
        value: mod.efferentCoupling,
        threshold: config.maxEfferentCoupling,
      });
    }
    if (config.maxInstability !== undefined && mod.instability > config.maxInstability) {
      violations.push({
        moduleName: mod.moduleName,
        metric: "instability",
        value: mod.instability,
        threshold: config.maxInstability,
      });
    }
    if (config.maxDepth !== undefined && mod.dependencyDepth > config.maxDepth) {
      violations.push({
        moduleName: mod.moduleName,
        metric: "dependency depth",
        value: mod.dependencyDepth,
        threshold: config.maxDepth,
      });
    }
  }

  return violations;
}
