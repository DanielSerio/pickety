import * as vscode from "vscode";
import * as path from "path";
import type { ConfigError } from "../shared/types";
import { CONFIG_FILENAME } from "../shared/utils";

export function reportConfigErrors(
  errors: ConfigError[],
  workspaceRoot: string,
  outputChannel: vscode.OutputChannel,
  diagnosticCollection: vscode.DiagnosticCollection
) {
  outputChannel.appendLine("Pickety: Configuration error(s) found:");
  const configUri = vscode.Uri.file(path.join(workspaceRoot, CONFIG_FILENAME));

  const diagnostics: vscode.Diagnostic[] = errors.map((err) => {
    outputChannel.appendLine(
      ` - ${err.message}${err.path ? ` (at ${err.path})` : ""}`
    );

    // If we don't have a path, just highlight the first line
    const range = new vscode.Range(0, 0, 0, 100);
    const diagnostic = new vscode.Diagnostic(
      range,
      err.message,
      vscode.DiagnosticSeverity.Error
    );
    diagnostic.source = "pickety";
    if (err.path) {
      diagnostic.code = err.path;
    }
    return diagnostic;
  });

  diagnosticCollection.set(configUri, diagnostics);
  vscode.window.showErrorMessage(
    "Pickety: Configuration error. Check the Problems panel or Output channel for details."
  );
}
