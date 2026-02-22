import * as vscode from "vscode";
import type { PicketyConfig } from "../shared/types";

export class PicketyStatusBar {
  private item: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "pickety.refresh";
    context.subscriptions.push(this.item);
    this.item.show();
  }

  public update(config: PicketyConfig | undefined, diagnosticCollection: vscode.DiagnosticCollection) {
    if (!config) {
      this.item.text = "$(warning) Pickety: No Config";
      this.item.tooltip = "Pickety is inactive. Check pickety.json for errors.";
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      return;
    }

    let violationCount = 0;
    diagnosticCollection.forEach((_uri, diagnostics) => {
      violationCount += diagnostics.filter((d) => d.source === "pickety").length;
    });

    if (violationCount > 0) {
      this.item.text = `$(shield) Pickety: ${violationCount} issue(s)`;
      this.item.tooltip = `Found ${violationCount} architectural violations. Click to refresh.`;
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
    } else {
      this.item.text = "$(check) Pickety";
      this.item.tooltip = "Architectural boundaries are secure. Click to refresh.";
      this.item.backgroundColor = undefined;
    }
  }

  public dispose() {
    this.item.dispose();
  }
}
