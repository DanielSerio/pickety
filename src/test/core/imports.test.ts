import * as path from "path";
import { normalizePath } from "../../core/utils";
const ROOT_DIR = normalizePath(path.resolve("/project"));
import * as assert from "assert";
import { extractImports, resolveImport, matchFileToModule } from "../../core/imports";
import type { WorkspaceContext } from "../../shared/types";

suite("extractImports", () => {
  // --- Happy path ---

  test("extracts a default import", () => {
    const imports = extractImports(`import foo from './foo';`);
    assert.strictEqual(imports.length, 1);
    assert.strictEqual(imports[0].specifier, "./foo");
  });

  test("extracts a named import", () => {
    const imports = extractImports(`import { bar } from '../bar';`);
    assert.strictEqual(imports.length, 1);
    assert.strictEqual(imports[0].specifier, "../bar");
  });

  test("extracts a namespace import", () => {
    const imports = extractImports(`import * as utils from './utils';`);
    assert.strictEqual(imports.length, 1);
    assert.strictEqual(imports[0].specifier, "./utils");
  });

  test("extracts a re-export", () => {
    const imports = extractImports(`export { thing } from './thing';`);
    assert.strictEqual(imports.length, 1);
    assert.strictEqual(imports[0].specifier, "./thing");
  });

  test("extracts export * from", () => {
    const imports = extractImports(`export * from './everything';`);
    assert.strictEqual(imports.length, 1);
    assert.strictEqual(imports[0].specifier, "./everything");
  });

  test("extracts a dynamic import", () => {
    const imports = extractImports(`const mod = import('./lazy');`);
    assert.strictEqual(imports.length, 1);
    assert.strictEqual(imports[0].specifier, "./lazy");
  });

  test("extracts multiple imports from one file", () => {
    const content = [
      `import { A } from './a';`,
      `import { B } from './b';`,
      `export { C } from './c';`,
    ].join("\n");

    const imports = extractImports(content);
    assert.strictEqual(imports.length, 3);
    assert.deepStrictEqual(
      imports.map((i) => i.specifier),
      ["./a", "./b", "./c"]
    );
  });

  test("handles double-quoted specifiers", () => {
    const imports = extractImports(`import foo from "./foo";`);
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

    const imports = extractImports(content);
    assert.strictEqual(imports[0].line, 1);
    assert.strictEqual(imports[1].line, 3);
  });

  test("reports correct character offset for indented imports", () => {
    const content = `  import { A } from './a';`;
    const imports = extractImports(content);
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

    const imports = extractImports(content);
    assert.strictEqual(imports.length, 1);
    assert.strictEqual(imports[0].specifier, "./multi");
  });

  // --- Edge cases ---

  test("returns empty array for file with no imports", () => {
    const imports = extractImports(`const x = 1;\nconst y = 2;`);
    assert.strictEqual(imports.length, 0);
  });

  test("returns empty array for empty content", () => {
    const imports = extractImports("");
    assert.strictEqual(imports.length, 0);
  });

  test("extracts an import with backticks", () => {
    const imports = extractImports("import foo from `./foo`;");
    assert.strictEqual(imports.length, 1);
    assert.strictEqual(imports[0].specifier, "./foo");
  });

  test("extracts a side-effect import", () => {
    const imports = extractImports("import './side-effect';");
    assert.strictEqual(imports.length, 1);
    assert.strictEqual(imports[0].specifier, "./side-effect");
  });

  test("does not extract imports from string literals", () => {
    const content = 'const s = "import { also } from \'./also-fake\'";';
    const imports = extractImports(content);
    assert.strictEqual(imports.length, 0);
  });

  test("does not extract imports from single-line comments", () => {
    const content = "// import { fake } from './fake';";
    const imports = extractImports(content);
    assert.strictEqual(imports.length, 0);
  });

  test("does not extract imports from multi-line comments", () => {
    const content = "/*\n import { fake } from './fake'; \n*/";
    const imports = extractImports(content);
    assert.strictEqual(imports.length, 0);
  });

  test("handles escaped quotes in strings correctly", () => {
    const content = 'const s = "a string with \\" quotes and import { x } from \'y\'";';
    const imports = extractImports(content);
    assert.strictEqual(imports.length, 0);
  });

  test("handles import with type keyword", () => {
    const imports = extractImports(`import type { Foo } from './types';`);
    assert.strictEqual(imports.length, 1);
    assert.strictEqual(imports[0].specifier, "./types");
  });

  test("extracts dynamic import with backticks", () => {
    const imports = extractImports("const mod = import(`./lazy`);");
    assert.strictEqual(imports.length, 1);
    assert.strictEqual(imports[0].specifier, "./lazy");
  });
});

