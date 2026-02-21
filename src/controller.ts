import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { loadConfig, loadTsConfigAliases } from "./core/config";
import { checkBoundaries, applyMaxViolations, getModuleDependencies } from "./core/boundaries";
import { generateMermaidDiagram } from "./core/diagram";
import { ImportGraph, getFileDependencies } from "./core/graph";
import { matchFileToModule } from "./core/imports";
import {
  normalizePath,
  SOURCE_GLOB,
  CONFIG_FILENAME,
  findCycles,
  getConfigPath,
  formatHealthMetricValue,
} from "./core/utils";
import { PicketyStatusBar } from "./statusBar";
import { ImpactCodeLensProvider } from "./impactCodeLens";
import { reportConfigErrors } from "./diagnostics";
import type { PicketyConfig, ConfigResult, Violation, PicketyMetadata, WorkspaceContext } from "./types";
import { goToRule, allowImport } from "./navigation";
import { PicketyCodeActionProvider } from "./codeActions";
import { computeModuleHealth, checkHealthThresholds } from "./core/health";
import { showHealthPanel } from "./healthPanel";
import { initCommand } from "./commands/init";
import { generateDiagramCommand } from "./commands/generateDiagram";
import { showHealthCommand } from "./commands/showHealth";
import { showImpactCommand } from "./commands/showImpact";

import { DiagnosticManager } from "./diagnosticManager";
import { TelemetryProvider } from "./telemetry";

