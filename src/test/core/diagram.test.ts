import * as assert from "assert";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { generateMermaidDiagram } from "../../core/diagram";
import type { PicketyConfig } from "../../types";

suite("generateMermaidDiagram", () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pickety-test-"));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const baseConfig: PicketyConfig = {
    modules: {
      features: "src/features/*",
      utils: "src/utils/*",
    },
    rules: {
      "module-boundaries": {
        severity: "error",
        rules: [
          { importer: "features", imports: "utils", allow: true, name: "allow-utils" },
          { importer: "utils", imports: "features", allow: false },
        ],
      },
    },
  };

  test("generates diagram when enabled (boolean true)", () => {
    const config = { ...baseConfig, "boundary-diagrams": true };
    const outputPath = generateMermaidDiagram(config, tmpDir);

    assert.ok(outputPath);
    assert.strictEqual(path.basename(outputPath!), "picket-boundaries.mermaid");
    assert.ok(fs.existsSync(outputPath!));

    const content = fs.readFileSync(outputPath!, "utf-8");
    assert.ok(content.includes("graph LR"));
  });

  test("generates one subgraph per rule", () => {
    const config = { ...baseConfig, "boundary-diagrams": true };
    const outputPath = generateMermaidDiagram(config, tmpDir);
    const content = fs.readFileSync(outputPath!, "utf-8");

    // Rule 0: allow rule with name
    assert.ok(content.includes('subgraph rule_0 ["ALLOW: allow-utils (error)"]'));
    assert.ok(content.includes('r0_from["features"]'));
    assert.ok(content.includes('r0_to["utils"]'));
    assert.ok(content.includes("r0_from -->"));

    // Rule 1: deny rule without name (falls back to index)
    assert.ok(content.includes('subgraph rule_1 ["DENY: rule[1] (error)"]'));
    assert.ok(content.includes('r1_from["utils"]'));
    assert.ok(content.includes('r1_to["features"]'));
    assert.ok(content.includes("r1_from -.->"));
  });

  test("includes module patterns as comments", () => {
    const config = { ...baseConfig, "boundary-diagrams": true };
    const outputPath = generateMermaidDiagram(config, tmpDir);
    const content = fs.readFileSync(outputPath!, "utf-8");

    assert.ok(content.includes("%% features: src/features/*"));
    assert.ok(content.includes("%% utils: src/utils/*"));
  });

  test("uses rule message as edge label", () => {
    const config: PicketyConfig = {
      ...baseConfig,
      "boundary-diagrams": true,
      rules: {
        "module-boundaries": {
          severity: "error",
          rules: [
            {
              importer: "utils",
              imports: "features",
              message: "Utils must remain dependency-free",
            },
          ],
        },
      },
    };
    const outputPath = generateMermaidDiagram(config, tmpDir);
    const content = fs.readFileSync(outputPath!, "utf-8");

    assert.ok(content.includes('|"Utils must remain dependency-free"|'));
  });

  test("colors allow edges green and deny edges red", () => {
    const config = { ...baseConfig, "boundary-diagrams": true };
    const outputPath = generateMermaidDiagram(config, tmpDir);
    const content = fs.readFileSync(outputPath!, "utf-8");

    // Allow rule gets green
    assert.ok(content.includes("linkStyle 0 stroke:#22c55e"));
    // Deny rule gets red with dash array
    assert.ok(content.includes("linkStyle 1 stroke:#ef4444"));
    assert.ok(content.includes("stroke-dasharray:5"));
  });

  test("shows per-rule severity in subgraph title", () => {
    const config: PicketyConfig = {
      ...baseConfig,
      "boundary-diagrams": true,
      rules: {
        "module-boundaries": {
          severity: "error",
          rules: [
            { importer: "features", imports: "utils", severity: "warn", name: "soft-rule" },
          ],
        },
      },
    };
    const outputPath = generateMermaidDiagram(config, tmpDir);
    const content = fs.readFileSync(outputPath!, "utf-8");

    assert.ok(content.includes('["DENY: soft-rule (warn)"]'));
  });

  test("generates diagram to specific path (string)", () => {
    const config = { ...baseConfig, "boundary-diagrams": "docs/my-map.mermaid" };
    const outputPath = generateMermaidDiagram(config, tmpDir);

    assert.ok(outputPath);
    assert.strictEqual(path.basename(outputPath!), "my-map.mermaid");
    assert.ok(outputPath!.includes("docs"));
    assert.ok(fs.existsSync(outputPath!));
  });

  test("handles variables with stadium shape", () => {
    const config: PicketyConfig = {
      ...baseConfig,
      "boundary-diagrams": true,
      rules: {
        "module-boundaries": {
          severity: "error",
          rules: [{ importer: "routes/$name", imports: "features/$name", allow: true }],
        },
      },
    };
    const outputPath = generateMermaidDiagram(config, tmpDir);
    const content = fs.readFileSync(outputPath!, "utf-8");
    assert.ok(content.includes('(["routes/$name"])'));
    assert.ok(content.includes('(["features/$name"])'));
  });

  test("returns undefined when disabled", () => {
    const config = { ...baseConfig, "boundary-diagrams": false };
    const outputPath = generateMermaidDiagram(config, tmpDir);
    assert.strictEqual(outputPath, undefined);
  });
});
