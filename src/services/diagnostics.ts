import * as vscode from "vscode";
import * as path from "path";
import type { ConfigError, ConfigWarning } from "../shared/types";
import { CONFIG_FILENAME } from "../shared/utils";

export interface ReportConfigOptions {
  errors: ConfigError[];
  workspaceRoot: string;
  outputChannel: vscode.OutputChannel;
  diagnosticCollection: vscode.DiagnosticCollection;
}

export function reportConfigErrors(options: ReportConfigOptions) {
  const { errors, workspaceRoot, outputChannel, diagnosticCollection } = options;
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

export interface ReportConfigWarningsOptions {
  warnings: ConfigWarning[];
  workspaceRoot: string;
  outputChannel: vscode.OutputChannel;
  diagnosticCollection: vscode.DiagnosticCollection;
}

export function reportConfigWarnings(options: ReportConfigWarningsOptions) {
  const { warnings, workspaceRoot, outputChannel, diagnosticCollection } = options;
  outputChannel.appendLine("Pickety: Configuration warning(s) found:");
  const configUri = vscode.Uri.file(path.join(workspaceRoot, CONFIG_FILENAME));

  const diagnostics: vscode.Diagnostic[] = warnings.map((warn) => {
    outputChannel.appendLine(
      ` - ${warn.message}${warn.path ? ` (at ${warn.path})` : ""}`
    );

    const range = new vscode.Range(0, 0, 0, 100);
    const diagnostic = new vscode.Diagnostic(
      range,
      warn.message,
      vscode.DiagnosticSeverity.Warning
    );
    diagnostic.source = "pickety";
    if (warn.path) {
      diagnostic.code = warn.path;
    }
    return diagnostic;
  });

  const existing = diagnosticCollection.get(configUri) || [];
  diagnosticCollection.set(configUri, [...existing, ...diagnostics]);
}
