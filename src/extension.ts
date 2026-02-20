import * as vscode from "vscode";
import { loadConfig, loadTsConfigAliases } from "./core/config";
import { checkBoundaries } from "./core/boundaries";
import { generateMermaidDiagram } from "./core/diagram";
import { normalizePath, SOURCE_GLOB, CONFIG_FILENAME } from "./core/utils";
import { PicketyStatusBar } from "./statusBar";
import { goToRule } from "./navigation";
import { PicketyCodeActionProvider } from "./codeActions";
import { reportConfigErrors } from "./diagnostics";
import type { PicketyConfig, ConfigResult } from "./types";

/**
 * Encapsulates the extension state to avoid mutable globals and improve testability.
 */
class ExtensionState {
  public config: PicketyConfig | undefined;
  public aliases: Record<string, string> = {};
  public knownFiles: Set<string> = new Set();
  public diagnosticCollection: vscode.DiagnosticCollection;
  public outputChannel: vscode.OutputChannel;
  public statusBar: PicketyStatusBar;
  public analysisTimeout: NodeJS.Timeout | undefined;
  public workspaceRoot: string;

  constructor(context: vscode.ExtensionContext, workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.outputChannel = vscode.window.createOutputChannel("Pickety");
    context.subscriptions.push(this.outputChannel);

    this.diagnosticCollection = vscode.languages.createDiagnosticCollection("pickety");
    context.subscriptions.push(this.diagnosticCollection);

    this.statusBar = new PicketyStatusBar(context);
    context.subscriptions.push(this.statusBar);
  }

  public dispose() {
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout);
    }
  }
}

let state: ExtensionState | undefined;

