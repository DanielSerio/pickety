import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { loadConfig, loadTsConfigAliases } from "./core/config";
import { checkBoundaries, applyMaxViolations, getModuleDependencies } from "./core/boundaries";
import { generateMermaidDiagram } from "./core/diagram";
import { ImportGraph, getFileDependencies } from "./core/graph";
import { matchFileToModule } from "./core/imports";
import { normalizePath, SOURCE_GLOB, CONFIG_FILENAME, findCycles } from "./core/utils";
import { PicketyStatusBar } from "./statusBar";
import { ImpactCodeLensProvider } from "./impactCodeLens";
import { reportConfigErrors } from "./diagnostics";
import type { PicketyConfig, ConfigResult, Violation, PicketyMetadata } from "./types";
import { goToRule, allowImport } from "./navigation";
import { PicketyCodeActionProvider } from "./codeActions";
import { computeModuleHealth, checkHealthThresholds } from "./core/health";
import { showHealthPanel } from "./healthPanel";

export class PicketyController {
  private config: PicketyConfig | undefined;
  private aliases: Record<string, string> = {};
  private knownFiles: Set<string> = new Set();
  private diagnosticCollection: vscode.DiagnosticCollection;
  private outputChannel: vscode.OutputChannel;
  private statusBar: PicketyStatusBar;
  private analysisTimeout: NodeJS.Timeout | undefined;
  private dependencyGraph = new Map<string, { sourceModule: string; targetModules: Set<string>; }>();
  private importGraph = new ImportGraph();
  private codeLensProvider: ImpactCodeLensProvider | undefined;
  private configRef: { config: PicketyConfig | undefined } = { config: undefined };

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly workspaceRoot: string
  ) {
    this.outputChannel = vscode.window.createOutputChannel("Pickety");
    this.context.subscriptions.push(this.outputChannel);

    this.diagnosticCollection = vscode.languages.createDiagnosticCollection("pickety");
    this.context.subscriptions.push(this.diagnosticCollection);

    this.statusBar = new PicketyStatusBar(this.context);
    this.context.subscriptions.push(this.statusBar);
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
    this.statusBar.update(this.config, this.diagnosticCollection);
  }

  public dispose() {
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout);
    }
    this.statusBar.dispose();
    this.diagnosticCollection.dispose();
    this.outputChannel.dispose();
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
    this.setDiagnostics(document.uri, violations);
    this.statusBar.update(this.config, this.diagnosticCollection);
  }

  private analyzeOpenEditors() {
    if (!this.config) {
      return;
    }

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
      this.setDiagnostics(entry.uri, adjusted.slice(offset, offset + count));
      offset += count;
    }

    this.statusBar.update(this.config, this.diagnosticCollection);
    this.checkCircularDependencies();
    this.checkHealthThresholds();
  }

  private updateDependencyCache(document: vscode.TextDocument) {
    if (!this.config) {
      return;
    }
    const filePath = normalizePath(document.uri.fsPath);
    const content = document.getText();
    try {
      const deps = getModuleDependencies(
        document.uri.fsPath,
        content,
        this.config,
        this.knownFiles,
        this.workspaceRoot,
        this.aliases
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
        this.knownFiles,
        this.workspaceRoot,
        this.aliases
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
      this.knownFiles,
      this.workspaceRoot,
      this.aliases
    );
  }

  private setDiagnostics(uri: vscode.Uri, violations: Violation[]) {
    const diagnostics = violations.map((v) => {
      const range = new vscode.Range(v.line, v.character, v.line, v.character + v.length);
      const severity = v.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;

      const diagnostic = new vscode.Diagnostic(range, v.message, severity);
      diagnostic.source = "pickety";
      if (v.ruleName) {
        diagnostic.code = {
          value: v.ruleName,
          target: vscode.Uri.parse(`https://github.com/DanielSerio/pickety/blob/main/docs/rules.md#${v.ruleName}`),
        };
      }
      (diagnostic as vscode.Diagnostic & { _picketyMetadata: PicketyMetadata; })._picketyMetadata = {
        sourceModule: v.sourceModule,
        targetModule: v.targetModule
      };
      return diagnostic;
    });

    this.diagnosticCollection.set(uri, diagnostics);
  }

  private hasMaxViolationsRules(): boolean {
    return this.config?.rules["module-boundaries"].rules.some((r) => r.maxViolations !== undefined) ?? false;
  }

  private async checkCircularDependencies() {
    if (!this.config) {
      return;
    }

    const graph = new Map<string, Set<string>>();
    const configUri = vscode.Uri.file(path.join(this.workspaceRoot, CONFIG_FILENAME));

    // Use cached dependency graph where possible
    for (const filePath of this.knownFiles) {
      let deps = this.dependencyGraph.get(filePath);

      if (!deps) {
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          deps = getModuleDependencies(filePath, content, this.config, this.knownFiles, this.workspaceRoot, this.aliases);
          if (deps) {
            this.dependencyGraph.set(filePath, deps);
          }

          // Build file-level edges during the same scan — no extra I/O
          const fileDeps = getFileDependencies(filePath, content, this.knownFiles, this.workspaceRoot, this.aliases);
          this.importGraph.updateFile(filePath, fileDeps);
        } catch {
          continue;
        }
      }

      if (deps) {
        if (!graph.has(deps.sourceModule)) {
          graph.set(deps.sourceModule, new Set());
        }
        const sourceSet = graph.get(deps.sourceModule)!;
        for (const target of deps.targetModules) {
          sourceSet.add(target);
        }
      }
    }

    const cycles = findCycles(graph);
    const diagnostics = (this.diagnosticCollection.get(configUri) || [])
      .filter(d => !d.message.includes("Circular dependency"));

    if (cycles.length > 0) {
      for (const cycle of cycles) {
        const cycleStr = cycle.join(" -> ");
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 100),
          `Circular dependency detected: ${cycleStr}`,
          vscode.DiagnosticSeverity.Error
        );
        diagnostic.source = "pickety";
        diagnostics.push(diagnostic);
      }
    }

    this.diagnosticCollection.set(configUri, diagnostics);
  }

  private checkHealthThresholds() {
    if (!this.config?.health) {
      return;
    }

    const health = computeModuleHealth(
      this.importGraph,
      this.config.modules,
      this.workspaceRoot,
      this.knownFiles
    );

    const violations = checkHealthThresholds(health, this.config.health);
    if (violations.length === 0) {
      return;
    }

    const configUri = vscode.Uri.file(path.join(this.workspaceRoot, CONFIG_FILENAME));
    const existing = (this.diagnosticCollection.get(configUri) || [])
      .filter(d => !d.message.includes("has") || !d.message.includes("(max:"));

    for (const v of violations) {
      const valueStr = v.metric === "instability" ? v.value.toFixed(2) : String(v.value);
      const thresholdStr = v.metric === "instability" ? v.threshold.toFixed(2) : String(v.threshold);
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 100),
        `Module "${v.moduleName}" has ${v.metric} of ${valueStr} (max: ${thresholdStr})`,
        vscode.DiagnosticSeverity.Warning
      );
      diagnostic.source = "pickety";
      existing.push(diagnostic);
    }

    this.diagnosticCollection.set(configUri, existing);
  }

  private handleConfigResult(result: ConfigResult) {
    this.diagnosticCollection.clear();
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
      this.statusBar.update(this.config, this.diagnosticCollection);
    } else {
      this.config = undefined;
      this.updateConfigRef();
      reportConfigErrors(result.errors, this.workspaceRoot, this.outputChannel, this.diagnosticCollection);
      this.statusBar.update(this.config, this.diagnosticCollection);
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
      this.diagnosticCollection.clear();
      this.outputChannel.appendLine("Pickety: pickety.json deleted, inactive");
      this.statusBar.update(undefined, this.diagnosticCollection);
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
      vscode.commands.registerCommand("pickety.generateDiagram", () => {
        if (!this.config) {
          vscode.window.showErrorMessage("Pickety: No active configuration. Check pickety.json for errors.");
          return;
        }
        // Compute health metrics for diagram annotations (on-demand only)
        const health = computeModuleHealth(
          this.importGraph,
          this.config.modules,
          this.workspaceRoot,
          this.knownFiles
        );
        const diagramPath = generateMermaidDiagram(this.config, this.workspaceRoot, health);
        if (diagramPath) {
          vscode.window.showInformationMessage(`Pickety: Generated boundary diagram at ${diagramPath}`);
        } else {
          vscode.window.showErrorMessage("Pickety: Failed to generate diagram. Is 'boundary-diagrams' enabled in pickety.json?");
        }
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand("pickety.showImpact", () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !this.config) {
          vscode.window.showErrorMessage("Pickety: No active file or configuration.");
          return;
        }

        const filePath = normalizePath(editor.document.uri.fsPath);
        const transitive = this.importGraph.getTransitiveDependents(filePath);

        if (transitive.size === 0) {
          vscode.window.showInformationMessage("Pickety: No dependents found for this file.");
          return;
        }

        // Group dependents by module
        const byModule = new Map<string, string[]>();
        for (const dep of transitive) {
          const mod = matchFileToModule(dep, this.config.modules, this.workspaceRoot) ?? "(unmatched)";
          if (!byModule.has(mod)) {
            byModule.set(mod, []);
          }
          byModule.get(mod)!.push(path.relative(this.workspaceRoot, dep).replace(/\\/g, "/"));
        }

        // Build QuickPick items grouped by module
        const items: vscode.QuickPickItem[] = [];
        for (const [mod, files] of byModule) {
          items.push({ label: mod, kind: vscode.QuickPickItemKind.Separator });
          for (const file of files) {
            items.push({ label: file, description: mod });
          }
        }

        const relativePath = path.relative(this.workspaceRoot, filePath).replace(/\\/g, "/");
        const moduleCount = byModule.size;
        vscode.window.showQuickPick(items, {
          title: `Impact: ${relativePath} (${transitive.size} files across ${moduleCount} modules)`,
          placeHolder: "Select a file to open",
        }).then((selected) => {
          if (selected && selected.kind !== vscode.QuickPickItemKind.Separator) {
            const absPath = path.join(this.workspaceRoot, selected.label);
            vscode.workspace.openTextDocument(absPath).then((doc) => {
              vscode.window.showTextDocument(doc);
            });
          }
        });
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand("pickety.showHealth", () => {
        if (!this.config) {
          vscode.window.showErrorMessage("Pickety: No active configuration. Check pickety.json for errors.");
          return;
        }

        const health = computeModuleHealth(
          this.importGraph,
          this.config.modules,
          this.workspaceRoot,
          this.knownFiles
        );

        showHealthPanel(health, this.config.health);
      })
    );

    this.context.subscriptions.push(vscode.commands.registerCommand("pickety.goToRule", (root: string, rule: string | number) => goToRule(root, rule)));
    this.context.subscriptions.push(vscode.commands.registerCommand("pickety.allowImport", (root: string, importer: string, target: string) => allowImport(root, importer, target)));

    this.context.subscriptions.push(
      vscode.commands.registerCommand("pickety.init", async () => {
        const configPath = path.join(this.workspaceRoot, CONFIG_FILENAME);
        if (fs.existsSync(configPath)) {
          const choice = await vscode.window.showWarningMessage(
            "pickety.json already exists. Overwrite?",
            "Yes",
            "No"
          );
          if (choice !== "Yes") {
            return;
          }
        }

        const defaultConfig = {
          $schema: "https://raw.githubusercontent.com/DanielSerio/pickety/main/src/pickety.schema.json",
          modules: {
            features: "src/features/*",
            components: "src/components/**/*",
            utils: "src/utils/**/*",
          },
          rules: {
            "module-boundaries": {
              severity: "error",
              rules: [
                {
                  importer: "features",
                  imports: "features",
                  allow: true,
                  message: "Features can import from their own module.",
                },
                {
                  importer: "features",
                  imports: "components",
                  allow: true,
                },
                {
                  importer: "features",
                  imports: "utils",
                  allow: true,
                },
              ],
            },
          },
          "boundary-diagrams": true,
        };

        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        vscode.window.showInformationMessage("Pickety: pickety.json created.");
        const doc = await vscode.workspace.openTextDocument(configPath);
        await vscode.window.showTextDocument(doc);
        this.reload();
      })
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

        this.diagnosticCollection.delete(event.document.uri);

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
