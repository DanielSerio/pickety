import * as vscode from "vscode";
import type { PicketyConfig } from "../shared/types";

export class PicketyStatusBar {
  private item: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "pickety.refresh";
    context.subscriptions.push(this.item);
  }

  public update(config: PicketyConfig | undefined, diagnosticCollection: vscode.DiagnosticCollection) {
    if (!config) {
      this.item.text = "";
      this.item.tooltip = "";
      this.item.color = undefined;
      this.item.backgroundColor = undefined;
      this.item.hide();
      return;
    }

    let errorCount = 0;
    let warningCount = 0;
    diagnosticCollection.forEach((_uri, diagnostics) => {
      diagnostics
        .filter((d) => d.source === "pickety")
        .forEach((d) => {
          if (d.severity === vscode.DiagnosticSeverity.Error) {
            errorCount += 1;
          } else if (d.severity === vscode.DiagnosticSeverity.Warning) {
            warningCount += 1;
          }
        });
    });

    const violationCount = errorCount + warningCount;
    if (violationCount > 0) {
      this.item.text = `$(shield) Pickety: ${violationCount} issue(s)`;
      this.item.tooltip = `Found ${violationCount} architectural violations. Click to refresh.`;
      this.item.color = errorCount > 0 ? "#ff8c00" : "#f2c200";
      this.item.backgroundColor = undefined;
      this.item.show();
    } else {
      this.item.text = "$(check) Pickety";
      this.item.tooltip = "Architectural boundaries are secure. Click to refresh.";
      this.item.color = undefined;
      this.item.backgroundColor = undefined;
      this.item.show();
    }
  }

  public dispose() {
    this.item.dispose();
  }
}
