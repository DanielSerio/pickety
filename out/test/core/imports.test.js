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
const imports_1 = require("../../core/imports");
suite("extractImports", () => {
    // --- Happy path ---
    test("extracts a default import", () => {
        const imports = (0, imports_1.extractImports)(`import foo from './foo';`);
        assert.strictEqual(imports.length, 1);
        assert.strictEqual(imports[0].specifier, "./foo");
    });
    test("extracts a named import", () => {
        const imports = (0, imports_1.extractImports)(`import { bar } from '../bar';`);
        assert.strictEqual(imports.length, 1);
        assert.strictEqual(imports[0].specifier, "../bar");
    });
    test("extracts a namespace import", () => {
        const imports = (0, imports_1.extractImports)(`import * as utils from './utils';`);
        assert.strictEqual(imports.length, 1);
        assert.strictEqual(imports[0].specifier, "./utils");
    });
    test("extracts a re-export", () => {
        const imports = (0, imports_1.extractImports)(`export { thing } from './thing';`);
        assert.strictEqual(imports.length, 1);
        assert.strictEqual(imports[0].specifier, "./thing");
    });
    test("extracts export * from", () => {
        const imports = (0, imports_1.extractImports)(`export * from './everything';`);
        assert.strictEqual(imports.length, 1);
        assert.strictEqual(imports[0].specifier, "./everything");
    });
    test("extracts a dynamic import", () => {
        const imports = (0, imports_1.extractImports)(`const mod = import('./lazy');`);
        assert.strictEqual(imports.length, 1);
        assert.strictEqual(imports[0].specifier, "./lazy");
    });
    test("extracts multiple imports from one file", () => {
        const content = [
            `import { A } from './a';`,
            `import { B } from './b';`,
            `export { C } from './c';`,
        ].join("\n");
        const imports = (0, imports_1.extractImports)(content);
        assert.strictEqual(imports.length, 3);
        assert.deepStrictEqual(imports.map((i) => i.specifier), ["./a", "./b", "./c"]);
    });
    test("handles double-quoted specifiers", () => {
        const imports = (0, imports_1.extractImports)(`import foo from "./foo";`);
        assert.strictEqual(imports.length, 1);
        assert.strictEqual(imports[0].specifier, "./foo");
    });
    // --- Position tracking ---
    test("reports correct line numbers (0-indexed)", () => {
        const content = [
            `// comment`,
            `import { A } from './a';`,
            ``,
            `import { B } from './b';`,
        ].join("\n");
        const imports = (0, imports_1.extractImports)(content);
        assert.strictEqual(imports[0].line, 1);
        assert.strictEqual(imports[1].line, 3);
    });
    test("reports correct character offset for indented imports", () => {
        const content = `  import { A } from './a';`;
        const imports = (0, imports_1.extractImports)(content);
        assert.strictEqual(imports[0].character, 2);
    });
    // --- Multi-line imports ---
    test("extracts multi-line import", () => {
        const content = [
            `import {`,
            `  foo,`,
            `  bar,`,
            `} from './multi';`,
        ].join("\n");
        const imports = (0, imports_1.extractImports)(content);
        assert.strictEqual(imports.length, 1);
        assert.strictEqual(imports[0].specifier, "./multi");
    });
    // --- Edge cases ---
    test("returns empty array for file with no imports", () => {
        const imports = (0, imports_1.extractImports)(`const x = 1;\nconst y = 2;`);
        assert.strictEqual(imports.length, 0);
    });
    test("returns empty array for empty content", () => {
        const imports = (0, imports_1.extractImports)("");
        assert.strictEqual(imports.length, 0);
    });
    test("extracts an import with backticks", () => {
        const imports = (0, imports_1.extractImports)("import foo from `./foo`;");
        assert.strictEqual(imports.length, 1);
        assert.strictEqual(imports[0].specifier, "./foo");
    });
    test("extracts a side-effect import", () => {
        const imports = (0, imports_1.extractImports)("import './side-effect';");
        assert.strictEqual(imports.length, 1);
        assert.strictEqual(imports[0].specifier, "./side-effect");
    });
    test("does not extract imports from string literals", () => {
        const content = 'const s = "import { also } from \'./also-fake\'";';
        const imports = (0, imports_1.extractImports)(content);
        assert.strictEqual(imports.length, 0);
    });
    test("does not extract imports from single-line comments", () => {
        const content = "// import { fake } from './fake';";
        const imports = (0, imports_1.extractImports)(content);
        assert.strictEqual(imports.length, 0);
    });
    test("does not extract imports from multi-line comments", () => {
        const content = "/*\n import { fake } from './fake'; \n*/";
        const imports = (0, imports_1.extractImports)(content);
        assert.strictEqual(imports.length, 0);
    });
    test("handles escaped quotes in strings correctly", () => {
        const content = 'const s = "a string with \\" quotes and import { x } from \'y\'";';
        const imports = (0, imports_1.extractImports)(content);
        assert.strictEqual(imports.length, 0);
    });
    test("handles import with type keyword", () => {
        const imports = (0, imports_1.extractImports)(`import type { Foo } from './types';`);
        assert.strictEqual(imports.length, 1);
        assert.strictEqual(imports[0].specifier, "./types");
    });
    test("extracts dynamic import with backticks", () => {
        const imports = (0, imports_1.extractImports)("const mod = import(`./lazy`);");
        assert.strictEqual(imports.length, 1);
        assert.strictEqual(imports[0].specifier, "./lazy");
    });
});
suite("resolveImport", () => {
    // Use lowercase drive letter to match normalizePath output on Windows
    const root = "c:/project";
    const fromFile = "c:/project/src/features/auth/service.ts";
    const knownFiles = new Set([
        "c:/project/src/features/auth/service.ts",
        "c:/project/src/features/auth/utils.ts",
        "c:/project/src/features/billing/api.ts",
        "c:/project/src/components/Button.tsx",
        "c:/project/src/components/index.ts",
        "c:/project/src/utils/helpers.ts",
    ]);
    // Builds a WorkspaceContext from test fixtures
    function makeCtx(ctxAliases = {}) {
        return { knownFiles, root, aliases: ctxAliases };
    }
    // --- Relative imports ---
    test("resolves a relative sibling import", () => {
        const result = (0, imports_1.resolveImport)("./utils", fromFile, makeCtx());
        assert.strictEqual(result, "c:/project/src/features/auth/utils.ts");
    });
    test("resolves a relative import going up directories", () => {
        const result = (0, imports_1.resolveImport)("../billing/api", fromFile, makeCtx());
        assert.strictEqual(result, "c:/project/src/features/billing/api.ts");
    });
    test("resolves a relative import to an index file", () => {
        const result = (0, imports_1.resolveImport)("../../components", fromFile, makeCtx());
        assert.strictEqual(result, "c:/project/src/components/index.ts");
    });
    // --- Alias resolution ---
    test("resolves a wildcard alias", () => {
        const aliases = { "@/*": "src/*" };
        const result = (0, imports_1.resolveImport)("@/utils/helpers", fromFile, makeCtx(aliases));
        assert.strictEqual(result, "c:/project/src/utils/helpers.ts");
    });
    test("resolves an exact alias", () => {
        const aliases = { "@components": "src/components" };
        const result = (0, imports_1.resolveImport)("@components", fromFile, makeCtx(aliases));
        assert.strictEqual(result, "c:/project/src/components/index.ts");
    });
    // --- Edge cases ---
    test("returns undefined for external packages", () => {
        const result = (0, imports_1.resolveImport)("react", fromFile, makeCtx());
        assert.strictEqual(result, undefined);
    });
    test("returns undefined for scoped external packages", () => {
        const result = (0, imports_1.resolveImport)("@tanstack/react-query", fromFile, makeCtx());
        assert.strictEqual(result, undefined);
    });
    test("returns undefined when resolved file is not in knownFiles", () => {
        const result = (0, imports_1.resolveImport)("./nonexistent", fromFile, makeCtx());
        assert.strictEqual(result, undefined);
    });
    test("returns undefined for alias that does not match any known file", () => {
        const aliases = { "@/*": "src/*" };
        const result = (0, imports_1.resolveImport)("@/missing/module", fromFile, makeCtx(aliases));
        assert.strictEqual(result, undefined);
    });
    test("handles empty aliases gracefully", () => {
        const result = (0, imports_1.resolveImport)("./utils", fromFile, makeCtx());
        assert.strictEqual(result, "c:/project/src/features/auth/utils.ts");
    });
});
suite("matchFileToModule", () => {
    const root = "c:/project";
    const modules = {
        features: "src/features/*",
        components: "src/components/**/*",
        utils: "src/utils/**/*",
    };
    // --- Happy path ---
    test("matches a file to a module with /* expansion", () => {
        const result = (0, imports_1.matchFileToModule)("c:/project/src/features/auth/service.ts", modules, root);
        assert.strictEqual(result, "features");
    });
    test("matches a deeply nested file to a module with /**/*", () => {
        const result = (0, imports_1.matchFileToModule)("c:/project/src/components/ui/buttons/Primary.tsx", modules, root);
        assert.strictEqual(result, "components");
    });
    test("matches first module when file could match multiple", () => {
        // Both "features" and a hypothetical overlapping pattern could match;
        // the function returns the first match.
        const overlapping = {
            features: "src/features/*",
            all: "src/**/*",
        };
        const result = (0, imports_1.matchFileToModule)("c:/project/src/features/auth/service.ts", overlapping, root);
        assert.strictEqual(result, "features");
    });
    // --- Edge cases ---
    test("returns undefined for a file not in any module", () => {
        const result = (0, imports_1.matchFileToModule)("c:/project/src/config/database.ts", modules, root);
        assert.strictEqual(result, undefined);
    });
    test("returns undefined for a file outside the project root", () => {
        const result = (0, imports_1.matchFileToModule)("C:/other-project/src/features/auth/service.ts", modules, root);
        assert.strictEqual(result, undefined);
    });
    test("returns undefined with empty modules object", () => {
        const result = (0, imports_1.matchFileToModule)("c:/project/src/features/auth/service.ts", {}, root);
        assert.strictEqual(result, undefined);
    });
    test("handles pattern without expansion (exact glob)", () => {
        const exactModules = { lib: "src/lib/*.ts" };
        const result = (0, imports_1.matchFileToModule)("c:/project/src/lib/math.ts", exactModules, root);
        assert.strictEqual(result, "lib");
    });
});
//# sourceMappingURL=imports.test.js.map