import * as vscode from "vscode";
import { initCommand } from "./commands/init";
import { generateDiagramCommand } from "./commands/generateDiagram";
import { showHealthCommand } from "./commands/showHealth";
import { showImpactCommand } from "./commands/showImpact";
import { goToRule, allowImport } from "./navigation";
import { ConfigService } from "./configService";
import { AnalysisService } from "./analysisService";

export function registerAllCommands(
  context: vscode.ExtensionContext,
  configService: ConfigService,
  analysisService: AnalysisService,
  workspaceRoot: string
) {
  context.subscriptions.push(
    vscode.commands.registerCommand("pickety.refresh", () => {
      configService.reload();
      configService.reloadAliases();
      vscode.window.showInformationMessage("Pickety: Configuration refreshed");
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
