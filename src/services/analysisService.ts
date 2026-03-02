import * as vscode from "vscode";
import * as fs from "fs";
import { ImportGraph, getFileDependencies } from "../core/graph";
import { findCycles } from "../core/utils";
import { computeModuleHealth, checkHealthThresholds } from "../core/health";
import { normalizePath, SOURCE_GLOB, isIgnoredPath } from "../shared/utils";
import type { PicketyConfig, WorkspaceContext, HealthViolation } from "../shared/types";
import type { ConfigService } from "./configService";

export class AnalysisService {
  private knownFiles: Set<string> = new Set();
  private readonly importGraph = new ImportGraph();
  private isLargeWorkspace = false;
  private static readonly MAX_FILES_THRESHOLD = 5000;

  private readonly _onAnalysisReady = new vscode.EventEmitter<void>();
  public readonly onAnalysisReady = this._onAnalysisReady.event;

  private disposables: vscode.Disposable[] = [];

  constructor(private readonly workspaceRoot: string, private readonly configService: ConfigService) {
    this.disposables.push(
      this.configService.onAliasesChanged(() => {
        this.scanAndNotify();
      })
    );
  }

  public dispose() {
    this.disposables.forEach((d) => d.dispose());
    this._onAnalysisReady.dispose();
  }

  public getImportGraph(): ImportGraph {
    return this.importGraph;
  }

  public getKnownFiles(): Set<string> {
    return this.knownFiles;
  }

  public checkIsLargeWorkspace(): boolean {
    return this.isLargeWorkspace;
  }

  public getWorkspaceContext(): WorkspaceContext {
    return {
      root: this.workspaceRoot,
      knownFiles: this.knownFiles,
      aliases: this.configService.getAliases(),
    };
  }

  public async scan(ignorePatterns?: string[]): Promise<boolean> {
    const files = await vscode.workspace.findFiles(SOURCE_GLOB, "**/node_modules/**");
    const ignore = ignorePatterns ?? this.configService.getConfig()?.ignore;
    this.knownFiles = new Set(
      files
        .map((f) => f.fsPath)
        .filter((filePath) => !isIgnoredPath(filePath, this.workspaceRoot, ignore))
        .map((filePath) => normalizePath(filePath))
    );
    this.isLargeWorkspace = this.knownFiles.size > AnalysisService.MAX_FILES_THRESHOLD;
    this.importGraph.clear();
    return this.isLargeWorkspace;
  }

  public async scanAndNotify() {
    await this.scan();
    this._onAnalysisReady.fire();
  }

  public updateFile(filePath: string, content: string, ctx: WorkspaceContext) {
    const normalized = normalizePath(filePath);
    this.knownFiles.add(normalized);
    try {
      const fileDeps = getFileDependencies(normalized, content, ctx);
      this.importGraph.updateFile(normalized, fileDeps);
    } catch {
      // Ignore parse errors
    }
  }

  public removeFile(filePath: string) {
    const normalized = normalizePath(filePath);
    this.knownFiles.delete(normalized);
    this.importGraph.removeFile(normalized);
  }

  /**
   * Ensures the import graph is fully populated for all known files.
   * This is slow on first run but enables full-workspace analysis like circular deps.
   */
  public ensureGraphReady(ctx: WorkspaceContext) {
    if (this.isLargeWorkspace) {
      return;
    }

    for (const filePath of this.knownFiles) {
      if (!this.importGraph.getDependencies(filePath).size) {
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const fileDeps = getFileDependencies(filePath, content, ctx);
          this.importGraph.updateFile(filePath, fileDeps);
        } catch {
          continue;
        }
      }
    }
  }

  public computeCycles(config: PicketyConfig, ctx: WorkspaceContext): string[][] {
    if (this.isLargeWorkspace) {
      return [];
    }
    this.ensureGraphReady(ctx);
    const graph = this.importGraph.getModuleLevelGraph(config.modules, this.workspaceRoot);
    return findCycles(graph);
  }

  public computeHealthViolations(config: PicketyConfig, ctx: WorkspaceContext): HealthViolation[] {
    if (!config.health || this.isLargeWorkspace) {
      return [];
    }
    this.ensureGraphReady(ctx);
    const health = computeModuleHealth(this.importGraph, config.modules, ctx);
    return checkHealthThresholds(health, config.health);
  }
}
