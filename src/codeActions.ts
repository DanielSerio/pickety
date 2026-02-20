import * as vscode from "vscode";

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
      }
    }

    return actions;
  }
}
