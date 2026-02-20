import * as vscode from "vscode";
import type { PicketyMetadata } from "./types";

export class PicketyCodeActionProvider implements vscode.CodeActionProvider {
  constructor(private workspaceRoot: string) { }

  public provideCodeActions(
    _document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source === "pickety" && diagnostic.code) {
        const ruleName =
          typeof diagnostic.code === "object"
            ? diagnostic.code.value
            : diagnostic.code;

        const action = new vscode.CodeAction(
          `Go to Pickety rule: ${ruleName}`,
          vscode.CodeActionKind.QuickFix
        );

        action.command = {
          command: "pickety.goToRule",
          title: "Go to Rule",
          arguments: [this.workspaceRoot, ruleName],
        };

        actions.push(action);

        // Add "Allow this import" action if we have module metadata
        const metadata = (diagnostic as vscode.Diagnostic & { _picketyMetadata?: PicketyMetadata; })['_picketyMetadata'];
        if (metadata && metadata.sourceModule && metadata.targetModule) {
          const allowAction = new vscode.CodeAction(
            `Allow imports from '${metadata.targetModule}' in '${metadata.sourceModule}'`,
            vscode.CodeActionKind.QuickFix
          );
          allowAction.command = {
            command: "pickety.allowImport",
            title: "Allow Import",
            arguments: [this.workspaceRoot, metadata.sourceModule, metadata.targetModule],
          };
          actions.push(allowAction);
        }
      }
    }

    return actions;
  }
}
