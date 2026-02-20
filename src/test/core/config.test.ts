import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { loadConfig, loadTsConfigAliases } from "../../core/config";

suite("config", () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pickety-test-"));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Helper to write a pickety.json and load it
  const writeAndLoad = (content: string) => {
    fs.writeFileSync(path.join(tmpDir, "pickety.json"), content, "utf-8");
    return loadConfig(tmpDir);
  };

  // --- Happy path ---

  test("loads a valid config with all fields", () => {
    const result = writeAndLoad(
      JSON.stringify({
        modules: { features: "src/features/*" },
        rules: {
          "module-boundaries": {
            severity: "error",
            rules: [
              { importer: "features", imports: "features", allow: false, message: "no cross-feature" },
            ],
          },
        },
      })
    );

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.config.modules.features, "src/features/*");
      assert.strictEqual(result.config.rules["module-boundaries"].severity, "error");
      assert.strictEqual(result.config.rules["module-boundaries"].rules.length, 1);
      assert.strictEqual(result.config.rules["module-boundaries"].rules[0].allow, false);
    }
  });

  test("severity defaults to 'error' when omitted", () => {
    const result = writeAndLoad(
      JSON.stringify({
        modules: { app: "src/app/**/*" },
        rules: {
          "module-boundaries": {
            rules: [{ importer: "*", imports: "app" }],
          },
        },
      })
    );

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.config.rules["module-boundaries"].severity, "error");
    }
  });

  test("allow field is optional and not required", () => {
    const result = writeAndLoad(
      JSON.stringify({
        modules: { routes: "src/routes/*" },
        rules: {
          "module-boundaries": {
            severity: "warn",
            rules: [{ importer: "*", imports: "routes" }],
          },
        },
      })
    );

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      const rule = result.config.rules["module-boundaries"].rules[0];
      assert.strictEqual(rule.allow, undefined);
    }
  });

  test("accepts warn severity", () => {
    const result = writeAndLoad(
      JSON.stringify({
        modules: { lib: "src/lib/*" },
        rules: {
          "module-boundaries": {
            severity: "warn",
            rules: [],
          },
        },
      })
    );

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.config.rules["module-boundaries"].severity, "warn");
    }
  });

  test("accepts multiple modules and rules", () => {
    const result = writeAndLoad(
      JSON.stringify({
        modules: {
          features: "src/features/*",
          components: "src/components/**/*",
          utils: "src/utils/**/*",
        },
        rules: {
          "module-boundaries": {
            severity: "error",
            rules: [
              { importer: "features", imports: "features" },
              { importer: "utils", imports: "*" },
              { importer: "components", imports: "features", allow: false },
            ],
          },
        },
      })
    );

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(Object.keys(result.config.modules).length, 3);
      assert.strictEqual(result.config.rules["module-boundaries"].rules.length, 3);
    }
  });

  // --- Edge cases ---

  test("returns error when pickety.json does not exist", () => {
    const result = loadConfig(tmpDir);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some(e => e.message.includes("File not found")));
    }
  });

  test("returns error for invalid JSON", () => {
    // jsonc-parser is lenient and parses malformed input as {}, so validation
    // will report missing required fields rather than a parse error
    const result = writeAndLoad("{ not valid json");
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.length > 0);
    }
  });

  test("returns error when modules is missing", () => {
    const result = writeAndLoad(
      JSON.stringify({
        rules: { "module-boundaries": { rules: [] } },
      })
    );
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some(e => e.path === "modules"));
    }
  });

  test("returns error when modules contains non-string values", () => {
    const result = writeAndLoad(
      JSON.stringify({
        modules: { features: 123 },
        rules: { "module-boundaries": { rules: [] } },
      })
    );
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some(e => e.path === "modules.features"));
    }
  });

  test("returns error when rules section is missing", () => {
    const result = writeAndLoad(
      JSON.stringify({
        modules: { features: "src/features/*" },
      })
    );
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some(e => e.path === "rules"));
    }
  });

  test("returns error when module-boundaries is missing from rules", () => {
    const result = writeAndLoad(
      JSON.stringify({
        modules: { features: "src/features/*" },
        rules: {},
      })
    );
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some(e => e.path === "rules.module-boundaries"));
    }
  });

  test("returns error when rules array is not an array", () => {
    const result = writeAndLoad(
      JSON.stringify({
        modules: { features: "src/features/*" },
        rules: { "module-boundaries": { rules: "not-an-array" } },
      })
    );
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some(e => e.path === "rules.module-boundaries.rules"));
    }
  });

  test("returns error when severity is invalid", () => {
    const result = writeAndLoad(
      JSON.stringify({
        modules: { features: "src/features/*" },
        rules: {
          "module-boundaries": { severity: "fatal", rules: [] },
        },
      })
    );
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some(e => e.path === "rules.module-boundaries.severity"));
    }
  });

  test("returns error when a rule is missing both importer and containedTo", () => {
    const result = writeAndLoad(
      JSON.stringify({
        modules: { features: "src/features/*" },
        rules: {
          "module-boundaries": {
            rules: [{ imports: "features" }],
          },
        },
      })
    );
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some(e => e.path === "rules.module-boundaries.rules[0]"));
      assert.ok(result.errors.some(e => e.message.includes("importer\" or \"containedTo\" is required")));
    }
  });

  test("returns error when a rule is missing imports", () => {
    const result = writeAndLoad(
      JSON.stringify({
        modules: { features: "src/features/*" },
        rules: {
          "module-boundaries": {
            rules: [{ importer: "features" }],
          },
        },
      })
    );
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some(e => e.path === "rules.module-boundaries.rules[0].imports"));
    }
  });

  test("returns error when allow is not a boolean", () => {
    const result = writeAndLoad(
      JSON.stringify({
        modules: { features: "src/features/*" },
        rules: {
          "module-boundaries": {
            rules: [{ importer: "features", imports: "features", allow: "yes" }],
          },
        },
      })
    );
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some(e => e.path === "rules.module-boundaries.rules[0].allow"));
    }
  });

  test("returns error when message is not a string", () => {
    const result = writeAndLoad(
      JSON.stringify({
        modules: { features: "src/features/*" },
        rules: {
          "module-boundaries": {
            rules: [{ importer: "features", imports: "features", message: 42 }],
          },
        },
      })
    );
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some(e => e.path === "rules.module-boundaries.rules[0].message"));
    }
  });

  test("returns error when a rule is null", () => {
    const result = writeAndLoad(
      JSON.stringify({
        modules: { features: "src/features/*" },
        rules: {
          "module-boundaries": { rules: [null] },
        },
      })
    );
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some(e => e.path === "rules.module-boundaries.rules[0]"));
    }
  });

  test("accepts an empty rules array", () => {
    const result = writeAndLoad(
      JSON.stringify({
        modules: { features: "src/features/*" },
        rules: { "module-boundaries": { rules: [] } },
      })
    );

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.config.rules["module-boundaries"].rules.length, 0);
    }
  });

  test("accepts and validates rule-level severity and name", () => {
    const result = writeAndLoad(
      JSON.stringify({
        modules: { features: "src/features/*" },
        rules: {
          "module-boundaries": {
            rules: [
              {
                importer: "features",
                imports: "features",
                severity: "warn",
                name: "my-rule",
              },
            ],
          },
        },
      })
    );

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      const rule = result.config.rules["module-boundaries"].rules[0];
      assert.strictEqual(rule.severity, "warn");
      assert.strictEqual(rule.name, "my-rule");
    }
  });

  test("returns error for invalid rule-level severity", () => {
    const result = writeAndLoad(
      JSON.stringify({
        modules: { features: "src/features/*" },
        rules: {
          "module-boundaries": {
            rules: [
              {
                importer: "features",
                imports: "features",
                severity: "invalid",
              },
            ],
          },
        },
      })
    );

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some(e => e.path === "rules.module-boundaries.rules[0].severity"));
    }
  });

  test("returns error for non-string rule name", () => {
    const result = writeAndLoad(
      JSON.stringify({
        modules: { features: "src/features/*" },
        rules: {
          "module-boundaries": {
            rules: [
              {
                importer: "features",
                imports: "features",
                name: 123,
              },
            ],
          },
        },
      })
    );

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some(e => e.path === "rules.module-boundaries.rules[0].name"));
    }
  });
});

