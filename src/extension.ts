import * as vscode from "vscode";
import { PicketyController } from "./controller";

let controller: PicketyController | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return;
  }

  controller = new PicketyController(context, workspaceRoot);
  await controller.activate();
}

export function deactivate() {
  controller?.dispose();
}
