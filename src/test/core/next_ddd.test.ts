import * as path from "path";
import { normalizePath } from "../../core/utils";
import * as assert from "assert";
import { checkBoundaries } from "../../core/boundaries";
import { loadConfig } from "../../core/config";
import { loadTsConfigAliases } from "../../core/tsconfig";
import * as fs from "fs";
import type { WorkspaceContext } from "../../shared/types";

// This test uses the actual fixture on disk
const FIXTURE_DIR = normalizePath(path.resolve(__dirname, "../../../fixtures/next-ddd"));

function makeCtx(files: Set<string>, root: string, aliases: Record<string, string>): WorkspaceContext {
  return {
    knownFiles: files,
    root,
    aliases,
  };
}

suite("Next-DDD Fixture Validation", () => {
  let config: any;
  let aliases: Record<string, string>;
  let knownFiles: Set<string>;

  suiteSetup(() => {
    const configResult = loadConfig(FIXTURE_DIR);
    if (!configResult.ok) {
      assert.fail(`Failed to load fixture config: ${JSON.stringify(configResult.errors)}`);
    }
    config = configResult.config;
    aliases = loadTsConfigAliases(FIXTURE_DIR);

    // Discover files for the context
    knownFiles = new Set();
    const discover = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = normalizePath(path.join(dir, entry.name));
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules") {
            discover(fullPath);
          }
        } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
          knownFiles.add(fullPath);
        }
      }
    };
    discover(FIXTURE_DIR);
  });

  test("StrainManagementPage violates the 'only' rule by importing a feature page", () => {
    const filePath = normalizePath(path.join(FIXTURE_DIR, "features/strain/pages/StrainManagementPage.tsx"));
    const content = fs.readFileSync(filePath, "utf-8");

    const violations = checkBoundaries(filePath, content, config, makeCtx(knownFiles, FIXTURE_DIR, aliases));

    // StrainManagementPage imports @/features/batch/pages/BatchPage, which matches
    // the "only" rule restricting features/*/pages/** to the app module.
    assert.strictEqual(violations.length, 1, `Expected 1 violation, but found ${violations.length}: ${violations.map(v => v.message).join(", ")}`);
    assert.ok(violations[0].message.includes("Feature pages can only be imported by app/"), `Expected 'only' rule message, got: "${violations[0].message}"`);
  });

  test("App main should be valid", () => {
    const filePath = normalizePath(path.join(FIXTURE_DIR, "app/main.tsx"));
    const content = fs.readFileSync(filePath, "utf-8");

    const violations = checkBoundaries(filePath, content, config, makeCtx(knownFiles, FIXTURE_DIR, aliases));

    assert.strictEqual(violations.length, 0, `Expected no violations in app/main.tsx, but found: ${violations.map(v => v.message).join(", ")}`);
  });

  test("Domain and Core layers should follow rules", () => {
    const corePath = normalizePath(path.join(FIXTURE_DIR, "core/service.ts"));
    const coreContent = fs.readFileSync(corePath, "utf-8");
    const coreViolations = checkBoundaries(corePath, coreContent, config, makeCtx(knownFiles, FIXTURE_DIR, aliases));
    assert.strictEqual(coreViolations.length, 0, "Core service should be valid");

    const domainPath = normalizePath(path.join(FIXTURE_DIR, "domain/model.ts"));
    const domainContent = fs.readFileSync(domainPath, "utf-8");
    const domainViolations = checkBoundaries(domainPath, domainContent, config, makeCtx(knownFiles, FIXTURE_DIR, aliases));
    assert.strictEqual(domainViolations.length, 0, "Domain model should be valid");
  });
});
