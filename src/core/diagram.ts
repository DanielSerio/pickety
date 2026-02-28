import * as fs from "fs";
import * as path from "path";
import type { PicketyConfig, ModuleHealth } from "../shared/types";
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

  if (!nOutput.startsWith(nRoot + "/")) {
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

function buildMermaidContent(config: PicketyConfig, health?: ModuleHealth[]): string {
  const lines: string[] = ["graph LR"];
  const modules = config.modules;
  const rules = config.rules["module-boundaries"].rules;
  const globalSeverity = config.rules["module-boundaries"].severity;

  // 1. Map health for easy access
  const healthByModule = new Map<string, ModuleHealth>();
  if (health) {
    for (const h of health) {
      healthByModule.set(h.moduleName, h);
    }
  }

  // 2. Styles
  lines.push("");
  lines.push("  %% Node Styles");
  lines.push("  classDef module fill:#f1f5f9,stroke:#64748b,stroke-width:2px;");
  lines.push("  classDef external fill:#ffffff,stroke:#94a3b8,stroke-width:1px,stroke-dasharray: 5 5;");

  // 3. Define Nodes and Cluster them
  const clusters = new Map<string, string[]>();
  const allInvolvedNodes = new Set<string>(Object.keys(modules));

  // Add any patterns from rules that aren't explicit modules
  rules.forEach((rule, index) => {
    const { effectiveImporter } = resolveRuleDefaults(rule, index, globalSeverity);
    allInvolvedNodes.add(effectiveImporter);
    const importPatterns = Array.isArray(rule.imports) ? rule.imports : [rule.imports];
    importPatterns.forEach((pattern) => {
      if (typeof pattern === "string") {
        allInvolvedNodes.add(pattern);
      }
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

  const nodeIds = new Map<string, string>();
  let idCounter = 0;
  const getSafeId = (name: string) => {
    if (!nodeIds.has(name)) {
      nodeIds.set(name, `n${idCounter++}`);
    }
    return nodeIds.get(name)!;
  };

  clusters.forEach((nodeNames, clusterName) => {
    lines.push("");
    lines.push(`  subgraph c${idCounter++} [" ${escapeMermaid(clusterName)} "]`);
    nodeNames.forEach((name) => {
      const id = getSafeId(name);
      const isModule = !!modules[name];
      const h = healthByModule.get(name);

      let label = escapeMermaid(name);
      if (h) {
        label += `<br/><small>Ca:${h.afferentCoupling} Ce:${h.efferentCoupling} I:${h.instability.toFixed(
          2
        )}</small>`;
      }

      // Interpolation patterns get stadium shape, others square
      const shape = name.includes("$") ? `(["${label}"])` : `["${label}"]`;
      const className = isModule ? "module" : "external";

      lines.push(`    ${id}${shape}:::${className}`);
    });
    lines.push("  end");
  });

  // 4. Edges (Rules)
  lines.push("");
  lines.push("  %% Boundary Rules");

  const edgeStyles: string[] = [];
  let edgeIndex = 0;

  rules.forEach((rule, index) => {
    const { allow, name, effectiveImporter, isAllowStyle, isOnly } = resolveRuleDefaults(
      rule,
      index,
      globalSeverity
    );

    const importPatterns = Array.isArray(rule.imports) ? rule.imports : [rule.imports];
    const fromId = getSafeId(effectiveImporter);

    importPatterns.forEach((pattern) => {
      if (typeof pattern !== "string") {
        return;
      }

      const toId = getSafeId(pattern);
      const arrow = isAllowStyle ? "-->" : "-.->";
      const actionLabel = allow ? "ALLOW" : "DENY";
      const label = rule.message || `${actionLabel}: ${name}`;

      lines.push(`  ${fromId} ${arrow}|"${escapeMermaid(label)}"| ${toId}`);

      // Style the edge: green for allow, red for deny, thicker for 'only' constraints
      const color = isAllowStyle ? "#22c55e" : "#ef4444";
      const width = isOnly ? "4px" : "2px";
      const dash = isAllowStyle ? "" : ",stroke-dasharray:5";
      edgeStyles.push(`  linkStyle ${edgeIndex++} stroke:${color},stroke-width:${width}${dash}`);
    });
  });

  return lines.concat(edgeStyles).join("\n");
}
