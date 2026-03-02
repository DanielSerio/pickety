import * as vscode from "vscode";
import { checkBoundaries } from "../core/boundaries";
import { applyMaxViolations } from "../core/violations";
import { normalizePath, SOURCE_GLOB, getConfigPath } from "../shared/utils";
import { reportConfigErrors, reportConfigWarnings } from "./diagnostics";
import { generateMermaidDiagram } from "../core/diagram";
import type { PicketyConfig, ConfigResult, Violation } from "../shared/types";
import type { ConfigService } from "./configService";
import type { AnalysisService } from "./analysisService";
import type { DiagnosticManager } from "./diagnosticManager";
import type { PicketyStatusBar } from "../vscode/statusBar";
import type { ImpactCodeLensProvider } from "../vscode/impactCodeLens";
import { TelemetryProvider } from "./telemetry";

export interface DocumentValidatorOptions {
  context: vscode.ExtensionContext;
  configService: ConfigService;
  analysisService: AnalysisService;
  diagnosticManager: DiagnosticManager;
  statusBar: PicketyStatusBar;
  outputChannel: vscode.OutputChannel;
  workspaceRoot: string;
}

export class DocumentValidator implements vscode.Disposable {
  private telemetry = TelemetryProvider.getInstance();
  private disposables: vscode.Disposable[] = [];

  private codeLensProvider?: ImpactCodeLensProvider;

  public configRef: { config: PicketyConfig | undefined; } = { config: undefined };

  private readonly context: vscode.ExtensionContext;
  private readonly configService: ConfigService;
  private readonly analysisService: AnalysisService;
  private readonly diagnosticManager: DiagnosticManager;
  private readonly statusBar: PicketyStatusBar;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly workspaceRoot: string;

  constructor(options: DocumentValidatorOptions) {
    this.context = options.context;
    this.configService = options.configService;
    this.analysisService = options.analysisService;
    this.diagnosticManager = options.diagnosticManager;
    this.statusBar = options.statusBar;
    this.outputChannel = options.outputChannel;
    this.workspaceRoot = options.workspaceRoot;

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
      if (result.warnings && result.warnings.length > 0) {
        reportConfigWarnings({
          warnings: result.warnings,
          workspaceRoot: this.workspaceRoot,
          outputChannel: this.outputChannel,
          diagnosticCollection: this.diagnosticManager.getCollection(),
        });
      }
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
      reportConfigErrors({
        errors: result.errors,
        workspaceRoot: this.workspaceRoot,
        outputChannel: this.outputChannel,
        diagnosticCollection: this.diagnosticManager.getCollection(),
      });
      if (result.warnings && result.warnings.length > 0) {
        reportConfigWarnings({
          warnings: result.warnings,
          workspaceRoot: this.workspaceRoot,
          outputChannel: this.outputChannel,
          diagnosticCollection: this.diagnosticManager.getCollection(),
        });
      }
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

      const violationsByFile = new Map<string, Violation[]>();
      for (const v of adjusted) {
        const key = normalizePath(v.file);
        const list = violationsByFile.get(key);
        if (list) {
          list.push(v);
        } else {
          violationsByFile.set(key, [v]);
        }
      }

      for (const entry of allEntries) {
        const key = normalizePath(entry.uri.fsPath);
        this.diagnosticManager.setViolations(entry.uri, violationsByFile.get(key) ?? []);
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

  private analyzeDocumentText(document: vscode.TextDocument, text: string) {
    const config = this.configService.getConfig();
    if (!config || !this.isSourceFile(document)) {
      return;
    }

    if (this.hasMaxViolationsRules(config)) {
      this.analyzeOpenEditorsWithOverride(document, text);
      return;
    }

    const violations = this.checkDocumentText(document.uri.fsPath, text, config);
    this.diagnosticManager.setViolations(document.uri, violations);
    this.statusBar.update(config, this.diagnosticManager.getCollection());
  }

  private checkDocument(document: vscode.TextDocument, config: PicketyConfig): Violation[] {
    return this.checkDocumentText(document.uri.fsPath, document.getText(), config);
  }

  private checkDocumentText(filePath: string, content: string, config: PicketyConfig): Violation[] {
    return checkBoundaries({
      filePath,
      content,
      config,
      ctx: this.analysisService.getWorkspaceContext(),
    });
  }

  private hasMaxViolationsRules(config: PicketyConfig): boolean {
    return config.rules["module-boundaries"].rules.some((r) => r.maxViolations !== undefined);
  }

  private analyzeOpenEditorsWithOverride(document: vscode.TextDocument, text: string) {
    const config = this.configService.getConfig();
    if (!config) {
      return;
    }

    const allEntries: { uri: vscode.Uri; violations: Violation[]; }[] = [];
    for (const openDoc of vscode.workspace.textDocuments) {
      if (this.isSourceFile(openDoc)) {
        const content = normalizePath(openDoc.uri.fsPath) === normalizePath(document.uri.fsPath)
          ? text
          : openDoc.getText();
        allEntries.push({
          uri: openDoc.uri,
          violations: this.checkDocumentText(openDoc.uri.fsPath, content, config)
        });
      }
    }

    const allViolations = allEntries.flatMap((e) => e.violations);
    const adjusted = applyMaxViolations(allViolations, config);

    const violationsByFile = new Map<string, Violation[]>();
    for (const v of adjusted) {
      const key = normalizePath(v.file);
      const list = violationsByFile.get(key);
      if (list) {
        list.push(v);
      } else {
        violationsByFile.set(key, [v]);
      }
    }

    for (const entry of allEntries) {
      const key = normalizePath(entry.uri.fsPath);
      this.diagnosticManager.setViolations(entry.uri, violationsByFile.get(key) ?? []);
    }

    this.statusBar.update(config, this.diagnosticManager.getCollection());

    setTimeout(() => {
      this.checkCircularDependencies(config);
      this.checkHealthThresholds(config);
    }, 0);
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
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (!this.isSourceFile(document)) {
          return;
        }

        this.analysisService.updateFile(document.uri.fsPath, document.getText(), this.analysisService.getWorkspaceContext());
        this.analyzeDocument(document);
        this.codeLensProvider?.refresh();
      })
    );

    const fileWatcher = vscode.workspace.createFileSystemWatcher(SOURCE_GLOB);
    this.disposables.push(fileWatcher);
    fileWatcher.onDidCreate((uri) => {
      this.analysisService.getKnownFiles().add(normalizePath(uri.fsPath));
    });
    fileWatcher.onDidDelete((uri) => {
      this.analysisService.removeFile(uri.fsPath);
      this.codeLensProvider?.refresh();
    });
    fileWatcher.onDidChange((uri) => {
      void this.handleExternalChange(uri);
    });
  }

  private async handleExternalChange(uri: vscode.Uri) {
    const doc = vscode.workspace.textDocuments.find(
      (d) => normalizePath(d.uri.fsPath) === normalizePath(uri.fsPath)
    );
    if (!doc) {
      return;
    }

    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(raw).toString("utf8");
      this.analysisService.updateFile(
        doc.uri.fsPath,
        text,
        this.analysisService.getWorkspaceContext()
      );
      this.analyzeDocumentText(doc, text);
      this.codeLensProvider?.refresh();
    } catch (e) {
      this.telemetry.logError(e instanceof Error ? e : String(e), "handleExternalChange");
    }
  }

  private isSourceFile(document: vscode.TextDocument): boolean {
    return ["typescript", "typescriptreact", "javascript", "javascriptreact"].includes(document.languageId);
  }

  public dispose() {
    this.disposables.forEach(d => d.dispose());
  }
}
