import * as vscode from "vscode";
import { PicketyController } from "./controller";
import { ImportGraph } from "./core/graph";
import { PicketyStatusBar } from "./statusBar";
import { TelemetryProvider } from "./telemetry";

let controller: PicketyController | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const telemetry = TelemetryProvider.getInstance();
  telemetry.logEvent("extension_activate");

  console.log("Pickety: Activating...");
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    console.log("Pickety: No workspace root found.");
    return;
  }

  const importGraph = new ImportGraph();
  const statusBar = new PicketyStatusBar(context);
  context.subscriptions.push(statusBar);

  controller = new PicketyController(context, workspaceRoot, importGraph, statusBar);
  await controller.activate();
  console.log("Pickety: Activated.");
}

export function deactivate() {
  controller?.dispose();
}
