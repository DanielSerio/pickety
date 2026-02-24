import * as vscode from "vscode";
import { checkBoundaries } from "../core/boundaries";
import { applyMaxViolations } from "../core/violations";
import { normalizePath, SOURCE_GLOB, getConfigPath } from "../shared/utils";
import { reportConfigErrors } from "./diagnostics";
import { generateMermaidDiagram } from "../core/diagram";
import type { PicketyConfig, ConfigResult, Violation } from "../shared/types";
import type { ConfigService } from "./configService";
import type { AnalysisService } from "./analysisService";
import type { DiagnosticManager } from "./diagnosticManager";
import type { PicketyStatusBar } from "../vscode/statusBar";
import type { ImpactCodeLensProvider } from "../vscode/impactCodeLens";
import { TelemetryProvider } from "./telemetry";

export class DocumentValidator implements vscode.Disposable {
  private analysisTimeout: NodeJS.Timeout | undefined;
  private telemetry = TelemetryProvider.getInstance();
  private disposables: vscode.Disposable[] = [];

  private codeLensProvider?: ImpactCodeLensProvider;

  public configRef: { config: PicketyConfig | undefined; } = { config: undefined };

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly configService: ConfigService,
    private readonly analysisService: AnalysisService,
    private readonly diagnosticManager: DiagnosticManager,
    private readonly statusBar: PicketyStatusBar,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly workspaceRoot: string
  ) {
    this.registerEventListeners();
  }

  public setCodeLensProvider(provider: ImpactCodeLensProvider) {
    this.codeLensProvider = provider;
  }

  public handleConfigResult(result: ConfigResult) {
    this.diagnosticManager.clear();
    const config = result.ok ? result.config : undefined;
    this.configRef.config = config;

    if (result.ok && result.config) {
      this.outputChannel.appendLine("Pickety: Import boundaries active");
      try {
        const diagramPath = generateMermaidDiagram(result.config, this.workspaceRoot);
        if (diagramPath) {
          this.outputChannel.appendLine(`Pickety: Generated boundary diagram at ${diagramPath}`);
        }
      } catch (e) {
        this.outputChannel.appendLine(`Pickety: Failed to generate boundary diagram: ${e instanceof Error ? e.message : String(e)}`);
      }
      this.analyzeOpenEditors();
    } else if (!result.ok) {
      reportConfigErrors(result.errors, this.workspaceRoot, this.outputChannel, this.diagnosticManager.getCollection());
    }
    this.statusBar.update(config, this.diagnosticManager.getCollection());
  }

  public analyzeOpenEditors() {
    try {
      const config = this.configService.getConfig();
      if (!config) {
        return;
      }

      const allEntries: { uri: vscode.Uri; violations: Violation[]; }[] = [];
      for (const document of vscode.workspace.textDocuments) {
        if (this.isSourceFile(document)) {
          allEntries.push({ uri: document.uri, violations: this.checkDocument(document, config) });
        }
      }

      const allViolations = allEntries.flatMap((e) => e.violations);
      const adjusted = applyMaxViolations(allViolations, config);

      let offset = 0;
      for (const entry of allEntries) {
        const count = entry.violations.length;
        this.diagnosticManager.setViolations(entry.uri, adjusted.slice(offset, offset + count));
        offset += count;
      }

      this.statusBar.update(config, this.diagnosticManager.getCollection());

      // Perform heavy graph analysis in background
      setTimeout(() => {
        this.checkCircularDependencies(config);
        this.checkHealthThresholds(config);
      }, 0);
    } catch (e) {
      this.telemetry.logError(e instanceof Error ? e : String(e), "analyzeOpenEditors");
    }
  }

  private analyzeDocument(document: vscode.TextDocument) {
    const config = this.configService.getConfig();
    if (!config || !this.isSourceFile(document)) {
      return;
    }

    if (this.hasMaxViolationsRules(config)) {
      this.analyzeOpenEditors();
      return;
    }

    const violations = this.checkDocument(document, config);
    this.diagnosticManager.setViolations(document.uri, violations);
    this.statusBar.update(config, this.diagnosticManager.getCollection());
  }

  private checkDocument(document: vscode.TextDocument, config: PicketyConfig): Violation[] {
    return checkBoundaries(
      document.uri.fsPath,
      document.getText(),
      config,
      this.analysisService.getWorkspaceContext()
    );
  }

  private hasMaxViolationsRules(config: PicketyConfig): boolean {
    return config.rules["module-boundaries"].rules.some((r) => r.maxViolations !== undefined);
  }

  private checkCircularDependencies(config: PicketyConfig) {
    const cycles = this.analysisService.computeCycles(config, this.analysisService.getWorkspaceContext());
    const configUri = vscode.Uri.file(getConfigPath(this.workspaceRoot));
    this.diagnosticManager.setCircularDiagnostics(configUri, cycles);
  }

  private checkHealthThresholds(config: PicketyConfig) {
    const violations = this.analysisService.computeHealthViolations(config, this.analysisService.getWorkspaceContext());
    const configUri = vscode.Uri.file(getConfigPath(this.workspaceRoot));
    this.diagnosticManager.setHealthDiagnostics(configUri, violations);
  }

  private registerEventListeners() {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (!this.isSourceFile(event.document)) {
          return;
        }

        this.diagnosticManager.delete(event.document.uri);
        if (this.analysisTimeout) {
          clearTimeout(this.analysisTimeout);
        }

        this.analysisTimeout = setTimeout(() => {
          this.analysisService.updateFile(event.document.uri.fsPath, event.document.getText(), this.analysisService.getWorkspaceContext());
          this.analyzeDocument(event.document);
          this.codeLensProvider?.refresh();
        }, 300);
      })
    );

    this.disposables.push(vscode.workspace.onDidOpenTextDocument((document) => this.analyzeDocument(document)));

    const fileWatcher = vscode.workspace.createFileSystemWatcher(SOURCE_GLOB);
    this.disposables.push(fileWatcher);
    fileWatcher.onDidCreate((uri) => {
      this.analysisService.getKnownFiles().add(normalizePath(uri.fsPath));
    });
    fileWatcher.onDidDelete((uri) => {
      this.analysisService.removeFile(uri.fsPath);
      this.codeLensProvider?.refresh();
    });
  }

  private isSourceFile(document: vscode.TextDocument): boolean {
    return ["typescript", "typescriptreact", "javascript", "javascriptreact"].includes(document.languageId);
  }

  public dispose() {
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout);
    }
    this.disposables.forEach(d => d.dispose());
  }
}
