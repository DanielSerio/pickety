import * as assert from "assert";
import * as path from "path";
import { normalizePath } from "../../core/utils";
import type { Violation } from "../../shared/types";
import { buildCheckReport, formatGroupSummary, formatViolation } from "../../cli/formatters";

const ROOT_DIR = normalizePath(path.resolve("/project"));

suite("cli formatters", () => {
  test("formatViolation uses 1-indexed positions", () => {
    const v: Violation = {
      file: `${ROOT_DIR}/src/main.ts`,
      line: 9,
      character: 4,
      length: 5,
      message: "violation",
      severity: "error",
      ruleName: "rule1"
    };
    const result = formatViolation(v, ROOT_DIR);
    assert.strictEqual(result, "src/main.ts:10:5: error violation");
  });

  test("buildCheckReport includes grouped and ungrouped counts", () => {
    const violations: Violation[] = [
      {
        file: `${ROOT_DIR}/src/features/auth/service.ts`,
        line: 0,
        character: 0,
        length: 10,
        message: "[Layering: no-cross] example",
        severity: "error",
        ruleName: "no-cross",
        ruleGroup: "Layering",
        sourceModule: "features",
        targetModule: "features",
      },
      {
        file: `${ROOT_DIR}/src/routes/auth/index.ts`,
        line: 2,
        character: 4,
        length: 8,
        message: "[rule[1]] example",
        severity: "warn",
        ruleName: "rule[1]",
        sourceModule: "routes",
        targetModule: "features",
      },
    ];

    const report = buildCheckReport(violations, [["features", "routes", "features"]], ROOT_DIR);
    assert.strictEqual(report.summary.violations, 2);
    assert.strictEqual(report.summary.cycles, 1);
    assert.strictEqual(report.summary.errors, 2); // 1 error + 1 cycle
    assert.strictEqual(report.summary.warnings, 1);
    assert.strictEqual(report.summary.info, 0);
    assert.strictEqual(report.groups.Layering, 1);
    assert.strictEqual(report.groups.ungrouped, 1);
    assert.strictEqual(report.violations[0].file, "src/features/auth/service.ts");
  });

  test("formatGroupSummary returns detailed summary", () => {
    const violations: Violation[] = [
      { file: "a", line: 0, character: 0, length: 0, message: "m", severity: "error", ruleGroup: "G1" },
      { file: "b", line: 0, character: 0, length: 0, message: "m", severity: "error", ruleGroup: "G1" },
      { file: "c", line: 0, character: 0, length: 0, message: "m", severity: "error", ruleGroup: "G2" },
      { file: "d", line: 0, character: 0, length: 0, message: "m", severity: "error" },
    ];

    const summary = formatGroupSummary(violations);
    assert.ok(summary?.includes("G1: 2"));
    assert.ok(summary?.includes("G2: 1"));
    assert.ok(summary?.includes("(ungrouped): 1"));
  });

  test("formatGroupSummary returns undefined when no groups are present", () => {
    const violations: Violation[] = [
      {
        file: `${ROOT_DIR}/src/routes/auth/index.ts`,
        line: 2,
        character: 4,
        length: 8,
        message: "[rule[0]] example",
        severity: "warn",
        ruleName: "rule[0]",
      },
    ];

    assert.strictEqual(formatGroupSummary(violations), undefined);
  });
});
