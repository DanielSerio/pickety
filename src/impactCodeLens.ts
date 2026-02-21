import * as vscode from "vscode";
import { ImportGraph } from "./core/graph";
import { normalizePath } from "./core/utils";
import type { PicketyConfig } from "./types";

// Displays a CodeLens at the top of each source file showing
// how many files and modules depend on it, and how many it depends on.
export class ImpactCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(
    private readonly importGraph: ImportGraph,
    private readonly workspaceRoot: string,
    private configRef: { config: PicketyConfig | undefined }
  ) {}

  // Signal that CodeLens values may have changed (call after graph updates)
  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const config = this.configRef.config;
    if (!config) {
      return [];
    }

    const filePath = normalizePath(document.uri.fsPath);
    const summary = this.importGraph.getModuleSummary(
      filePath,
      config.modules,
      this.workspaceRoot
    );

    // Don't show CodeLens if the file has no connections
    if (summary.dependentCount === 0 && summary.dependencyCount === 0) {
      return [];
    }

    const parts: string[] = [];

    if (summary.dependentCount > 0) {
      const moduleLabel = summary.dependentModules.length === 1
        ? `1 module`
        : `${summary.dependentModules.length} modules`;
      parts.push(
        `${summary.dependentCount} dependent${summary.dependentCount === 1 ? "" : "s"} (${moduleLabel})`
      );
    }

    if (summary.dependencyCount > 0) {
      const moduleLabel = summary.dependencyModules.length === 1
        ? `1 module`
        : `${summary.dependencyModules.length} modules`;
      parts.push(
        `${summary.dependencyCount} dependenc${summary.dependencyCount === 1 ? "y" : "ies"} (${moduleLabel})`
      );
    }

    const range = new vscode.Range(0, 0, 0, 0);
    const lens = new vscode.CodeLens(range, {
      title: parts.join("  |  "),
      command: "pickety.showImpact",
      tooltip: "Show full impact analysis for this file",
    });

    return [lens];
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}
