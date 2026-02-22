import * as vscode from "vscode";
import type { ModuleHealth, HealthConfig } from "../shared/types";

// Singleton panel reference so repeated calls reveal the same panel
let currentPanel: vscode.WebviewPanel | undefined;

/**
 * Shows (or reveals) a webview panel displaying module health metrics.
 * Cells are always colored with a heatmap gradient based on their values.
 * If thresholds are configured, cells exceeding them get a distinct red highlight.
 */
export function showHealthPanel(
  health: ModuleHealth[],
  config: HealthConfig | undefined
): void {
  if (currentPanel) {
    currentPanel.reveal();
    currentPanel.webview.html = buildHtml(health, config);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    "picketyHealth",
    "Pickety: Module Health",
    vscode.ViewColumn.One,
    { enableScripts: false }
  );

  currentPanel.webview.html = buildHtml(health, config);

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
  });
}

import { formatHealthMetricValue } from "../shared/utils";

function heatmapStyle(ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  // Green (140) -> Yellow (60) -> Red (0)
  const hue = Math.round((1 - clamped) * 140);
  return `background-color: hsla(${hue}, 75%, 40%, 0.9); color: white; text-shadow: 0 1px 1px rgba(0,0,0,0.3);`;
}

function thresholdClass(value: number, threshold: number | undefined): string {
  if (threshold === undefined) {
    return "";
  }
  if (value > threshold) {
    return "exceeds";
  }
  if (value >= threshold * 0.8) {
    return "approaching";
  }
  return "";
}

function buildHtml(health: ModuleHealth[], config: HealthConfig | undefined): string {
  const maxCa = Math.max(1, ...health.map((m) => m.afferentCoupling));
  const maxCe = Math.max(1, ...health.map((m) => m.efferentCoupling));
  const maxDepth = Math.max(1, ...health.map((m) => m.dependencyDepth));

  const rows = health.map((mod, i) => {
    const caRatio = mod.afferentCoupling / maxCa;
    const ceRatio = mod.efferentCoupling / maxCe;
    const iRatio = mod.instability; // 0-1
    const dRatio = mod.dependencyDepth / maxDepth;

    const caThr = thresholdClass(mod.afferentCoupling, config?.maxAfferentCoupling);
    const ceThr = thresholdClass(mod.efferentCoupling, config?.maxEfferentCoupling);
    const iThr = thresholdClass(mod.instability, config?.maxInstability);
    const dThr = thresholdClass(mod.dependencyDepth, config?.maxDepth);

    const rowCls = i % 2 === 1 ? ' class="alt"' : "";

    return `<tr${rowCls}>
      <td class="module-name">${escapeHtml(mod.moduleName)}</td>
      <td class="num">${mod.fileCount}</td>
      <td class="num ${caThr}" style="${heatmapStyle(caRatio)}">${formatHealthMetricValue("ca", mod.afferentCoupling)}</td>
      <td class="num ${ceThr}" style="${heatmapStyle(ceRatio)}">${formatHealthMetricValue("ce", mod.efferentCoupling)}</td>
      <td class="num ${iThr}" style="${heatmapStyle(iRatio)}">${formatHealthMetricValue("instability", mod.instability)}</td>
      <td class="num ${dThr}" style="${heatmapStyle(dRatio)}">${formatHealthMetricValue("depth", mod.dependencyDepth)}</td>
    </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Module Health</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #cccccc);
      --border: var(--vscode-widget-border, #333333);
      --accent: var(--vscode-button-background, #007acc);
      --row-alt: rgba(128, 128, 128, 0.05);
    }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
      color: var(--fg);
      background: var(--bg);
      padding: 24px;
      margin: 0;
      line-height: 1.4;
    }
    h1 {
      font-size: 1.5em;
      margin: 0 0 20px 0;
      font-weight: 500;
      letter-spacing: -0.01em;
    }
    table {
      border-collapse: separate;
      border-spacing: 0;
      width: 100%;
      font-size: 13px;
    }
    th, td {
      text-align: left;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
    }
    th {
      font-weight: 600;
      opacity: 0.7;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--bg);
      position: sticky;
      top: 0;
    }
    tr.alt { background: var(--row-alt); }
    tr:hover { background: rgba(128, 128, 128, 0.1); }

    td.module-name { font-weight: 600; color: var(--fg); }
    td.num {
      text-align: right;
      font-family: var(--vscode-editor-font-family, monospace);
      font-variant-numeric: tabular-nums;
    }

    /* Metrics with Heatmap */
    td.num[style*="background-color"] {
      border-radius: 4px;
      padding: 6px 10px;
      margin: 4px;
      display: table-cell;
    }

    /* Threshold Highlighting */
    td.exceeds {
      background-color: #e11d48 !important; /* Rose 600 */
      color: white !important;
      font-weight: bold;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.4);
    }
    td.approaching {
      background-color: #d97706 !important; /* Amber 600 */
      color: white !important;
      font-weight: 600;
    }

    .legend {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
      font-size: 12px;
      opacity: 0.8;
    }
    .legend-item { display: flex; align-items: center; gap: 8px; }
    .swatch {
      width: 12px;
      height: 12px;
      border-radius: 2px;
    }
  </style>
</head>
<body>
  <h1>Module Health Report</h1>
  <table>
    <thead>
      <tr>
        <th>Module</th>
        <th style="text-align:right">Files</th>
        <th style="text-align:right">Ca</th>
        <th style="text-align:right">Ce</th>
        <th style="text-align:right">Instability</th>
        <th style="text-align:right">Depth</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <div class="legend">
    <div class="legend-item"><span class="swatch" style="background: hsla(140, 75%, 40%, 0.9)"></span> Healthy</div>
    <div class="legend-item"><span class="swatch" style="background: hsla(60, 75%, 40%, 0.9)"></span> Elevated</div>
    <div class="legend-item"><span class="swatch" style="background: hsla(0, 75%, 40%, 0.9)"></span> High Stress</div>
    ${config ? `
      <div class="legend-item"><span class="swatch" style="background: #e11d48"></span> Exceeds Threshold</div>
      <div class="legend-item"><span class="swatch" style="background: #d97706"></span> Approaching Threshold</div>
    ` : ""}
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