export function activate(context: vscode.ExtensionContext) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return;
  }

  state = new ExtensionState(context, workspaceRoot);

  // Discover all source files in the workspace for import resolution
  const refreshKnownFiles = async () => {
    if (!state) {
      return;
    }
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Pickety: Scanning workspace...",
        cancellable: false,
      },
      async () => {
        const files = await vscode.workspace.findFiles(SOURCE_GLOB, "**/node_modules/**");
        state!.knownFiles = new Set(files.map((f) => normalizePath(f.fsPath)));
      }
    );
  };

  // Analyze a single document and update its diagnostics
  const analyzeDocument = (document: vscode.TextDocument) => {
    if (!state || !state.config) {
      return;
    }
    if (!isSourceFile(document)) {
      return;
    }

    const filePath = document.uri.fsPath;
    const content = document.getText();

    const violations = checkBoundaries(
      filePath,
      content,
      state.config,
      state.knownFiles,
      state.workspaceRoot,
      state.aliases
    );

    const diagnostics = violations.map((v) => {
      const range = new vscode.Range(v.line, v.character, v.line, v.character + v.length);
      const severity = v.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;

      const diagnostic = new vscode.Diagnostic(range, v.message, severity);
      diagnostic.source = "pickety";
      if (v.ruleName) {
        diagnostic.code = {
          value: v.ruleName,
          target: vscode.Uri.parse(`https://github.com/pickety/pickety/blob/main/docs/rules.md#${v.ruleName}`),
        };
      }
      return diagnostic;
    });

    state.diagnosticCollection.set(document.uri, diagnostics);
    state.statusBar.update(state.config, state.diagnosticCollection);
  };

  const analyzeOpenEditors = () => {
    if (!state) {
      return;
    }

    for (const document of vscode.workspace.textDocuments) {
      analyzeDocument(document);
    }
  };

  const handleConfigResult = (result: ConfigResult) => {
    if (!state) {
      return;
    }
    state.diagnosticCollection.clear();
    if (result.ok) {
      state.config = result.config;
      state.outputChannel.appendLine("Pickety: Import boundaries active");
      const diagramPath = generateMermaidDiagram(result.config, state.workspaceRoot);
      if (diagramPath) {
        state.outputChannel.appendLine(`Pickety: Generated boundary diagram at ${diagramPath}`);
      }
      analyzeOpenEditors();
      state.statusBar.update(state.config, state.diagnosticCollection);
    } else {
      state.config = undefined;
      reportConfigErrors(result.errors, state.workspaceRoot, state.outputChannel, state.diagnosticCollection);
      state.statusBar.update(state.config, state.diagnosticCollection);
    }
  };

  const reloadAliases = () => {
    if (!state) {
      return;
    }
    state.aliases = loadTsConfigAliases(state.workspaceRoot);
    state.outputChannel.appendLine(`Pickety: Loaded ${Object.keys(state.aliases).length} path aliases`);
    analyzeOpenEditors();
  };

  const reload = () => {
    if (!state) {
      return;
    }
    const res = loadConfig(state.workspaceRoot);
    handleConfigResult(res);
  };

  // Watch for pickety.json changes
  const configWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceRoot, CONFIG_FILENAME));
  context.subscriptions.push(configWatcher);
  configWatcher.onDidChange(reload);
  configWatcher.onDidCreate(reload);
  configWatcher.onDidDelete(() => {
    if (!state) {
      return;
    }
    state.config = undefined;
    state.diagnosticCollection.clear();
    state.outputChannel.appendLine("Pickety: pickety.json deleted, inactive");
    state.statusBar.update(undefined, state.diagnosticCollection);
  });

  // Watch for tsconfig changes
  const tsConfigWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceRoot, "tsconfig*.json"));
  context.subscriptions.push(tsConfigWatcher);
  tsConfigWatcher.onDidChange(reloadAliases);
  tsConfigWatcher.onDidCreate(reloadAliases);
  tsConfigWatcher.onDidDelete(reloadAliases);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("pickety.refresh", () => {
      reload();
      reloadAliases();
      refreshKnownFiles().then(analyzeOpenEditors);
      vscode.window.showInformationMessage("Pickety: Configuration refreshed");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("pickety.generateDiagram", () => {
      if (!state || !state.config) {
        vscode.window.showErrorMessage("Pickety: No active configuration. Check pickety.json for errors.");
        return;
      }
      const diagramPath = generateMermaidDiagram(state.config, state.workspaceRoot);
      if (diagramPath) {
        vscode.window.showInformationMessage(`Pickety: Generated boundary diagram at ${diagramPath}`);
      } else {
        vscode.window.showErrorMessage("Pickety: Failed to generate diagram. Is 'boundary-diagrams' enabled in pickety.json?");
      }
    })
  );

  context.subscriptions.push(vscode.commands.registerCommand("pickety.goToRule", (root: string, rule: string | number) => goToRule(root, rule)));

  // Providers
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider({ scheme: "file", language: "*" }, new PicketyCodeActionProvider(workspaceRoot), {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    })
  );

  // File Watching
  const fileWatcher = vscode.workspace.createFileSystemWatcher(SOURCE_GLOB);
  context.subscriptions.push(fileWatcher);
  fileWatcher.onDidCreate((uri) => {
    state?.knownFiles.add(normalizePath(uri.fsPath));
  });
  fileWatcher.onDidDelete((uri) => {
    state?.knownFiles.delete(normalizePath(uri.fsPath));
  });

  // Text Document Events
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (!state || !isSourceFile(event.document)) {
        return;
      }

      state.diagnosticCollection.delete(event.document.uri);

      if (state.analysisTimeout) {
        clearTimeout(state.analysisTimeout);
      }

      state.analysisTimeout = setTimeout(() => analyzeDocument(event.document), 300);
    })
  );

  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((document) => analyzeDocument(document)));

  // Initialize
  const initialResult = loadConfig(workspaceRoot);
  handleConfigResult(initialResult);
  reloadAliases();
  refreshKnownFiles().then(analyzeOpenEditors);
}

function isSourceFile(document: vscode.TextDocument): boolean {
  return ["typescript", "typescriptreact", "javascript", "javascriptreact"].includes(document.languageId);
}

export function deactivate() {
  state?.dispose();
}
