import * as fs from "fs";
import * as path from "path";
import type { PicketyConfig, ModuleHealth } from "../types";
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

  // Build a lookup for health metrics by module name
  const healthByModule = new Map<string, ModuleHealth>();
  if (health) {
    for (const mod of health) {
      healthByModule.set(mod.moduleName, mod);
    }
  }

  // Module reference: list all modules and their patterns (with health metrics if available)
  lines.push("");
  lines.push("  %% Module definitions");
  for (const [name, pattern] of Object.entries(modules)) {
    const h = healthByModule.get(name);
    if (h) {
      lines.push(`  %% ${name}: ${pattern} (Ca=${h.afferentCoupling} Ce=${h.efferentCoupling} I=${h.instability.toFixed(2)} depth=${h.dependencyDepth})`);
    } else {
      lines.push(`  %% ${name}: ${pattern}`);
    }
  }

  // Pre-resolve all rule defaults to avoid repeated computation
  const resolvedRules = rules.map((rule, index) => ({
    rule,
    index,
    ...resolveRuleDefaults(rule, index, globalSeverity),
  }));

  // Each rule gets its own subgraph so the diagram reads rule-by-rule
  resolvedRules.forEach(({ rule, index, allow, severity, name, effectiveImporter, isOnly, isAllowStyle }) => {
    const ruleName = escapeMermaid(name);
    let action = allow ? "ALLOW" : "DENY";
    if (isOnly) {
      action = rule.containedTo ? "CONTAINED TO" : "ONLY";
    }

    lines.push("");
    lines.push(`  subgraph rule_${index} ["${action}: ${ruleName} (${severity})"]`);

    const fromId = `r${index}_from`;
    const toId = `r${index}_to`;

    // Stadium shape for interpolation patterns, rectangle for plain modules
    const safeImporter = escapeMermaid(effectiveImporter);
    const safeImports = escapeMermaid(rule.imports);
    const fromShape = effectiveImporter.includes("$")
      ? `(["${safeImporter}"])`
      : `["${safeImporter}"]`;
    const toShape = rule.imports.includes("$")
      ? `(["${safeImports}"])`
      : `["${safeImports}"]`;

    lines.push(`    ${fromId}${fromShape}`);
    lines.push(`    ${toId}${toShape}`);

    // Dashed arrow for deny, solid for allow. Label with custom message if present.
    const arrow = isAllowStyle ? "-->" : "-.->";
    const label = rule.message ? ` |"${escapeMermaid(rule.message)}"|` : "";
    lines.push(`    ${fromId} ${arrow}${label} ${toId}`);

    lines.push("  end");
  });

  // Color-code edges: green for allow, red dashed for deny
  lines.push("");
  resolvedRules.forEach(({ isAllowStyle, index }) => {
    if (isAllowStyle) {
      lines.push(`  linkStyle ${index} stroke:#22c55e,stroke-width:2px`);
    } else {
      lines.push(`  linkStyle ${index} stroke:#ef4444,stroke-width:2px,stroke-dasharray:5`);
    }
  });

  // Health metrics summary section (when health data is available)
  if (healthByModule.size > 0) {
    lines.push("");
    lines.push(`  subgraph health_summary ["Module Health"]`);
    for (const [name] of Object.entries(modules)) {
      const h = healthByModule.get(name);
      if (h) {
        const id = `health_${escapeMermaid(name)}`;
        const label = `${escapeMermaid(name)}\\nCa=${h.afferentCoupling} Ce=${h.efferentCoupling} I=${h.instability.toFixed(2)} depth=${h.dependencyDepth}`;
        lines.push(`    ${id}["${label}"]`);
      }
    }
    lines.push("  end");
  }

  return lines.join("\n");
}
