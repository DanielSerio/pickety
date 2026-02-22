import { computeModuleHealth } from "../core/health";
import { showHealthPanel } from "../vscode/healthPanel";
import { requireConfig } from "./utils";
import type { PicketyConfig, WorkspaceContext } from "../shared/types";
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
