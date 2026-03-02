import * as fs from "fs";
import * as path from "path";
import type { PicketyConfig, ModuleHealth, ExportRule, Severity } from "../shared/types";
import { resolveRuleDefaults, normalizePath } from "./utils";

/**
 * Generates a Mermaid diagram from the Pickety configuration.
 * Writes the output to the specified path in pickety.json or a default location.
 */
export function generateMermaidDiagram(
  config: PicketyConfig,
  root: string,
  health?: ModuleHealth[]
): string | undefined {
  const option = config["boundary-diagrams"];
  if (!option) {
    return undefined;
  }

  const defaultFilename = "picket-boundaries.mermaid";
  let outputPath: string;

  if (typeof option === "string") {
    // If it's a directory, append default filename. If it's a file path, use it.
    const resolved = path.resolve(root, option);
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        outputPath = path.join(resolved, defaultFilename);
      } else {
        outputPath = resolved;
      }
    } catch {
      outputPath = resolved;
    }
  } else {
    outputPath = path.join(root, defaultFilename);
  }

  // Prevent path traversal: output must stay inside the workspace root
  const nRoot = normalizePath(path.resolve(root));
  const nOutput = normalizePath(path.resolve(outputPath));
  const relative = path.relative(nRoot, nOutput);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    console.error(`Pickety: Diagram output path "${option}" escapes the workspace root. Ignoring.`);
    return undefined;
  }

  const mermaidContent = buildMermaidContent(config, health);

  try {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, mermaidContent, "utf-8");
    return outputPath;
  } catch (err) {
    console.error(`Pickety: Failed to write Mermaid diagram to ${outputPath}`, err);
    return undefined;
  }
}

