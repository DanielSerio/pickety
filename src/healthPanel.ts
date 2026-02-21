import * as vscode from "vscode";
import type { ModuleHealth, HealthConfig } from "./types";

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

// Computes an inline background-color style using a green-to-yellow-to-red gradient.
// `ratio` is 0–1 where 0 = best (green), 1 = worst (red).
function heatmapStyle(ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  // Green (120) -> Yellow (60) -> Red (0)
  const hue = Math.round((1 - clamped) * 120);
  return `background-color: hsl(${hue}, 70%, 38%); color: #fff;`;
}

// Returns a threshold-based CSS class if the value exceeds or approaches the limit
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
  // Find max values across all modules for normalizing the heatmap
  const maxCa = Math.max(1, ...health.map((m) => m.afferentCoupling));
  const maxCe = Math.max(1, ...health.map((m) => m.efferentCoupling));
  const maxDepth = Math.max(1, ...health.map((m) => m.dependencyDepth));

  const rows = health.map((mod, i) => {
    const caRatio = mod.afferentCoupling / maxCa;
    const ceRatio = mod.efferentCoupling / maxCe;
    const iRatio = mod.instability; // already 0–1
    const dRatio = mod.dependencyDepth / maxDepth;

    const caThr = thresholdClass(mod.afferentCoupling, config?.maxAfferentCoupling);
    const ceThr = thresholdClass(mod.efferentCoupling, config?.maxEfferentCoupling);
    const iThr = thresholdClass(mod.instability, config?.maxInstability);
    const dThr = thresholdClass(mod.dependencyDepth, config?.maxDepth);

    const rowCls = i % 2 === 1 ? ' class="alt"' : "";

    return `<tr${rowCls}>
      <td class="module-name">${escapeHtml(mod.moduleName)}</td>
      <td class="num">${mod.fileCount}</td>
      <td class="num ${caThr}" style="${heatmapStyle(caRatio)}">${mod.afferentCoupling}</td>
      <td class="num ${ceThr}" style="${heatmapStyle(ceRatio)}">${mod.efferentCoupling}</td>
      <td class="num ${iThr}" style="${heatmapStyle(iRatio)}">${mod.instability.toFixed(2)}</td>
      <td class="num ${dThr}" style="${heatmapStyle(dRatio)}">${mod.dependencyDepth}</td>
    </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Module Health</title>
  <style>
    body {
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 20px;
      margin: 0;
    }
    h1 {
      font-size: 1.3em;
      margin-bottom: 16px;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      font-size: 0.9em;
    }
    th, td {
      text-align: left;
      padding: 8px 14px;
      border-bottom: 1px solid var(--vscode-widget-border, #333);
    }
    th {
      font-weight: 600;
      color: var(--vscode-foreground);
      opacity: 0.8;
      font-size: 0.85em;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    tr.alt {
      background: rgba(128, 128, 128, 0.06);
    }
    td.module-name {
      font-weight: 500;
    }
    td.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      border-radius: 3px;
    }
    /* Threshold overrides — applied on top of heatmap colors */
    td.exceeds {
      background-color: #dc2626 !important;
      color: #fff !important;
      font-weight: 700;
      box-shadow: inset 0 0 0 2px #fca5a5;
    }
    td.approaching {
      background-color: #d97706 !important;
      color: #fff !important;
      font-weight: 600;
    }
    .legend {
      margin-top: 20px;
      font-size: 0.85em;
      opacity: 0.8;
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .legend-swatch {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <h1>Module Health Report</h1>
  <table>
    <thead>
      <tr>
        <th>Module</th>
        <th>Files</th>
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
    <div class="legend-item">
      <span class="legend-swatch" style="background: hsl(120, 70%, 38%)"></span> Low
    </div>
    <div class="legend-item">
      <span class="legend-swatch" style="background: hsl(60, 70%, 38%)"></span> Medium
    </div>
    <div class="legend-item">
      <span class="legend-swatch" style="background: hsl(0, 70%, 38%)"></span> High
    </div>
    ${config ? `<div class="legend-item">
      <span class="legend-swatch" style="background: #dc2626; box-shadow: inset 0 0 0 2px #fca5a5;"></span> Exceeds threshold
    </div>
    <div class="legend-item">
      <span class="legend-swatch" style="background: #d97706;"></span> Approaching threshold
    </div>` : ""}
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