suite("loadTsConfigAliases", () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pickety-test-"));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("loads aliases from tsconfig.json", () => {
    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["src/*"],
            "@components": ["src/components/index.ts"],
          },
        },
      })
    );

    const aliases = loadTsConfigAliases(tmpDir);
    assert.strictEqual(aliases["@/*"], "src/*");
    assert.strictEqual(aliases["@components"], "src/components/index.ts");
  });

  test("handles baseUrl in aliases", () => {
    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: "./app",
          paths: {
            "@/*": ["src/*"],
          },
        },
      })
    );

    const aliases = loadTsConfigAliases(tmpDir);
    assert.strictEqual(aliases["@/*"], "app/src/*");
  });

  test("strips comments from tsconfig.json", () => {
    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      `{
        "compilerOptions": {
          // Some comment
          "baseUrl": ".",
          /* Multi-line
             comment */
          "paths": {
            "@/*": ["src/*"]
          }
        }
      }`
    );

    const aliases = loadTsConfigAliases(tmpDir);
    assert.strictEqual(aliases["@/*"], "src/*");
  });

  test("returns empty object if no tsconfig found", () => {
    const aliases = loadTsConfigAliases(tmpDir);
    assert.deepStrictEqual(aliases, {});
  });

  test("supports alternative tsconfig names", () => {
    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.app.json"),
      JSON.stringify({
        compilerOptions: {
          paths: { "@/*": ["src/*"] },
        },
      })
    );

    const aliases = loadTsConfigAliases(tmpDir);
    assert.strictEqual(aliases["@/*"], "src/*");
  });
});
