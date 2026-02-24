import type { PicketyConfig, Violation, Severity } from "../shared/types";

// Applies maxViolations thresholds across all collected violations.
// Groups violations by rule name, then:
// - If a rule has maxViolations set and the count is within the threshold, downgrade to "warn"
// - If the count exceeds the threshold, escalate all violations for that rule to "error"
export function applyMaxViolations(
  violations: Violation[],
  config: PicketyConfig
): Violation[] {
  const rules = config.rules["module-boundaries"].rules;

  // Build a lookup: ruleName -> maxViolations (only for rules that set it)
  const thresholds = new Map<string, number>();
  rules.forEach((rule, index) => {
    if (rule.maxViolations !== undefined) {
      const name = rule.name ?? `rule[${index}]`;
      thresholds.set(name, rule.maxViolations);
    }
  });

  if (thresholds.size === 0) {
    return violations;
  }

  // Count violations per rule
  const counts = new Map<string, number>();
  for (const v of violations) {
    if (v.ruleName && thresholds.has(v.ruleName)) {
      counts.set(v.ruleName, (counts.get(v.ruleName) ?? 0) + 1);
    }
  }

  // Adjust severity based on threshold
  return violations.map((v) => {
    if (!v.ruleName || !thresholds.has(v.ruleName)) {
      return v;
    }

    const count = counts.get(v.ruleName) ?? 0;
    const threshold = thresholds.get(v.ruleName)!;
    const newSeverity: Severity = count <= threshold ? "warn" : "error";

    if (newSeverity === v.severity) {
      return v;
    }

    return { ...v, severity: newSeverity };
  });
}