export class PicketyController {
  private config: PicketyConfig | undefined;
  private aliases: Record<string, string> = {};
  private knownFiles: Set<string> = new Set();
  private diagnosticManager: DiagnosticManager;
  private outputChannel: vscode.OutputChannel;
  private analysisTimeout: NodeJS.Timeout | undefined;
  private dependencyGraph = new Map<string, { sourceModule: string; targetModules: Set<string>; }>();
  private codeLensProvider: ImpactCodeLensProvider | undefined;
  private configRef: { config: PicketyConfig | undefined; } = { config: undefined };
  private isLargeWorkspace = false;
  private static readonly MAX_FILES_THRESHOLD = 5000;
  private telemetry = TelemetryProvider.getInstance();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly workspaceRoot: string,
    private readonly importGraph: ImportGraph,
    private readonly statusBar: PicketyStatusBar
  ) {
    this.outputChannel = vscode.window.createOutputChannel("Pickety");
    this.context.subscriptions.push(this.outputChannel);
    this.telemetry.setOutputChannel(this.outputChannel);

    const collection = vscode.languages.createDiagnosticCollection("pickety");
    this.context.subscriptions.push(collection);
    this.diagnosticManager = new DiagnosticManager(collection);
  }

  public async activate() {
    this.outputChannel.appendLine(`Pickety: Extension activated for workspace: ${this.workspaceRoot}`);
    this.registerWatchers();
    this.registerCommands();
    this.registerProviders();
    this.registerEventListeners();

    // Initial run
    this.outputChannel.appendLine("Pickety: Performing initial scan...");
    this.reload();
    this.reloadAliases();
    await this.refreshKnownFiles();
    this.analyzeOpenEditors();
    this.statusBar.update(this.config, this.diagnosticManager.getCollection());
  }

  public dispose() {
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout);
    }
    this.statusBar.dispose();
    this.diagnosticManager.dispose();
    this.outputChannel.dispose();
  }

  private getWorkspaceContext(): WorkspaceContext {
    return {
      root: this.workspaceRoot,
      knownFiles: this.knownFiles,
      aliases: this.aliases
    };
  }

  private async refreshKnownFiles() {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Pickety: Scanning workspace...",
        cancellable: false,
      },
      async () => {
        const files = await vscode.workspace.findFiles(SOURCE_GLOB, "**/node_modules/**");
        this.knownFiles = new Set(files.map((f) => normalizePath(f.fsPath)));

        if (this.knownFiles.size > PicketyController.MAX_FILES_THRESHOLD) {
          this.isLargeWorkspace = true;
          this.outputChannel.appendLine(`Pickety: Warning: Large workspace detected (${this.knownFiles.size} files). Full workspace analysis (circular dependencies, health metrics) will be disabled for performance.`);
        } else {
          this.isLargeWorkspace = false;
        }
      }
    );
  }

  private analyzeDocument(document: vscode.TextDocument) {
    if (!this.config || !this.isSourceFile(document)) {
      return;
    }

    if (this.hasMaxViolationsRules()) {
      this.analyzeOpenEditors();
      return;
    }

    const violations = this.checkDocument(document);
    this.diagnosticManager.setViolations(document.uri, violations);
    this.statusBar.update(this.config, this.diagnosticManager.getCollection());
  }

  private analyzeOpenEditors() {
    try {
      if (!this.config) {
        return;
      }

      const ctx = this.getWorkspaceContext();
      const allEntries: { uri: vscode.Uri; violations: Violation[]; }[] = [];
      for (const document of vscode.workspace.textDocuments) {
        if (this.isSourceFile(document)) {
          allEntries.push({ uri: document.uri, violations: this.checkDocument(document) });
        }
      }

      const allViolations = allEntries.flatMap((e) => e.violations);
      const adjusted = applyMaxViolations(allViolations, this.config);

      let offset = 0;
      for (const entry of allEntries) {
        const count = entry.violations.length;
        this.diagnosticManager.setViolations(entry.uri, adjusted.slice(offset, offset + count));
        offset += count;
      }

      this.statusBar.update(this.config, this.diagnosticManager.getCollection());
      this.checkCircularDependencies();
      this.checkHealthThresholds();
    } catch (e) {
      this.telemetry.logError(e instanceof Error ? e : String(e), "analyzeOpenEditors");
    }
  }

  private updateDependencyCache(document: vscode.TextDocument) {
    if (!this.config) {
      return;
    }
    const filePath = normalizePath(document.uri.fsPath);
    const content = document.getText();
    const ctx = this.getWorkspaceContext();

    try {
      const deps = getModuleDependencies(
        document.uri.fsPath,
        content,
        this.config,
        ctx
      );
      if (deps) {
        this.dependencyGraph.set(filePath, deps);
      } else {
        this.dependencyGraph.delete(filePath);
      }

      // Update file-level import graph (incremental — only this file's edges)
      const fileDeps = getFileDependencies(
        document.uri.fsPath,
        content,
        ctx
      );
      this.importGraph.updateFile(filePath, fileDeps);
      this.codeLensProvider?.refresh();
    } catch {
      // Ignore
    }
  }

  private checkDocument(document: vscode.TextDocument): Violation[] {
    if (!this.config || !this.isSourceFile(document)) {
      return [];
    }

    return checkBoundaries(
      document.uri.fsPath,
      document.getText(),
      this.config,
      this.getWorkspaceContext()
    );
  }


  private hasMaxViolationsRules(): boolean {
    return this.config?.rules["module-boundaries"].rules.some((r) => r.maxViolations !== undefined) ?? false;
  }

  private async checkCircularDependencies() {
    if (!this.config || this.isLargeWorkspace) {
      return;
    }

    const ctx = this.getWorkspaceContext();
    // Ensure both graphs are fully populated for all known files
    for (const filePath of this.knownFiles) {
      if (!this.importGraph.getDependencies(filePath).size && !this.dependencyGraph.has(filePath)) {
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const fileDeps = getFileDependencies(filePath, content, ctx);
          this.importGraph.updateFile(filePath, fileDeps);

          const modDeps = getModuleDependencies(filePath, content, this.config, ctx);
          if (modDeps) {
            this.dependencyGraph.set(filePath, modDeps);
          }
        } catch {
          continue;
        }
      }
    }

    const graph = this.importGraph.getModuleLevelGraph(this.config.modules, this.workspaceRoot);
    const configUri = vscode.Uri.file(getConfigPath(this.workspaceRoot));

    const cycles = findCycles(graph);
    this.diagnosticManager.setCircularDiagnostics(configUri, cycles);
  }

  private checkHealthThresholds() {
    if (!this.config?.health || this.isLargeWorkspace) {
      return;
    }

    const health = computeModuleHealth(
      this.importGraph,
      this.config.modules,
      this.getWorkspaceContext()
    );

    const violations = checkHealthThresholds(health, this.config.health);
    const configUri = vscode.Uri.file(getConfigPath(this.workspaceRoot));
    this.diagnosticManager.setHealthDiagnostics(configUri, violations);
  }

  private handleConfigResult(result: ConfigResult) {
    this.diagnosticManager.clear();
    if (result.ok) {
      this.config = result.config;
      this.updateConfigRef();
      this.outputChannel.appendLine("Pickety: Import boundaries active");
      this.dependencyGraph.clear();
      this.importGraph.clear();
      try {
        const diagramPath = generateMermaidDiagram(result.config, this.workspaceRoot);
        if (diagramPath) {
          this.outputChannel.appendLine(`Pickety: Generated boundary diagram at ${diagramPath}`);
        }
      } catch (e) {
        this.outputChannel.appendLine(`Pickety: Failed to generate boundary diagram: ${e instanceof Error ? e.message : String(e)}`);
      }
      this.analyzeOpenEditors();
      this.statusBar.update(this.config, this.diagnosticManager.getCollection());
    } else {
      this.config = undefined;
      this.updateConfigRef();
      reportConfigErrors(result.errors, this.workspaceRoot, this.outputChannel, this.diagnosticManager.getCollection());
      this.statusBar.update(this.config, this.diagnosticManager.getCollection());
    }
  }

  // Keep the shared config reference in sync so CodeLens sees the latest config
  private updateConfigRef() {
    this.configRef.config = this.config;
  }

  private reloadAliases() {
    this.aliases = loadTsConfigAliases(this.workspaceRoot);
    this.outputChannel.appendLine(`Pickety: Loaded ${Object.keys(this.aliases).length} path aliases`);
    this.dependencyGraph.clear();
    this.importGraph.clear();
    this.analyzeOpenEditors();
  }

  private reload() {
    const res = loadConfig(this.workspaceRoot);
    this.handleConfigResult(res);
  }

  private registerWatchers() {
    const configWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.workspaceRoot, CONFIG_FILENAME));
    this.context.subscriptions.push(configWatcher);
    configWatcher.onDidChange(() => this.reload());
    configWatcher.onDidCreate(() => this.reload());
    configWatcher.onDidDelete(() => {
      this.config = undefined;
      this.diagnosticManager.clear();
      this.outputChannel.appendLine("Pickety: pickety.json deleted, inactive");
      this.statusBar.update(undefined, this.diagnosticManager.getCollection());
    });

    const tsConfigWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.workspaceRoot, "tsconfig*.json"));
    this.context.subscriptions.push(tsConfigWatcher);
    tsConfigWatcher.onDidChange(() => this.reloadAliases());
    tsConfigWatcher.onDidCreate(() => this.reloadAliases());
    tsConfigWatcher.onDidDelete(() => this.reloadAliases());

    const fileWatcher = vscode.workspace.createFileSystemWatcher(SOURCE_GLOB);
    this.context.subscriptions.push(fileWatcher);
    fileWatcher.onDidCreate((uri) => {
      this.knownFiles.add(normalizePath(uri.fsPath));
    });
    fileWatcher.onDidDelete((uri) => {
      const deleted = normalizePath(uri.fsPath);
      this.knownFiles.delete(deleted);
      this.importGraph.removeFile(deleted);
      this.codeLensProvider?.refresh();
    });
  }

  private registerCommands() {
    this.context.subscriptions.push(
      vscode.commands.registerCommand("pickety.refresh", () => {
        this.reload();
        this.reloadAliases();
        this.refreshKnownFiles().then(() => this.analyzeOpenEditors());
        vscode.window.showInformationMessage("Pickety: Configuration refreshed");
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand("pickety.generateDiagram", () =>
        generateDiagramCommand(this.config, this.importGraph, this.getWorkspaceContext())
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand("pickety.showImpact", () =>
        showImpactCommand(this.config, this.importGraph, this.getWorkspaceContext())
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand("pickety.showHealth", () =>
        showHealthCommand(this.config, this.importGraph, this.getWorkspaceContext())
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand("pickety.goToRule", (root: string, rule: string | number) =>
        goToRule(root, rule)
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand("pickety.allowImport", (root: string, importer: string, target: string) =>
        allowImport(root, importer, target)
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand("pickety.init", () =>
        initCommand(this.workspaceRoot, () => this.reload())
      )
    );
  }

  private registerProviders() {
    this.context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider({ scheme: "file", language: "*" }, new PicketyCodeActionProvider(this.workspaceRoot), {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
      })
    );

    // Impact analysis CodeLens — reads from cached import graph, never triggers recomputation
    this.codeLensProvider = new ImpactCodeLensProvider(this.importGraph, this.workspaceRoot, this.configRef);
    this.context.subscriptions.push(this.codeLensProvider);
    this.context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        { scheme: "file", pattern: SOURCE_GLOB },
        this.codeLensProvider
      )
    );
  }

  private registerEventListeners() {
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (!this.isSourceFile(event.document)) {
          return;
        }

        this.diagnosticManager.delete(event.document.uri);

        if (this.analysisTimeout) {
          clearTimeout(this.analysisTimeout);
        }

        this.analysisTimeout = setTimeout(() => {
          this.updateDependencyCache(event.document);
          this.analyzeDocument(event.document);
        }, 300);
      })
    );

    this.context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((document) => this.analyzeDocument(document)));
  }

  private isSourceFile(document: vscode.TextDocument): boolean {
    return ["typescript", "typescriptreact", "javascript", "javascriptreact"].includes(document.languageId);
  }
}
