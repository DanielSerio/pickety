import * as vscode from "vscode";
import { PicketyController } from "./controller";

let controller: PicketyController | undefined;

export async function activate(context: vscode.ExtensionContext) {
  console.log("Pickety: Activating...");
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    console.log("Pickety: No workspace root found.");
    return;
  }

  controller = new PicketyController(context, workspaceRoot);
  await controller.activate();
  console.log("Pickety: Activated.");
}

export function deactivate() {
  controller?.dispose();
}
