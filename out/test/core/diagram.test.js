"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const diagram_1 = require("../../core/diagram");
suite("generateMermaidDiagram", () => {
    let tmpDir;
    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pickety-test-"));
    });
    teardown(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    const baseConfig = {
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
        const outputPath = (0, diagram_1.generateMermaidDiagram)(config, tmpDir);
        assert.ok(outputPath);
        assert.strictEqual(path.basename(outputPath), "picket-boundaries.mermaid");
        assert.ok(fs.existsSync(outputPath));
        const content = fs.readFileSync(outputPath, "utf-8");
        assert.ok(content.includes("graph LR"));
    });
    test("generates one subgraph per rule", () => {
        const config = { ...baseConfig, "boundary-diagrams": true };
        const outputPath = (0, diagram_1.generateMermaidDiagram)(config, tmpDir);
        const content = fs.readFileSync(outputPath, "utf-8");
        // Rule 0: allow rule with name
        assert.ok(content.includes('subgraph rule_0 ["ALLOW: allow-utils (error)"]'));
        assert.ok(content.includes('r0_from["features"]'));
        assert.ok(content.includes('r0_to["utils"]'));
        assert.ok(content.includes("r0_from -->"));
        // Rule 1: deny rule without name (falls back to index, brackets escaped)
        assert.ok(content.includes('subgraph rule_1 ["DENY: rule#lsqb;1#rsqb; (error)"]'));
        assert.ok(content.includes('r1_from["utils"]'));
        assert.ok(content.includes('r1_to["features"]'));
        assert.ok(content.includes("r1_from -.->"));
    });
    test("includes module patterns as comments", () => {
        const config = { ...baseConfig, "boundary-diagrams": true };
        const outputPath = (0, diagram_1.generateMermaidDiagram)(config, tmpDir);
        const content = fs.readFileSync(outputPath, "utf-8");
        assert.ok(content.includes("%% features: src/features/*"));
        assert.ok(content.includes("%% utils: src/utils/*"));
    });
    test("uses rule message as edge label", () => {
        const config = {
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
        const outputPath = (0, diagram_1.generateMermaidDiagram)(config, tmpDir);
        const content = fs.readFileSync(outputPath, "utf-8");
        assert.ok(content.includes('|"Utils must remain dependency-free"|'));
    });
    test("colors allow edges green and deny edges red", () => {
        const config = { ...baseConfig, "boundary-diagrams": true };
        const outputPath = (0, diagram_1.generateMermaidDiagram)(config, tmpDir);
        const content = fs.readFileSync(outputPath, "utf-8");
        // Allow rule gets green
        assert.ok(content.includes("linkStyle 0 stroke:#22c55e"));
        // Deny rule gets red with dash array
        assert.ok(content.includes("linkStyle 1 stroke:#ef4444"));
        assert.ok(content.includes("stroke-dasharray:5"));
    });
    test("shows per-rule severity in subgraph title", () => {
        const config = {
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
        const outputPath = (0, diagram_1.generateMermaidDiagram)(config, tmpDir);
        const content = fs.readFileSync(outputPath, "utf-8");
        assert.ok(content.includes('["DENY: soft-rule (warn)"]'));
    });
    test("generates diagram to specific path (string)", () => {
        const config = { ...baseConfig, "boundary-diagrams": "docs/my-map.mermaid" };
        const outputPath = (0, diagram_1.generateMermaidDiagram)(config, tmpDir);
        assert.ok(outputPath);
        assert.strictEqual(path.basename(outputPath), "my-map.mermaid");
        assert.ok(outputPath.includes("docs"));
        assert.ok(fs.existsSync(outputPath));
    });
    test("handles variables with stadium shape", () => {
        const config = {
            ...baseConfig,
            "boundary-diagrams": true,
            rules: {
                "module-boundaries": {
                    severity: "error",
                    rules: [{ importer: "routes/$name", imports: "features/$name", allow: true }],
                },
            },
        };
        const outputPath = (0, diagram_1.generateMermaidDiagram)(config, tmpDir);
        const content = fs.readFileSync(outputPath, "utf-8");
        assert.ok(content.includes('(["routes/$name"])'));
        assert.ok(content.includes('(["features/$name"])'));
    });
    test("returns undefined when disabled", () => {
        const config = { ...baseConfig, "boundary-diagrams": false };
        const outputPath = (0, diagram_1.generateMermaidDiagram)(config, tmpDir);
        assert.strictEqual(outputPath, undefined);
    });
    test("blocks path traversal outside workspace root", () => {
        const config = { ...baseConfig, "boundary-diagrams": "../../etc/evil.mermaid" };
        const outputPath = (0, diagram_1.generateMermaidDiagram)(config, tmpDir);
        assert.strictEqual(outputPath, undefined);
    });
    test("escapes Mermaid-sensitive characters in rule names and messages", () => {
        const config = {
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
                            message: 'inject |"break"| here',
                        },
                    ],
                },
            },
        };
        const outputPath = (0, diagram_1.generateMermaidDiagram)(config, tmpDir);
        const content = fs.readFileSync(outputPath, "utf-8");
        // Quotes, brackets, and pipes should be escaped so they can't break out of labels
        assert.ok(content.includes("#quot;"));
        assert.ok(content.includes("#rsqb;"));
        assert.ok(content.includes("#vert;"));
        // The raw injection sequence "] should NOT appear unescaped
        assert.ok(!content.includes('"] ;'));
    });
});
//# sourceMappingURL=diagram.test.js.map