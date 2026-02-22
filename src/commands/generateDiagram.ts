import * as vscode from "vscode";
import { computeModuleHealth } from "../core/health";
import { generateMermaidDiagram } from "../core/diagram";
import { requireConfig } from "./utils";
import type { PicketyConfig, WorkspaceContext } from "../shared/types";
import type { ImportGraph } from "../core/graph";

export function generateDiagramCommand(
  config: PicketyConfig | undefined,
  importGraph: ImportGraph,
  ctx: WorkspaceContext
) {
  if (!requireConfig(config)) {
    return;
  }

  // Compute health metrics for diagram annotations (on-demand only)
  const health = computeModuleHealth(
    importGraph,
    config.modules,
    ctx
  );

  const diagramPath = generateMermaidDiagram(config, ctx.root, health);
  if (diagramPath) {
    vscode.window.showInformationMessage(`Pickety: Generated boundary diagram at ${diagramPath}`);
  } else {
    vscode.window.showErrorMessage("Pickety: Failed to generate diagram. Is 'boundary-diagrams' enabled in pickety.json?");
  }
}