suite("resolveImport", () => {
  // Use lowercase drive letter to match normalizePath output on Windows
  const root = ROOT_DIR;
  const fromFile = `${ROOT_DIR}/src/features/auth/service.ts`;

  const knownFiles = new Set([
    `${ROOT_DIR}/src/features/auth/service.ts`,
    `${ROOT_DIR}/src/features/auth/utils.ts`,
    `${ROOT_DIR}/src/features/billing/api.ts`,
    `${ROOT_DIR}/src/components/Button.tsx`,
    `${ROOT_DIR}/src/components/index.ts`,
    `${ROOT_DIR}/src/utils/helpers.ts`,
  ]);

  // Builds a WorkspaceContext from test fixtures
  function makeCtx(ctxAliases: Record<string, string> = {}): WorkspaceContext {
    return { knownFiles, root, aliases: ctxAliases };
  }

  // --- Relative imports ---

  test("resolves a relative sibling import", () => {
    const result = resolveImport("./utils", fromFile, makeCtx());
    assert.strictEqual(result, `${ROOT_DIR}/src/features/auth/utils.ts`);
  });

  test("resolves a relative import going up directories", () => {
    const result = resolveImport("../billing/api", fromFile, makeCtx());
    assert.strictEqual(result, `${ROOT_DIR}/src/features/billing/api.ts`);
  });

  test("resolves a relative import to an index file", () => {
    const result = resolveImport("../../components", fromFile, makeCtx());
    assert.strictEqual(result, `${ROOT_DIR}/src/components/index.ts`);
  });

  // --- Alias resolution ---

  test("resolves a wildcard alias", () => {
    const aliases = { "@/*": "src/*" };
    const result = resolveImport("@/utils/helpers", fromFile, makeCtx(aliases));
    assert.strictEqual(result, `${ROOT_DIR}/src/utils/helpers.ts`);
  });

  test("resolves an exact alias", () => {
    const aliases = { "@components": "src/components" };
    const result = resolveImport("@components", fromFile, makeCtx(aliases));
    assert.strictEqual(result, `${ROOT_DIR}/src/components/index.ts`);
  });

  // --- Edge cases ---

  test("returns undefined for external packages", () => {
    const result = resolveImport("react", fromFile, makeCtx());
    assert.strictEqual(result, undefined);
  });

  test("returns undefined for scoped external packages", () => {
    const result = resolveImport("@tanstack/react-query", fromFile, makeCtx());
    assert.strictEqual(result, undefined);
  });

  test("returns undefined when resolved file is not in knownFiles", () => {
    const result = resolveImport("./nonexistent", fromFile, makeCtx());
    assert.strictEqual(result, undefined);
  });

  test("returns undefined for alias that does not match any known file", () => {
    const aliases = { "@/*": "src/*" };
    const result = resolveImport("@/missing/module", fromFile, makeCtx(aliases));
    assert.strictEqual(result, undefined);
  });

  test("handles empty aliases gracefully", () => {
    const result = resolveImport("./utils", fromFile, makeCtx());
    assert.strictEqual(result, `${ROOT_DIR}/src/features/auth/utils.ts`);
  });
});

suite("matchFileToModule", () => {
  const root = ROOT_DIR;
  const modules = {
    features: "src/features/*",
    components: "src/components/**/*",
    utils: "src/utils/**/*",
  };

  // --- Happy path ---

  test("matches a file to a module with /* expansion", () => {
    const result = matchFileToModule(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      modules,
      root
    );
    assert.strictEqual(result, "features");
  });

  test("matches a deeply nested file to a module with /**/*", () => {
    const result = matchFileToModule(
      `${ROOT_DIR}/src/components/ui/buttons/Primary.tsx`,
      modules,
      root
    );
    assert.strictEqual(result, "components");
  });

  test("matches first module when file could match multiple", () => {
    // Both "features" and a hypothetical overlapping pattern could match;
    // the function returns the first match.
    const overlapping = {
      features: "src/features/*",
      all: "src/**/*",
    };
    const result = matchFileToModule(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      overlapping,
      root
    );
    assert.strictEqual(result, "features");
  });

  // --- Edge cases ---

  test("returns undefined for a file not in any module", () => {
    const result = matchFileToModule(
      `${ROOT_DIR}/src/config/database.ts`,
      modules,
      root
    );
    assert.strictEqual(result, undefined);
  });

  test("returns undefined for a file outside the project root", () => {
    const result = matchFileToModule(
      normalizePath(path.resolve("/other-project/src/features/auth/service.ts")),
      modules,
      root
    );
    assert.strictEqual(result, undefined);
  });

  test("returns undefined with empty modules object", () => {
    const result = matchFileToModule(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      {},
      root
    );
    assert.strictEqual(result, undefined);
  });

  test("handles pattern without expansion (exact glob)", () => {
    const exactModules = { lib: "src/lib/*.ts" };
    const result = matchFileToModule(
      `${ROOT_DIR}/src/lib/math.ts`,
      exactModules,
      root
    );
    assert.strictEqual(result, "lib");
  });
});
