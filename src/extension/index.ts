import * as vscode from "vscode";
import { registerAllCommands } from "./commandRegistry";
import { ConfigService } from "../services/configService";
import { AnalysisService } from "../services/analysisService";
import { PicketyStatusBar } from "../vscode/statusBar";
import { TelemetryProvider } from "../services/telemetry";
import { DiagnosticManager } from "../services/diagnosticManager";
import { DocumentValidator } from "../services/documentValidator";
import { PicketyCodeActionProvider } from "../vscode/codeActions";
import { ImpactCodeLensProvider } from "../vscode/impactCodeLens";
import { SOURCE_GLOB } from "../shared/utils";

let disposables: vscode.Disposable[] = [];

export async function activate(context: vscode.ExtensionContext) {
  const telemetry = TelemetryProvider.getInstance();
  telemetry.logEvent("extension_activate");

  const outputChannel = vscode.window.createOutputChannel("Pickety");
  context.subscriptions.push(outputChannel);
  telemetry.setOutputChannel(outputChannel);

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    outputChannel.appendLine("Pickety: No workspace root found.");
    return;
  }
  outputChannel.appendLine(`Pickety: Extension activated for workspace: ${workspaceRoot}`);

  // Base Services
  const configService = new ConfigService(workspaceRoot);
  context.subscriptions.push(configService);

  const analysisService = new AnalysisService(workspaceRoot, configService);
  context.subscriptions.push(analysisService);

  // VS Code Infrastructure
  const statusBar = new PicketyStatusBar(context);
  context.subscriptions.push(statusBar);

  const diagnosticCollection = vscode.languages.createDiagnosticCollection("pickety");
  context.subscriptions.push(diagnosticCollection);
  const diagnosticManager = new DiagnosticManager(diagnosticCollection);
  context.subscriptions.push(diagnosticManager);

  // Providers
  const codeActionProvider = new PicketyCodeActionProvider(workspaceRoot);
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider({ scheme: "file", language: "*" }, codeActionProvider, {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    })
  );

  const codeLensProvider = new ImpactCodeLensProvider(analysisService.getImportGraph(), workspaceRoot, { config: undefined });
  context.subscriptions.push(codeLensProvider);

  const documentValidator = new DocumentValidator({
    context,
    configService,
    analysisService,
    diagnosticManager,
    statusBar,
    outputChannel,
    workspaceRoot,
  });
  documentValidator.setCodeLensProvider(codeLensProvider);
  context.subscriptions.push(documentValidator);

  // Update the CodeLens provider with the shared config reference
  codeLensProvider.configRef = documentValidator.configRef;
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: "file", pattern: SOURCE_GLOB },
      codeLensProvider
    )
  );

  // Register commands
  registerAllCommands({ context, configService, analysisService, workspaceRoot });

  // Wire up events
  configService.onConfigChanged((res) => documentValidator.handleConfigResult(res));
  analysisService.onAnalysisReady(() => {
    outputChannel.appendLine(`Pickety: Analysis complete. Found ${analysisService.getKnownFiles().size} files.`);
    documentValidator.analyzeOpenEditors();
  });

  // Start initialization
  configService.reload();
  configService.reloadAliases();
}

export function deactivate() {
  disposables.forEach((d) => d.dispose());
}