// Escapes a string for safe use inside Mermaid quoted labels.
// Strips characters that could break out of label syntax.
function escapeMermaid(value: string): string {
  return value
    .replace(/"/g, "#quot;")
    .replace(/\[/g, "#lsqb;")
    .replace(/\]/g, "#rsqb;")
    .replace(/\|/g, "#vert;")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;");
}

interface DiagramContext {
  config: PicketyConfig;
  healthByModule: Map<string, ModuleHealth>;
  lines: string[];
  edgeStyles: string[];
  nodeIds: Map<string, string>;
  idCounter: number;
  edgeIndex: number;
  globalSeverity: Severity;
}

function buildMermaidContent(config: PicketyConfig, health?: ModuleHealth[]): string {
  const healthByModule = new Map<string, ModuleHealth>();
  if (health) {
    for (const h of health) {
      healthByModule.set(h.moduleName, h);
    }
  }

  const ctx: DiagramContext = {
    config,
    healthByModule,
    lines: ["graph LR"],
    edgeStyles: [],
    nodeIds: new Map<string, string>(),
    idCounter: 0,
    edgeIndex: 0,
    globalSeverity: config.rules["module-boundaries"].severity,
  };

  addStyles(ctx);
  const clusters = discoverClusters(ctx);
  renderClusters(ctx, clusters);
  addRuleEdges(ctx);
  addLegend(ctx);

  return ctx.lines.concat(ctx.edgeStyles).join("\n");
}

function addStyles(ctx: DiagramContext) {
  ctx.lines.push("");
  ctx.lines.push("  %% Node Styles");
  ctx.lines.push("  classDef module fill:#f1f5f9,stroke:#64748b,stroke-width:2px;");
  ctx.lines.push("  classDef external fill:#ffffff,stroke:#94a3b8,stroke-width:1px,stroke-dasharray: 5 5;");
}

function discoverClusters(ctx: DiagramContext): Map<string, string[]> {
  const clusters = new Map<string, string[]>();
  const allInvolvedNodes = new Set<string>(Object.keys(ctx.config.modules));
  const rules = ctx.config.rules["module-boundaries"].rules;

  rules.forEach((rule, index) => {
    const { effectiveImporter } = resolveRuleDefaults(rule, index, ctx.globalSeverity);
    allInvolvedNodes.add(effectiveImporter);
    const importPatterns = Array.isArray(rule.imports) ? rule.imports : [rule.imports];
    importPatterns.forEach((pattern) => {
      if (typeof pattern === "string") {
        allInvolvedNodes.add(pattern);
      }
    });

    const exportsList = normalizeExports(rule.exports);
    exportsList.forEach((entry) => {
      allInvolvedNodes.add(entry.path);
      allInvolvedNodes.add(entry.to);
    });
  });

  // Simple clustering - group by first segment of module name
  allInvolvedNodes.forEach((name) => {
    const parts = name.split("/");
    const cluster = parts.length > 1 ? parts[0] : "Base";
    const existing = clusters.get(cluster) ?? [];
    existing.push(name);
    clusters.set(cluster, existing);
  });

  return clusters;
}

function getSafeId(ctx: DiagramContext, name: string): string {
  if (!ctx.nodeIds.has(name)) {
    ctx.nodeIds.set(name, `n${ctx.idCounter++}`);
  }
  return ctx.nodeIds.get(name)!;
}

function renderClusters(ctx: DiagramContext, clusters: Map<string, string[]>) {
  clusters.forEach((nodeNames, clusterName) => {
    ctx.lines.push("");
    ctx.lines.push(`  subgraph c${ctx.idCounter++} [" ${escapeMermaid(clusterName)} "]`);
    nodeNames.forEach((name) => {
      const id = getSafeId(ctx, name);
      const isModule = !!ctx.config.modules[name];
      const h = ctx.healthByModule.get(name);

      let label = escapeMermaid(name);
      if (h) {
        label += `<br/><small>Ca:${h.afferentCoupling} Ce:${h.efferentCoupling} I:${h.instability.toFixed(2)}</small>`;
      }

      const shape = name.includes("$") ? `(["${label}"])` : `["${label}"]`;
      const className = isModule ? "module" : "external";
      ctx.lines.push(`    ${id}${shape}:::${className}`);
    });
    ctx.lines.push("  end");
  });
}

function addEdge(ctx: DiagramContext, edge: {
  fromId: string;
  toId: string;
  label: string;
  color: string;
  width?: string;
  dash?: boolean;
  arrow?: string;
}) {
  const arrow = edge.arrow ?? "-->";
  const width = edge.width ?? "2px";
  const dash = edge.dash ? ",stroke-dasharray:5" : "";
  ctx.lines.push(`  ${edge.fromId} ${arrow}|"${escapeMermaid(edge.label)}"| ${edge.toId}`);
  ctx.edgeStyles.push(`  linkStyle ${ctx.edgeIndex++} stroke:${edge.color},stroke-width:${width}${dash}`);
}

function addRuleEdges(ctx: DiagramContext) {
  ctx.lines.push("");
  ctx.lines.push("  %% Boundary Rules");

  const rules = ctx.config.rules["module-boundaries"].rules;
  const exportColor = "#14b8a6";
  const onlyColor = "#f97316";

  rules.forEach((rule, index) => {
    const { allow, label, effectiveImporter, isAllowStyle, isOnly } = resolveRuleDefaults(
      rule,
      index,
      ctx.globalSeverity
    );

    const importPatterns = Array.isArray(rule.imports) ? rule.imports : [rule.imports];

    importPatterns.forEach((pattern) => {
      if (typeof pattern !== "string") {
        return;
      }

      const fromId = getSafeId(ctx, isOnly ? pattern : effectiveImporter);
      const toId = getSafeId(ctx, isOnly ? effectiveImporter : pattern);
      const actionLabel = isOnly
        ? (rule.containedTo ? "CONTAINED" : "ONLY")
        : (allow ? "ALLOW" : "DENY");
      const edgeLabel = rule.message || `${actionLabel}: ${label}`;
      const color = isOnly ? onlyColor : (isAllowStyle ? "#22c55e" : "#ef4444");

      addEdge(ctx, {
        fromId,
        toId,
        label: edgeLabel,
        color,
        width: isOnly ? "4px" : "2px",
        dash: !isAllowStyle && !isOnly,
        arrow: isAllowStyle || isOnly ? "-->" : "-.->",
      });
    });

    normalizeExports(rule.exports).forEach((entry) => {
      addEdge(ctx, {
        fromId: getSafeId(ctx, entry.to),
        toId: getSafeId(ctx, entry.path),
        label: `EXPORT: ${label}`,
        color: exportColor,
      });
    });
  });
}

function addLegend(ctx: DiagramContext) {
  ctx.lines.push("");
  ctx.lines.push("  %% Legend");
  ctx.lines.push("  subgraph Legend");
  ctx.lines.push('    legendAllow["ALLOW"]');
  ctx.lines.push('    legendDeny["DENY"]');
  ctx.lines.push('    legendOnly["ONLY/CONTAINED"]');
  ctx.lines.push('    legendExport["EXPORT EXCEPTION"]');
  ctx.lines.push("  end");

  ctx.lines.push("");
  ctx.lines.push("  %% Legend Edges");
  addEdge(ctx, { fromId: "legendAllow", toId: "legendDeny", label: "ALLOW", color: "#22c55e" });
  addEdge(ctx, {
    fromId: "legendDeny",
    toId: "legendAllow",
    label: "DENY",
    color: "#ef4444",
    dash: true,
    arrow: "-.->",
  });
  addEdge(ctx, { fromId: "legendOnly", toId: "legendAllow", label: "ONLY", color: "#f97316", width: "4px" });
  addEdge(ctx, { fromId: "legendExport", toId: "legendAllow", label: "EXPORT", color: "#14b8a6" });
}

function normalizeExports(exportsRule: ExportRule | ExportRule[] | undefined): ExportRule[] {
  if (!exportsRule) {
    return [];
  }
  return Array.isArray(exportsRule) ? exportsRule : [exportsRule];
}
