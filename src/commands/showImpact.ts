import * as vscode from "vscode";
import * as path from "path";
import { normalizePath, toRelativePath } from "../core/utils";
import { matchFileToModule } from "../core/imports";
import { requireConfig } from "./utils";
import type { PicketyConfig, WorkspaceContext } from "../types";
import type { ImportGraph } from "../core/graph";

export async function showImpactCommand(
  config: PicketyConfig | undefined,
  importGraph: ImportGraph,
  ctx: WorkspaceContext
) {
  const workspaceRoot = ctx.root;
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("Pickety: No active file.");
    return;
  }
  if (!requireConfig(config)) {
    return;
  }

  const filePath = normalizePath(editor.document.uri.fsPath);
  const transitive = importGraph.getTransitiveDependents(filePath);

  if (transitive.size === 0) {
    vscode.window.showInformationMessage("Pickety: No dependents found for this file.");
    return;
  }

  // Group dependents by module
  const byModule = new Map<string, string[]>();
  for (const dep of transitive) {
    const mod = matchFileToModule(dep, config.modules, workspaceRoot) ?? "(unmatched)";
    if (!byModule.has(mod)) {
      byModule.set(mod, []);
    }
    byModule.get(mod)!.push(toRelativePath(workspaceRoot, dep));
  }

  // Build QuickPick items grouped by module
  const items: vscode.QuickPickItem[] = [];
  for (const [mod, files] of byModule) {
    items.push({ label: mod, kind: vscode.QuickPickItemKind.Separator });
    for (const file of files) {
      items.push({ label: file, description: mod });
    }
  }

  const relativePath = toRelativePath(workspaceRoot, filePath);
  const moduleCount = byModule.size;
  const selected = await vscode.window.showQuickPick(items, {
    title: `Impact: ${relativePath} (${transitive.size} files across ${moduleCount} modules)`,
    placeHolder: "Select a file to open",
  });

  if (selected && selected.kind !== vscode.QuickPickItemKind.Separator) {
    const absPath = path.join(workspaceRoot, selected.label);
    const doc = await vscode.workspace.openTextDocument(absPath);
    await vscode.window.showTextDocument(doc);
  }
}
