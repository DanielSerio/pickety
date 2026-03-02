import type { PicketyConfig, Violation, ModuleHealth } from "../shared/types";
import { toRelativePath, formatHealthMetricValue } from "../core/utils";
import { countViolationsBySeverity } from "../shared/utils";
import { matchFileToModule } from "../core/imports";
import { ImportGraph } from "../core/graph";

/**
 * Formats a violation as a lint-style string: file:line:col: severity message
 */
export function formatViolation(v: Violation, root: string): string {
  const relativePath = toRelativePath(root, v.file);
  const line = v.line + 1;
  const col = v.character + 1;
  const severity = v.severity === "error" ? "error" : v.severity === "info" ? "info" : "warning";
  return `${relativePath}:${line}:${col}: ${severity} ${v.message}`;
}

export function formatGroupSummary(violations: Violation[]): string | undefined {
  const grouped = new Map<string, number>();
  let ungrouped = 0;
  let hasGroup = false;

  for (const v of violations) {
    if (v.ruleGroup) {
      hasGroup = true;
      grouped.set(v.ruleGroup, (grouped.get(v.ruleGroup) ?? 0) + 1);
    } else {
      ungrouped += 1;
    }
  }

  if (!hasGroup) {
    return undefined;
  }

  const lines: string[] = [];
  lines.push("");
  lines.push("Groups:");
  for (const [group, count] of grouped.entries()) {
    lines.push(`  ${group}: ${count}`);
  }
  if (ungrouped > 0) {
    lines.push(`  (ungrouped): ${ungrouped}`);
  }
  return lines.join("\n");
}

export type CheckReport = {
  violations: Array<{
    file: string;
    line: number;
    column: number;
    length: number;
    message: string;
    severity: string;
    ruleName?: string;
    ruleGroup?: string;
    sourceModule?: string;
    targetModule?: string;
  }>;
  cycles: string[][];
  summary: {
    violations: number;
    cycles: number;
    errors: number;
    warnings: number;
    info: number;
  };
  groups: Record<string, number>;
};

export function buildCheckReport(
  violations: Violation[],
  cycles: string[][],
  root: string
): CheckReport {
  const formattedViolations = violations.map((v) => ({
    file: toRelativePath(root, v.file),
    line: v.line + 1,
    column: v.character + 1,
    length: v.length,
    message: v.message,
    severity: v.severity,
    ruleName: v.ruleName,
    ruleGroup: v.ruleGroup,
    sourceModule: v.sourceModule,
    targetModule: v.targetModule,
  }));

  const counts = countViolationsBySeverity(violations);
  const errors = counts.errors + cycles.length;
  const warnings = counts.warnings;
  const info = counts.info;

  const groups: Record<string, number> = {};
  let ungrouped = 0;
  for (const v of violations) {
    if (v.ruleGroup) {
      groups[v.ruleGroup] = (groups[v.ruleGroup] ?? 0) + 1;
    } else {
      ungrouped += 1;
    }
  }
  if (ungrouped > 0) {
    groups.ungrouped = ungrouped;
  }

  return {
    violations: formattedViolations,
    cycles,
    summary: {
      violations: violations.length,
      cycles: cycles.length,
      errors,
      warnings,
      info,
    },
    groups,
  };
}

/**
 * Options for printing an impact report.
 */
export interface ImpactReportOptions {
  filePath: string;
  graph: ImportGraph;
  config: PicketyConfig;
  root: string;
}

/**
 * Prints a grouped impact report for a single file to the console.
 */
export function printImpactReport(options: ImpactReportOptions) {
  const { filePath, graph, config, root } = options;
  const relativePath = toRelativePath(root, filePath);
  const directDependents = graph.getDependents(filePath);
  const transitiveDependents = graph.getTransitiveDependents(filePath);

  console.log(`Impact analysis for ${relativePath}:\n`);

  if (directDependents.size === 0) {
    console.log("  No dependents found.\n");
    return;
  }

  console.log(`  Direct dependents (${directDependents.size} file${directDependents.size === 1 ? "" : "s"}):`);
  for (const dep of directDependents) {
    const mod = matchFileToModule(dep, config.modules, root) ?? "(unmatched)";
    const rel = toRelativePath(root, dep);
    console.log(`    ${rel} (${mod})`);
  }

  const allAffectedModules = new Set<string>();
  for (const dep of transitiveDependents) {
    const mod = matchFileToModule(dep, config.modules, root);
    if (mod) {
      allAffectedModules.add(mod);
    }
  }

  if (transitiveDependents.size > directDependents.size) {
    console.log(
      `\n  Transitive dependents (${transitiveDependents.size} file${transitiveDependents.size === 1 ? "" : "s"} across ${allAffectedModules.size} module${allAffectedModules.size === 1 ? "" : "s"}):`
    );
    console.log(`    ${[...allAffectedModules].join(", ")}`);
  }

  console.log(`\n  Affected modules: ${[...allAffectedModules].join(", ") || "none"}`);
  console.log("");
}

/**
 * Prints the module health report as a formatted table.
 */
export function printHealthReport(
  health: ModuleHealth[],
  violations: { moduleName: string; metric: string; threshold: number; }[]
) {
  console.log("Module Health Report:\n");
  const header = ["Module", "Files", "Ca", "Ce", "Instability", "Depth"];
  const colWidths = [
    Math.max(header[0].length, ...health.map((m) => m.moduleName.length)),
    Math.max(header[1].length, ...health.map((m) => String(m.fileCount).length)),
    Math.max(header[2].length, ...health.map((m) => String(m.afferentCoupling).length)),
    Math.max(header[3].length, ...health.map((m) => String(m.efferentCoupling).length)),
    Math.max(header[4].length, 11), // "Instability"
    Math.max(header[5].length, ...health.map((m) => String(m.dependencyDepth).length)),
  ];

  const pad = (s: string, w: number) => s.padEnd(w);
  const padNum = (s: string, w: number) => s.padStart(w);

  console.log(
    "  " + header.map((h, i) => pad(h, colWidths[i])).join("   ")
  );
  console.log(
    "  " + colWidths.map((w) => "\u2500".repeat(w)).join("   ")
  );

  for (const mod of health) {
    const cols = [
      pad(mod.moduleName, colWidths[0]),
      padNum(String(mod.fileCount), colWidths[1]),
      padNum(String(mod.afferentCoupling), colWidths[2]),
      padNum(String(mod.efferentCoupling), colWidths[3]),
      padNum(formatHealthMetricValue("instability", mod.instability), colWidths[4]),
      padNum(String(mod.dependencyDepth), colWidths[5]),
    ];

    let line = "  " + cols.join("   ");

    const modViolations = violations.filter((v) => v.moduleName === mod.moduleName);
    if (modViolations.length > 0) {
      const notes = modViolations.map((v) => {
        const thresholdStr = formatHealthMetricValue(v.metric, v.threshold);
        const metricName = v.metric.charAt(0).toUpperCase() + v.metric.slice(1);
        return `exceeds max${metricName} (${thresholdStr})`;
      });
      line += "      \u2190 " + notes.join(", ");
    }

    console.log(line);
  }
}
