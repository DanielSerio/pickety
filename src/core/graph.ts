import {
  matchFileToModule,
  resolveFileImports,
} from "./imports";
import { normalizePath } from "./utils";
import type { WorkspaceContext } from "../types";

/**
 * Extracts the set of resolved file paths that a given file imports.
 * Returns only internal (non-external) imports that resolve to known files.
 */
export function getFileDependencies(
  filePath: string,
  content: string,
  ctx: WorkspaceContext
): Set<string> {
  const deps = new Set<string>();
  const resolvedImports = resolveFileImports(
    filePath,
    content,
    ctx
  );
  const normalized = normalizePath(filePath);

  for (const { resolvedPath } of resolvedImports) {
    if (resolvedPath && resolvedPath !== normalized) {
      deps.add(resolvedPath);
    }
  }

  return deps;
}

// File-level import graph that maintains forward edges (dependencies)
// and reverse edges (dependents) for every source file in the workspace.
export class ImportGraph {
  // For a given file, which files import it
  private dependents = new Map<string, Set<string>>();
  // For a given file, which files does it import
  private dependencies = new Map<string, Set<string>>();

  // Update a file's forward edges and all affected reverse edges.
  // Call this when a file's content changes or when building the graph initially.
  updateFile(filePath: string, newDependencies: Set<string>): void {
    // Remove old reverse edges for this file
    const oldDeps = this.dependencies.get(filePath);
    if (oldDeps) {
      for (const dep of oldDeps) {
        this.dependents.get(dep)?.delete(filePath);
      }
    }

    // Set new forward edges
    this.dependencies.set(filePath, new Set(newDependencies));

    // Add new reverse edges
    for (const dep of newDependencies) {
      if (!this.dependents.has(dep)) {
        this.dependents.set(dep, new Set());
      }
      this.dependents.get(dep)!.add(filePath);
    }
  }

  // Remove a file and all its edges from the graph.
  removeFile(filePath: string): void {
    // Remove forward edges and their reverse counterparts
    const deps = this.dependencies.get(filePath);
    if (deps) {
      for (const dep of deps) {
        this.dependents.get(dep)?.delete(filePath);
      }
    }
    this.dependencies.delete(filePath);

    // Remove reverse edges pointing to this file
    const revDeps = this.dependents.get(filePath);
    if (revDeps) {
      for (const dep of revDeps) {
        this.dependencies.get(dep)?.delete(filePath);
      }
    }
    this.dependents.delete(filePath);
  }

  // Files that directly import the given file
  getDependents(file: string): Set<string> {
    return this.dependents.get(file) ?? new Set();
  }

  // Files that the given file directly imports
  getDependencies(file: string): Set<string> {
    return this.dependencies.get(file) ?? new Set();
  }

  // All files that transitively depend on the given file (full blast radius).
  // Uses BFS over reverse edges.
  getTransitiveDependents(file: string): Set<string> {
    const result = new Set<string>();
    const queue = [file];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const deps = this.dependents.get(current);
      if (!deps) {
        continue;
      }
      for (const dep of deps) {
        if (!result.has(dep) && dep !== file) {
          result.add(dep);
          queue.push(dep);
        }
      }
    }

    return result;
  }

  // Summarizes the impact of a file: how many files and modules depend on it,
  // and how many files and modules it depends on.
  getModuleSummary(
    file: string,
    modules: Record<string, string>,
    root: string
  ): ImpactSummary {
    const directDependents = this.getDependents(file);
    const directDependencies = this.getDependencies(file);

    const dependentModules = new Set<string>();
    for (const dep of directDependents) {
      const mod = matchFileToModule(dep, modules, root);
      if (mod) {
        dependentModules.add(mod);
      }
    }

    const dependencyModules = new Set<string>();
    for (const dep of directDependencies) {
      const mod = matchFileToModule(dep, modules, root);
      if (mod) {
        dependencyModules.add(mod);
      }
    }

    return {
      dependentCount: directDependents.size,
      dependentModules: [...dependentModules],
      dependencyCount: directDependencies.size,
      dependencyModules: [...dependencyModules],
    };
  }

  // Returns the module-level graph aggregated from file-level edges.
  // Each module maps to the set of other modules it depends on.
  getModuleLevelGraph(
    modules: Record<string, string>,
    root: string
  ): Map<string, Set<string>> {
    const moduleGraph = new Map<string, Set<string>>();

    for (const [filePath, deps] of this.dependencies) {
      const sourceModule = matchFileToModule(filePath, modules, root);
      if (!sourceModule) {
        continue;
      }

      if (!moduleGraph.has(sourceModule)) {
        moduleGraph.set(sourceModule, new Set());
      }

      for (const dep of deps) {
        const targetModule = matchFileToModule(dep, modules, root);
        if (targetModule && targetModule !== sourceModule) {
          moduleGraph.get(sourceModule)!.add(targetModule);
        }
      }
    }

    return moduleGraph;
  }

  clear(): void {
    this.dependents.clear();
    this.dependencies.clear();
  }
}

// Summary of a file's impact in the import graph
export interface ImpactSummary {
  dependentCount: number;
  dependentModules: string[];
  dependencyCount: number;
  dependencyModules: string[];
}
