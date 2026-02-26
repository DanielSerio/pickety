import * as path from "path";
import { normalizePath } from "../../core/utils";
import * as assert from "assert";
import { checkBoundaries } from "../../core/boundaries";
import { loadConfig } from "../../core/config";
import type { PicketyConfig, WorkspaceContext } from "../../shared/types";

// Virtual root used for constructing file paths in test scenarios
const ROOT_DIR = normalizePath(path.resolve("/project"));

// Load the real myco-log pickety.json so this test stays in sync with the actual config.
// Resolved from the compiled output location: out/test/core/ -> ../../../../myco-log
const MYCO_LOG_DIR = normalizePath(path.resolve(__dirname, "../../../../myco-log"));
const configResult = loadConfig(MYCO_LOG_DIR);

function makeCtx(files: Set<string>): WorkspaceContext {
  return {
    knownFiles: files,
    root: ROOT_DIR,
    aliases: { "@/*": "./*" },
  };
}

suite("Myco-log Regression", () => {
  let config: PicketyConfig;

  suiteSetup(() => {
    assert.ok(
      configResult.ok,
      `Failed to load myco-log pickety.json: ${!configResult.ok ? configResult.errors.map((e) => e.message).join(", ") : ""}`
    );
    assert.ok(configResult.config, "myco-log pickety.json loaded but config is undefined");
    config = configResult.config!;
  });

  const knownFiles = new Set([
    `${ROOT_DIR}/features/strain/pages/StrainManagementPage.tsx`,
    `${ROOT_DIR}/features/batch/api/client.ts`,
    `${ROOT_DIR}/features/batch/pages/BatchPage.tsx`,
    `${ROOT_DIR}/features/batch/components/index.ts`,
  ]);

  test("StrainManagementPage should NOT be allowed to import from batch/api", () => {
    const filePath = `${ROOT_DIR}/features/strain/pages/StrainManagementPage.tsx`;
    const content = `import { client } from '@/features/batch/api/client';`;

    const violations = checkBoundaries(filePath, content, config, makeCtx(knownFiles));

    assert.strictEqual(violations.length, 1, "Should have a violation for cross-feature api import");
    assert.ok(violations[0].message.includes("contained to \"features/batch/**\""));
  });

  test("StrainManagementPage should NOT be allowed to import from batch/pages", () => {
    const filePath = `${ROOT_DIR}/features/strain/pages/StrainManagementPage.tsx`;
    const content = `import { BatchPage } from '@/features/batch/pages/BatchPage';`;

    const violations = checkBoundaries(filePath, content, config, makeCtx(knownFiles));

    assert.strictEqual(violations.length, 1, "Should have a violation because feature pages can only be imported by app/");
    assert.ok(violations[0].message.includes("Feature pages can only be imported by app/"));
  });

  test("StrainManagementPage should NOT be allowed to import from batch/components", () => {
    const filePath = `${ROOT_DIR}/features/strain/pages/StrainManagementPage.tsx`;
    const content = `import { TestBatchComponent } from '@/features/batch/components';`;

    const violations = checkBoundaries(filePath, content, config, makeCtx(knownFiles));

    assert.strictEqual(violations.length, 1, "Should have a violation for cross-feature component import");
  });
});
