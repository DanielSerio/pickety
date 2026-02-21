import * as vscode from "vscode";
import { computeModuleHealth } from "../core/health";
import { showHealthPanel } from "../healthPanel";
import { requireConfig } from "./utils";
import type { PicketyConfig, WorkspaceContext } from "../types";
import type { ImportGraph } from "../core/graph";

export function showHealthCommand(
  config: PicketyConfig | undefined,
  importGraph: ImportGraph,
  ctx: WorkspaceContext
) {
  if (!requireConfig(config)) {
    return;
  }

  const health = computeModuleHealth(
    importGraph,
    config.modules,
    ctx
  );

  showHealthPanel(health, config.health);
}
