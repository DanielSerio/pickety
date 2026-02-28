import * as vscode from "vscode";
import type { Violation, PicketyMetadata, HealthViolation } from "../shared/types";
import { formatHealthMetricValue } from "../core/utils";

export class DiagnosticManager {
  private static readonly CIRCULAR_TAG = "pickety/circular";
  private static readonly HEALTH_TAG = "pickety/health";

  constructor(private readonly collection: vscode.DiagnosticCollection) { }

  public getCollection(): vscode.DiagnosticCollection {
    return this.collection;
  }

  public setViolations(uri: vscode.Uri, violations: Violation[]) {
    const diagnostics = violations.map((v) => {
      const range = new vscode.Range(v.line, v.character, v.line, v.character + v.length);
      const severity = v.severity === "error"
        ? vscode.DiagnosticSeverity.Error
        : v.severity === "info"
          ? vscode.DiagnosticSeverity.Information
          : vscode.DiagnosticSeverity.Warning;

      const diagnostic = new vscode.Diagnostic(range, v.message, severity);
      diagnostic.source = "pickety";
      if (v.ruleName) {
        diagnostic.code = {
          value: v.ruleName,
          target: vscode.Uri.parse(`https://github.com/DanielSerio/pickety/blob/main/docs/rules.md#${v.ruleName}`),
        };
      }
      (diagnostic as vscode.Diagnostic & { _picketyMetadata: PicketyMetadata; })._picketyMetadata = {
        sourceModule: v.sourceModule,
        targetModule: v.targetModule
      };
      return diagnostic;
    });

    this.collection.set(uri, diagnostics);
  }

  public setCircularDiagnostics(configUri: vscode.Uri, cycles: string[][]) {
    const diagnostics: vscode.Diagnostic[] = cycles.map(cycle => {
      const cycleStr = cycle.join(" -> ");
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 100),
        `Circular dependency detected: ${cycleStr}`,
        vscode.DiagnosticSeverity.Error
      );
      diagnostic.source = "pickety";
      diagnostic.code = DiagnosticManager.CIRCULAR_TAG;
      return diagnostic;
    });

    this.updateConfigDiagnostics(configUri, DiagnosticManager.CIRCULAR_TAG, diagnostics);
  }

  public setHealthDiagnostics(configUri: vscode.Uri, violations: HealthViolation[]) {
    const diagnostics: vscode.Diagnostic[] = violations.map(v => {
      const valueStr = formatHealthMetricValue(v.metric, v.value);
      const thresholdStr = formatHealthMetricValue(v.metric, v.threshold);
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 100),
        `Module "${v.moduleName}" has ${v.metric} of ${valueStr} (max: ${thresholdStr})`,
        vscode.DiagnosticSeverity.Warning
      );
      diagnostic.source = "pickety";
      diagnostic.code = DiagnosticManager.HEALTH_TAG;
      return diagnostic;
    });

    this.updateConfigDiagnostics(configUri, DiagnosticManager.HEALTH_TAG, diagnostics);
  }

  private updateConfigDiagnostics(
    configUri: vscode.Uri,
    tag: string,
    newDiagnostics: vscode.Diagnostic[]
  ) {
    const existing = (this.collection.get(configUri) || [])
      .filter(d => {
        const code = typeof d.code === "object" ? d.code?.value : d.code;
        return code !== tag;
      });

    this.collection.set(configUri, [...existing, ...newDiagnostics]);
  }

  public clear() {
    this.collection.clear();
  }

  public delete(uri: vscode.Uri) {
    this.collection.delete(uri);
  }

  public dispose() {
    this.collection.dispose();
  }
}
