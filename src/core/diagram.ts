import * as fs from "fs";
import * as path from "path";
import type { PicketyConfig } from "../types";

/**
 * Generates a Mermaid diagram from the Pickety configuration.
 * Writes the output to the specified path in pickety.json or a default location.
 */
export function generateMermaidDiagram(config: PicketyConfig, root: string): string | undefined {
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

  const mermaidContent = buildMermaidContent(config);

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

function buildMermaidContent(config: PicketyConfig): string {
  const lines: string[] = ["graph LR"];
  const modules = config.modules;
  const rules = config.rules["module-boundaries"].rules;
  const globalSeverity = config.rules["module-boundaries"].severity;

  // Module reference: list all modules and their patterns as comments
  lines.push("");
  lines.push("  %% Module definitions");
  for (const [name, pattern] of Object.entries(modules)) {
    lines.push(`  %% ${name}: ${pattern}`);
  }

  // Each rule gets its own subgraph so the diagram reads rule-by-rule
  rules.forEach((rule, index) => {
    const allow = rule.allow ?? false;
    const severity = rule.severity ?? globalSeverity;
    const ruleName = rule.name ?? `rule[${index}]`;
    const action = allow ? "ALLOW" : "DENY";

    lines.push("");
    lines.push(`  subgraph rule_${index} ["${action}: ${ruleName} (${severity})"]`);

    const fromId = `r${index}_from`;
    const toId = `r${index}_to`;

    // Stadium shape for interpolation patterns, rectangle for plain modules
    const fromShape = rule.importer.includes("$")
      ? `(["${rule.importer}"])`
      : `["${rule.importer}"]`;
    const toShape = rule.imports.includes("$")
      ? `(["${rule.imports}"])`
      : `["${rule.imports}"]`;

    lines.push(`    ${fromId}${fromShape}`);
    lines.push(`    ${toId}${toShape}`);

    // Dashed arrow for deny, solid for allow. Label with custom message if present.
    const arrow = allow ? "-->" : "-.->";
    const label = rule.message ? ` |"${rule.message}"|` : "";
    lines.push(`    ${fromId} ${arrow}${label} ${toId}`);

    lines.push("  end");
  });

  // Color-code edges: green for allow, red dashed for deny
  lines.push("");
  rules.forEach((rule, index) => {
    const allow = rule.allow ?? false;
    if (allow) {
      lines.push(`  linkStyle ${index} stroke:#22c55e,stroke-width:2px`);
    } else {
      lines.push(`  linkStyle ${index} stroke:#ef4444,stroke-width:2px,stroke-dasharray:5`);
    }
  });

  return lines.join("\n");
}
