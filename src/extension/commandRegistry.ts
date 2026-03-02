import * as vscode from "vscode";
import { initCommand } from "../commands/init";
import { generateDiagramCommand } from "../commands/generateDiagram";
import { showHealthCommand } from "../commands/showHealth";
import { showImpactCommand } from "../commands/showImpact";
import { goToRule, allowImport } from "../vscode/navigation";
import { ConfigService } from "../services/configService";
import { AnalysisService } from "../services/analysisService";
import { DocumentValidator } from "../services/documentValidator";

export interface RegisterCommandsOptions {
  context: vscode.ExtensionContext;
  configService: ConfigService;
  analysisService: AnalysisService;
  documentValidator: DocumentValidator;
  workspaceRoot: string;
}

export function registerAllCommands(options: RegisterCommandsOptions) {
  const { context, configService, analysisService, documentValidator, workspaceRoot } = options;
  context.subscriptions.push(
    vscode.commands.registerCommand("pickety.refresh", async () => {
      configService.reload();
      configService.reloadAliases();
      await documentValidator.analyzeWorkspace();
      vscode.window.showInformationMessage("Pickety: Workspace analysis refreshed");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("pickety.generateDiagram", () =>
      generateDiagramCommand(
        configService.getConfig(),
        analysisService.getImportGraph(),
        analysisService.getWorkspaceContext()
      )
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("pickety.showImpact", () =>
      showImpactCommand(
        configService.getConfig(),
        analysisService.getImportGraph(),
        analysisService.getWorkspaceContext()
      )
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("pickety.showHealth", () =>
      showHealthCommand(
        configService.getConfig(),
        analysisService.getImportGraph(),
        analysisService.getWorkspaceContext()
      )
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("pickety.goToRule", (root: string, rule: string | number) =>
      goToRule(root, rule)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("pickety.allowImport", (root: string, importer: string, target: string) =>
      allowImport(root, importer, target)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("pickety.init", () =>
      initCommand(workspaceRoot, () => configService.reload())
    )
  );
}
