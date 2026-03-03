import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { checkBoundaries } from "../core/boundaries";
import { applyMaxViolations } from "../core/violations";
import { normalizePath, SOURCE_GLOB, getConfigPath, isIgnoredPath } from "../shared/utils";
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
  private static readonly DIAGRAM_GITIGNORE_KEY = "pickety.diagramGitignoreAdded";
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
  private readonly workspaceViolations = new Map<string, Violation[]>();

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
    this.workspaceViolations.clear();
    const config = result.ok ? result.config : undefined;
    this.configRef.config = config;

    if (result.ok && config) {
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
        const diagramPath = generateMermaidDiagram(config, this.workspaceRoot);
        if (diagramPath) {
          this.outputChannel.appendLine(`Pickety: Generated boundary diagram at ${diagramPath}`);
          void this.ensureDefaultDiagramIgnored(diagramPath);
        }
      } catch (e) {
        this.outputChannel.appendLine(`Pickety: Failed to generate boundary diagram: ${e instanceof Error ? e.message : String(e)}`);
      }

      // Initial scan
      void this.analyzeWorkspace();
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

  private publishDiagnostics() {
    const config = this.configService.getConfig();
    if (!config) {
      return;
    }

    const allViolations: Violation[] = [];
    for (const violations of this.workspaceViolations.values()) {
      allViolations.push(...violations);
    }

    const adjustedViolations = applyMaxViolations(allViolations, config);

    // Group by file
    const violationsByFile = new Map<string, Violation[]>();
    for (const v of adjustedViolations) {
      const key = normalizePath(v.file);
      const list = violationsByFile.get(key);
      if (list) {
        list.push(v);
      } else {
        violationsByFile.set(key, [v]);
      }
    }

    // Update diagnostics for files that have violations, OR were previously in our violations map but now have 0
    // We only need to iterate over files that ARE or WERE in our map.
    for (const filePath of this.workspaceViolations.keys()) {
      const uri = vscode.Uri.file(filePath);
      const violations = violationsByFile.get(filePath) ?? [];
      this.diagnosticManager.setViolations(uri, violations);
    }

    this.statusBar.update(config, this.diagnosticManager.getCollection());

    // Perform heavy graph analysis in background
    setTimeout(() => {
      this.checkCircularDependencies(config);
      this.checkHealthThresholds(config);
    }, 0);
  }

  public analyzeOpenEditors() {
    try {
      const config = this.configService.getConfig();
      if (!config) {
        return;
      }

      for (const document of vscode.workspace.textDocuments) {
        if (this.isSourceFile(document)) {
          const violations = this.checkDocument(document, config);
          this.workspaceViolations.set(normalizePath(document.uri.fsPath), violations);
        }
      }

      this.publishDiagnostics();
    } catch (e) {
      this.telemetry.logError(e instanceof Error ? e : String(e), "analyzeOpenEditors");
    }
  }

  public async analyzeWorkspace() {
    const config = this.configService.getConfig();
    if (!config) {
      return;
    }

    await this.analysisService.scan(config.ignore);
    const ctx = this.analysisService.getWorkspaceContext();

    for (const filePath of this.analysisService.getKnownFiles()) {
      try {
        const uri = vscode.Uri.file(filePath);
        if (isIgnoredPath(filePath, this.workspaceRoot, config.ignore)) {
          this.workspaceViolations.delete(normalizePath(filePath));
          this.diagnosticManager.delete(uri);
          continue;
        }

        const raw = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(raw).toString("utf8");
        const violations = this.checkDocumentText(filePath, text, config);
        this.workspaceViolations.set(normalizePath(filePath), violations);
        this.analysisService.updateFile(filePath, text, ctx);
      } catch (e) {
        this.telemetry.logError(e instanceof Error ? e : String(e), "analyzeWorkspace");
      }
    }

    this.publishDiagnostics();
  }

  private analyzeDocument(document: vscode.TextDocument) {
    const config = this.configService.getConfig();
    if (!config || !this.isSourceFile(document)) {
      return;
    }

    const violations = this.checkDocument(document, config);
    this.workspaceViolations.set(normalizePath(document.uri.fsPath), violations);
    this.publishDiagnostics();
  }

  private analyzeDocumentText(document: vscode.TextDocument, text: string) {
    const config = this.configService.getConfig();
    if (!config || !this.isSourceFile(document)) {
      return;
    }

    const violations = this.checkDocumentText(document.uri.fsPath, text, config);
    this.workspaceViolations.set(normalizePath(document.uri.fsPath), violations);
    this.publishDiagnostics();
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
      if (!isIgnoredPath(uri.fsPath, this.workspaceRoot, this.configService.getConfig()?.ignore)) {
        this.analysisService.getKnownFiles().add(normalizePath(uri.fsPath));
      }
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
    const ignore = this.configService.getConfig()?.ignore;
    if (isIgnoredPath(uri.fsPath, this.workspaceRoot, ignore)) {
      return;
    }
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
      this.outputChannel.appendLine(`Pickety: Error reading changed file ${uri.fsPath}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private isSourceFile(document: vscode.TextDocument): boolean {
    if (!["typescript", "typescriptreact", "javascript", "javascriptreact"].includes(document.languageId)) {
      return false;
    }
    const ignore = this.configService.getConfig()?.ignore;
    return !isIgnoredPath(document.uri.fsPath, this.workspaceRoot, ignore);
  }

  private async ensureDefaultDiagramIgnored(diagramPath: string) {
    const config = this.configService.getConfig();
    if (!config || config["boundary-diagrams"] !== true) {
      return;
    }

    if (this.context.workspaceState.get(DocumentValidator.DIAGRAM_GITIGNORE_KEY)) {
      return;
    }

    const expectedPath = path.join(this.workspaceRoot, "picket-boundaries.mermaid");
    const resolvedActual = normalizePath(path.resolve(diagramPath));
    const resolvedExpected = normalizePath(path.resolve(expectedPath));
    if (resolvedActual !== resolvedExpected) {
      return;
    }

    const gitignorePath = path.join(this.workspaceRoot, ".gitignore");
    let content = "";
    try {
      content = await fs.promises.readFile(gitignorePath, "utf8");
    } catch (e) {
      if (!(e instanceof Error) || !("code" in e) || (e as NodeJS.ErrnoException).code !== "ENOENT") {
        this.telemetry.logError(e instanceof Error ? e : String(e), "ensureDefaultDiagramIgnored");
        return;
      }
    }

    const entry = "/picket-boundaries.mermaid";
    const entryPattern = /(^|\r?\n)\s*\/?picket-boundaries\.mermaid\s*(#.*)?(\r?\n|$)/;
    if (!entryPattern.test(content)) {
      const needsNewline = content.length > 0 && !content.endsWith("\n");
      const updated = `${content}${needsNewline ? "\n" : ""}${entry}\n`;
      try {
        await fs.promises.writeFile(gitignorePath, updated, "utf8");
        this.outputChannel.appendLine("Pickety: Added picket-boundaries.mermaid to .gitignore");
      } catch (e) {
        this.telemetry.logError(e instanceof Error ? e : String(e), "ensureDefaultDiagramIgnored");
        return;
      }
    }

    await this.context.workspaceState.update(DocumentValidator.DIAGRAM_GITIGNORE_KEY, true);
  }

  public dispose() {
    this.disposables.forEach(d => d.dispose());
  }
}
