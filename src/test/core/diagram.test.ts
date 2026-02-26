import * as assert from "assert";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { generateMermaidDiagram } from "../../core/diagram";
import type { PicketyConfig } from "../../shared/types";

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

  test("generates a unified graph with clusters", () => {
    const config = { ...baseConfig, "boundary-diagrams": true };
    const outputPath = generateMermaidDiagram(config, tmpDir);
    const content = fs.readFileSync(outputPath!, "utf-8");

    // Should have clusters for the base segments
    assert.ok(content.includes('subgraph c'));
    assert.ok(content.includes('[" Base "]'));

    // Should have nodes for the modules
    assert.ok(content.includes('["features"]'));
    assert.ok(content.includes('["utils"]'));

    // Should have edges between nodes (using safe IDs like n0, n1...)
    assert.ok(content.includes('-->|"ALLOW: allow-utils"|'));
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

  test("blocks path traversal outside workspace root", () => {
    const config = { ...baseConfig, "boundary-diagrams": "../../etc/evil.mermaid" };
    const outputPath = generateMermaidDiagram(config, tmpDir);
    assert.strictEqual(outputPath, undefined);
  });

  test("escapes Mermaid-sensitive characters in rule names and messages", () => {
    const config: PicketyConfig = {
      ...baseConfig,
      "boundary-diagrams": true,
      rules: {
        "module-boundaries": {
          severity: "error",
          rules: [
            {
              importer: "features",
              imports: "utils",
              name: 'evil"] ; click x callback ; subgraph x ["',
            },
          ],
        },
      },
    };
    const outputPath = generateMermaidDiagram(config, tmpDir);
    const content = fs.readFileSync(outputPath!, "utf-8");

    // Quotes, brackets, and pipes should be escaped so they can't break out of labels
    assert.ok(content.includes("#quot;"));
    assert.ok(content.includes("#rsqb;"));
    assert.ok(content.includes("#lsqb;"));
    // The raw injection sequence "] should NOT appear unescaped
    assert.ok(!content.includes('"] ;'));
  });
});
