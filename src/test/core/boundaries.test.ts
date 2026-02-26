import * as path from "path";
import { normalizePath } from "../../core/utils";
const ROOT_DIR = normalizePath(path.resolve("/project"));
import * as assert from "assert";
import { checkBoundaries } from "../../core/boundaries";
import { applyMaxViolations } from "../../core/violations";
import type { PicketyConfig, Violation, WorkspaceContext } from "../../shared/types";

// Helper to build a minimal config
function makeConfig(
  rules: PicketyConfig["rules"]["module-boundaries"]["rules"],
  modules: Record<string, string> = {
    features: "src/features/*",
    components: "src/components/**/*",
    routes: "src/routes/*",
    utils: "src/utils/**/*",
  },
  severity: "error" | "warn" = "error"
): PicketyConfig {
  return {
    modules,
    rules: { "module-boundaries": { severity, rules } },
  };
}

// Standard set of known files for most tests
// Use lowercase drive letter to match normalizePath output on Windows
const knownFiles = new Set([
  `${ROOT_DIR}/src/features/auth/service.ts`,
  `${ROOT_DIR}/src/features/auth/components/LoginForm.tsx`,
  `${ROOT_DIR}/src/features/auth/pages/LoginPage.tsx`,
  `${ROOT_DIR}/src/features/auth/hooks/useAuth.ts`,
  `${ROOT_DIR}/src/features/auth/schemas/loginSchema.ts`,
  `${ROOT_DIR}/src/features/billing/api.ts`,
  `${ROOT_DIR}/src/features/billing/pages/BillingPage.tsx`,
  `${ROOT_DIR}/src/features/billing/components/Invoice.tsx`,
  `${ROOT_DIR}/src/components/Button.tsx`,
  `${ROOT_DIR}/src/routes/auth/index.ts`,
  `${ROOT_DIR}/src/routes/billing/index.ts`,
  `${ROOT_DIR}/src/utils/helpers.ts`,
]);

const root = ROOT_DIR;

// Builds a WorkspaceContext from test fixtures
function makeCtx(
  files: Set<string> = knownFiles,
  ctxAliases: Record<string, string> = {}
): WorkspaceContext {
  return { knownFiles: files, root, aliases: ctxAliases };
}

suite("boundaries — simple deny rules", () => {
  test("detects a violation when feature imports another feature", () => {
    const config = makeConfig([
      { importer: "features", imports: "features" },
    ]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `import { api } from '../billing/api';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 1);
    assert.ok(violations[0].message.includes("../billing/api"));
  });

  test("no violation when importing from a different module", () => {
    const config = makeConfig([
      { importer: "features", imports: "features" },
    ]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `import { Button } from '../../components/Button';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 0);
  });

  test("wildcard importer matches any module", () => {
    const config = makeConfig([
      { importer: "*", imports: "utils" },
    ]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `import { helpers } from '../../utils/helpers';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 1);
  });

  test("allow: true prevents violation", () => {
    const config = makeConfig([
      { importer: "features", imports: "components", allow: true },
    ]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `import { Button } from '../../components/Button';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 0);
  });

  test("uses custom message when provided", () => {
    const config = makeConfig([
      {
        importer: "features",
        imports: "features",
        message: "No cross-feature imports!",
      },
    ]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `import { api } from '../billing/api';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 1);
    assert.ok(violations[0].message.includes("No cross-feature imports!"));
  });

  test("uses warn severity when configured", () => {
    const config = makeConfig(
      [{ importer: "features", imports: "features" }],
      undefined,
      "warn"
    );

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `import { api } from '../billing/api';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations[0].severity, "warn");
  });
});

suite("boundaries — file path glob patterns", () => {
  test("denies import matching a file path glob in imports", () => {
    const config = makeConfig([
      { importer: "routes", imports: "features/**/components" },
    ]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/routes/auth/index.ts`,
      `import { LoginForm } from '../../features/auth/components/LoginForm';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 1);
  });

  test("no violation when import does not match the path glob", () => {
    const config = makeConfig([
      { importer: "routes", imports: "features/**/components" },
    ]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/routes/auth/index.ts`,
      `import { LoginPage } from '../../features/auth/pages/LoginPage';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 0);
  });

  test("multiple path glob rules can all trigger", () => {
    const config = makeConfig([
      { importer: "routes", imports: "features/**/components" },
      { importer: "routes", imports: "features/**/schemas" },
    ]);

    const content = [
      `import { LoginForm } from '../../features/auth/components/LoginForm';`,
      `import { loginSchema } from '../../features/auth/schemas/loginSchema';`,
    ].join("\n");

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/routes/auth/index.ts`,
      content,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 2);
  });
});

suite("boundaries — interpolation variables", () => {
  // --- allow: true (enforce matching) ---

  test("no violation when interpolation variable matches (allow: true)", () => {
    const config = makeConfig([
      {
        importer: "routes/$name",
        imports: "features/$name/pages",
        allow: true,
      },
    ]);

    // routes/auth importing features/auth/pages — same $name
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/routes/auth/index.ts`,
      `import { LoginPage } from '../../features/auth/pages/LoginPage';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 0);
  });

  test("violation when interpolation variable does not match (allow: true)", () => {
    const config = makeConfig([
      {
        importer: "routes/$name",
        imports: "features/$name/pages",
        allow: true,
      },
    ]);

    // routes/auth importing features/billing/pages — different $name
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/routes/auth/index.ts`,
      `import { BillingPage } from '../../features/billing/pages/BillingPage';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 1);
    assert.ok(violations[0].message.includes("../../features/billing/pages/BillingPage"));
  });

  test("no violation when import does not match general pattern at all (allow: true)", () => {
    const config = makeConfig([
      {
        importer: "routes/$name",
        imports: "features/$name/pages",
        allow: true,
      },
    ]);

    // routes/auth importing components — not in the general pattern at all
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/routes/auth/index.ts`,
      `import { Button } from '../../components/Button';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 0);
  });

  // --- allow: false (deny matching) ---

  test("violation when interpolated deny pattern matches (allow: false)", () => {
    const config = makeConfig([
      {
        importer: "routes/$name",
        imports: "features/$name/hooks",
      },
    ]);

    // routes/auth importing features/auth/hooks — matches interpolated deny
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/routes/auth/index.ts`,
      `import { useAuth } from '../../features/auth/hooks/useAuth';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 1);
  });

  test("no violation when interpolated deny pattern does not match (allow: false)", () => {
    const config = makeConfig([
      {
        importer: "routes/$name",
        imports: "features/$name/hooks",
      },
    ]);

    // routes/auth importing features/billing/hooks — different $name, no match
    // (This test verifies that deny only applies to the captured $name)
    // We don't have features/billing/hooks in knownFiles, so import won't resolve
    // Instead, test with a non-hooks import
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/routes/auth/index.ts`,
      `import { LoginPage } from '../../features/auth/pages/LoginPage';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 0);
  });

  // --- Multiple variables ---

  test("two variables both matching — no violation (allow: true)", () => {
    const multiVarKnownFiles = new Set([
      `${ROOT_DIR}/src/apps/web/routes/auth/index.ts`,
      `${ROOT_DIR}/src/apps/web/pages/auth/LoginPage.tsx`,
      `${ROOT_DIR}/src/apps/web/pages/billing/BillingPage.tsx`,
      `${ROOT_DIR}/src/apps/mobile/pages/auth/LoginPage.tsx`,
    ]);
    const config = makeConfig(
      [
        {
          importer: "apps/$app/routes/$route",
          imports: "apps/$app/pages/$route",
          allow: true,
        },
      ],
      { apps: "src/apps/*" }
    );

    // apps/web/routes/auth importing apps/web/pages/auth — both match
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/apps/web/routes/auth/index.ts`,
      `import { LoginPage } from '../../pages/auth/LoginPage';`,
      config,
      makeCtx(multiVarKnownFiles)
    );

    assert.strictEqual(violations.length, 0);
  });

  test("two variables, second mismatches — violation (allow: true)", () => {
    const multiVarKnownFiles = new Set([
      `${ROOT_DIR}/src/apps/web/routes/auth/index.ts`,
      `${ROOT_DIR}/src/apps/web/pages/billing/BillingPage.tsx`,
    ]);
    const config = makeConfig(
      [
        {
          importer: "apps/$app/routes/$route",
          imports: "apps/$app/pages/$route",
          allow: true,
        },
      ],
      { apps: "src/apps/*" }
    );

    // apps/web/routes/auth importing apps/web/pages/billing — $app matches but $route doesn't
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/apps/web/routes/auth/index.ts`,
      `import { BillingPage } from '../../pages/billing/BillingPage';`,
      config,
      makeCtx(multiVarKnownFiles)
    );

    assert.strictEqual(violations.length, 1);
  });

  test("two variables, first mismatches — violation (allow: true)", () => {
    const multiVarKnownFiles = new Set([
      `${ROOT_DIR}/src/apps/web/routes/auth/index.ts`,
      `${ROOT_DIR}/src/apps/mobile/pages/auth/LoginPage.tsx`,
    ]);
    const config = makeConfig(
      [
        {
          importer: "apps/$app/routes/$route",
          imports: "apps/$app/pages/$route",
          allow: true,
        },
      ],
      { apps: "src/apps/*" }
    );

    // apps/web/routes/auth importing apps/mobile/pages/auth — $route matches but $app doesn't
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/apps/web/routes/auth/index.ts`,
      `import { LoginPage } from '../../../mobile/pages/auth/LoginPage';`,
      config,
      makeCtx(multiVarKnownFiles)
    );

    assert.strictEqual(violations.length, 1);
  });

  test("two variables deny rule — matching values denied (allow: false)", () => {
    const multiVarKnownFiles = new Set([
      `${ROOT_DIR}/src/apps/web/routes/auth/index.ts`,
      `${ROOT_DIR}/src/apps/web/internal/auth/secrets.ts`,
    ]);
    const config = makeConfig(
      [
        {
          importer: "apps/$app/routes/$route",
          imports: "apps/$app/internal/$route",
        },
      ],
      { apps: "src/apps/*" }
    );

    // apps/web/routes/auth importing apps/web/internal/auth — both vars match, denied
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/apps/web/routes/auth/index.ts`,
      `import { secrets } from '../../internal/auth/secrets';`,
      config,
      makeCtx(multiVarKnownFiles)
    );

    assert.strictEqual(violations.length, 1);
  });

  // --- Edge cases ---

  test("interpolation rule does not apply to files outside the importer pattern", () => {
    const config = makeConfig([
      {
        importer: "routes/$name",
        imports: "features/$name/pages",
        allow: true,
      },
    ]);

    // A features file importing features pages — not a routes/ file, rule should not apply
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `import { BillingPage } from '../billing/pages/BillingPage';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 0);
  });

  test("interpolation with custom message", () => {
    const config = makeConfig([
      {
        importer: "routes/$name",
        imports: "features/$name/pages",
        allow: true,
        message: "Routes must use their own feature pages",
      },
    ]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/routes/auth/index.ts`,
      `import { BillingPage } from '../../features/billing/pages/BillingPage';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 1);
    assert.ok(violations[0].message.includes("Routes must use their own feature pages"));
  });

  test("combined regular and interpolation rules", () => {
    const config = makeConfig([
      // Deny all routes from importing feature components
      { importer: "routes", imports: "features/**/components" },
      // Enforce routes import their own feature pages
      {
        importer: "routes/$name",
        imports: "features/$name/pages",
        allow: true,
      },
    ]);

    const content = [
      // Violation 1: importing components (denied by regular rule)
      `import { LoginForm } from '../../features/auth/components/LoginForm';`,
      // Violation 2: importing wrong feature's pages (denied by interpolation rule)
      `import { BillingPage } from '../../features/billing/pages/BillingPage';`,
    ].join("\n");

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/routes/auth/index.ts`,
      content,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 2);
  });

  // Item 1: ** in the importer pattern (non-isOnly path) — same maxStart bug existed here
  // captureVariablesFromPath is called on effectiveImporter against sourceRelativePath

  test("importer with ** and variables: violation when source matches (deny rule)", () => {
    const config = makeConfig([
      // Any file inside a feature subtree cannot import utils
      { importer: "features/$name/**/*", imports: "utils" },
    ]);

    // features/auth/service.ts matches "features/$name/**/*" → $name=auth captured → deny applies
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `import { helpers } from '../../utils/helpers';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 1);
  });

  test("importer with ** and variables: no violation when source does not match importer pattern", () => {
    const config = makeConfig([
      { importer: "features/$name/**/*", imports: "utils" },
    ]);

    // components/Button.tsx does not match "features/$name/**/*" → rule is skipped
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/components/Button.tsx`,
      `import { helpers } from '../utils/helpers';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 0);
  });
});

suite("boundaries — edge cases", () => {
  test("no violations for a file not in any module", () => {
    const config = makeConfig([
      { importer: "features", imports: "features" },
    ]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/config/database.ts`,
      `import { api } from '../features/billing/api';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 0);
  });

  test("no violations when import resolves to unknown file", () => {
    const config = makeConfig([
      { importer: "features", imports: "features" },
    ]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `import { missing } from '../billing/nonexistent';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 0);
  });

  test("no violations for external package imports", () => {
    const config = makeConfig([
      { importer: "*", imports: "*" },
    ]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `import React from 'react';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 0);
  });

  test("no violations for empty file content", () => {
    const config = makeConfig([
      { importer: "features", imports: "features" },
    ]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      "",
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 0);
  });

  test("reports correct position for violation on second line", () => {
    const config = makeConfig([
      { importer: "features", imports: "features" },
    ]);

    const content = [
      `import React from 'react';`,
      `import { api } from '../billing/api';`,
    ].join("\n");

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      content,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 1);
    assert.strictEqual(violations[0].line, 1); // 0-indexed, second line
  });

  test("multiple violations from the same file", () => {
    const config = makeConfig([
      { importer: "features", imports: "features" },
    ]);

    // Auth importing two different features
    const filesWithBilling = new Set([
      ...knownFiles,
      `${ROOT_DIR}/src/features/billing/utils.ts`,
    ]);

    const content = [
      `import { api } from '../billing/api';`,
      `import { utils } from '../billing/utils';`,
    ].join("\n");

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      content,
      config,
      makeCtx(filesWithBilling)
    );

    assert.strictEqual(violations.length, 2);
  });

  test("same-module import to self is still caught by deny rule", () => {
    // A rule that denies features from importing features
    // should also catch imports within the same feature (both are "features" module)
    const config = makeConfig([
      { importer: "features", imports: "features" },
    ]);

    const authKnownFiles = new Set([
      ...knownFiles,
      `${ROOT_DIR}/src/features/auth/other.ts`,
    ]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `import { other } from './other';`,
      config,
      makeCtx(authKnownFiles)
    );

    // Both files are in "features" module, so this matches the deny rule
    assert.strictEqual(violations.length, 1);
  });
});

suite("boundaries — aliases", () => {
  const aliases = { "@/*": "src/*" };

  test("resolves aliased import and detects violation", () => {
    const config = makeConfig([{ importer: "features", imports: "features" }]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `import { api } from '@/features/billing/api';`,
      config,
      makeCtx(knownFiles, aliases)
    );

    assert.strictEqual(violations.length, 1);
    assert.ok(violations[0].message.includes("@/features/billing/api"));
  });

  test("no violation when aliased import resolves to allowed module", () => {
    const config = makeConfig([{ importer: "features", imports: "features" }]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `import { Button } from '@/components/Button';`,
      config,
      makeCtx(knownFiles, aliases)
    );

    assert.strictEqual(violations.length, 0);
  });
});

suite("boundaries — rule identification and severity", () => {
  test("uses per-rule severity override", () => {
    const config = makeConfig([
      { importer: "features", imports: "features", severity: "warn" },
    ]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `import { api } from '../billing/api';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations[0].severity, "warn");
  });

  test("includes custom rule name in violation message", () => {
    const config = makeConfig([
      {
        importer: "features",
        imports: "features",
        name: "no-cross-feature",
      },
    ]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `import { api } from '../billing/api';`,
      config,
      makeCtx()
    );

    assert.ok(violations[0].message.startsWith("[no-cross-feature]"));
    assert.strictEqual(violations[0].ruleName, "no-cross-feature");
  });

  test("falls back to rule index if name is missing", () => {
    const config = makeConfig([
      { importer: "features", imports: "components", allow: true },
      { importer: "features", imports: "features" },
    ]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `import { api } from '../billing/api';`,
      config,
      makeCtx()
    );

    // Second rule (index 1) was violated
    assert.ok(violations[0].message.startsWith("[rule[1]]"));
    assert.strictEqual(violations[0].ruleName, "rule[1]");
  });
});

suite("boundaries — maxViolations threshold", () => {
  // Helper to create a violation with a specific rule name
  function makeViolation(ruleName: string, severity: "error" | "warn" = "error"): Violation {
    return {
      file: `${ROOT_DIR}/src/features/auth/service.ts`,
      line: 0,
      character: 0,
      length: 10,
      message: `[${ruleName}] test violation`,
      severity,
      ruleName,
    };
  }

  test("violations within threshold are downgraded to warn", () => {
    const config = makeConfig([
      { importer: "features", imports: "features", name: "no-cross", maxViolations: 3 },
    ]);

    const violations = [
      makeViolation("no-cross"),
      makeViolation("no-cross"),
    ];

    const result = applyMaxViolations(violations, config);

    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].severity, "warn");
    assert.strictEqual(result[1].severity, "warn");
  });

  test("violations exceeding threshold are escalated to error", () => {
    const config = makeConfig([
      { importer: "features", imports: "features", name: "no-cross", maxViolations: 1 },
    ]);

    const violations = [
      makeViolation("no-cross"),
      makeViolation("no-cross"),
    ];

    const result = applyMaxViolations(violations, config);

    assert.strictEqual(result[0].severity, "error");
    assert.strictEqual(result[1].severity, "error");
  });

  test("violations at exactly the threshold are downgraded to warn", () => {
    const config = makeConfig([
      { importer: "features", imports: "features", name: "no-cross", maxViolations: 2 },
    ]);

    const violations = [
      makeViolation("no-cross"),
      makeViolation("no-cross"),
    ];

    const result = applyMaxViolations(violations, config);

    assert.strictEqual(result[0].severity, "warn");
    assert.strictEqual(result[1].severity, "warn");
  });

  test("rules without maxViolations are not affected", () => {
    const config = makeConfig([
      { importer: "features", imports: "features", name: "no-cross" },
    ]);

    const violations = [makeViolation("no-cross")];

    const result = applyMaxViolations(violations, config);

    assert.strictEqual(result[0].severity, "error");
  });

  test("maxViolations only affects its own rule", () => {
    const config = makeConfig([
      { importer: "features", imports: "features", name: "no-cross", maxViolations: 5 },
      { importer: "features", imports: "utils", name: "no-utils" },
    ]);

    const violations = [
      makeViolation("no-cross"),
      makeViolation("no-utils"),
    ];

    const result = applyMaxViolations(violations, config);

    // no-cross: 1 violation <= 5 threshold → warn
    assert.strictEqual(result[0].severity, "warn");
    // no-utils: no maxViolations set → stays as error
    assert.strictEqual(result[1].severity, "error");
  });

  test("maxViolations of 0 escalates any violation to error", () => {
    const config = makeConfig([
      { importer: "features", imports: "features", name: "no-cross", maxViolations: 0 },
    ]);

    const violations = [makeViolation("no-cross", "warn")];

    const result = applyMaxViolations(violations, config);

    assert.strictEqual(result[0].severity, "error");
  });

  test("unnamed rules with maxViolations use index-based name", () => {
    const config = makeConfig([
      { importer: "features", imports: "features", maxViolations: 5 },
    ]);

    const violations = [makeViolation("rule[0]")];

    const result = applyMaxViolations(violations, config);

    // 1 violation <= 5 threshold → warn
    assert.strictEqual(result[0].severity, "warn");
  });
});

suite("boundaries — only and containedTo rules", () => {
  test("only rule: violation when non-matching module imports the target", () => {
    const config = makeConfig([
      { importer: "services", imports: "repositories", only: true },
    ]);

    // Custom modules for this test
    config.modules = {
      services: "src/services/*",
      repositories: "src/repositories/*",
      controllers: "src/controllers/*"
    };

    const customKnownFiles = new Set([
      `${ROOT_DIR}/src/services/UserService.ts`,
      `${ROOT_DIR}/src/repositories/UserRepository.ts`,
      `${ROOT_DIR}/src/controllers/UserController.ts`
    ]);

    // Controller importing Repository — should be a violation
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/controllers/UserController.ts`,
      `import { repo } from '../repositories/UserRepository';`,
      config,
      makeCtx(customKnownFiles)
    );

    assert.strictEqual(violations.length, 1);
    assert.ok(violations[0].message.includes("can only be imported by \"services\""));
  });

  test("only rule: no violation when matching module imports the target", () => {
    const config = makeConfig([
      { importer: "services", imports: "repositories", only: true },
    ]);
    config.modules = {
      services: "src/services/*",
      repositories: "src/repositories/*"
    };

    const customKnownFiles = new Set([
      `${ROOT_DIR}/src/services/UserService.ts`,
      `${ROOT_DIR}/src/repositories/UserRepository.ts`
    ]);

    // Service importing Repository — should be allowed
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/services/UserService.ts`,
      `import { repo } from '../repositories/UserRepository';`,
      config,
      makeCtx(customKnownFiles)
    );

    assert.strictEqual(violations.length, 0);
  });

  test("containedTo rule: violation when importer is outside the allowed path", () => {
    const config = makeConfig([
      { imports: "src/features/auth/internal/*", containedTo: "src/features/auth/**/*" },
    ]);

    const customKnownFiles = new Set([
      `${ROOT_DIR}/src/features/auth/internal/helper.ts`,
      `${ROOT_DIR}/src/features/billing/service.ts`
    ]);

    // Billing importing Auth-internal — should be a violation
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/billing/service.ts`,
      `import { helper } from '../auth/internal/helper';`,
      config,
      makeCtx(customKnownFiles)
    );

    assert.strictEqual(violations.length, 1);
    assert.ok(violations[0].message.includes("is contained to \"src/features/auth/**/*\""));
  });

  test("containedTo rule with interpolation: violation when scope mismatches", () => {
    const config = makeConfig([
      { imports: "src/features/$name/internal/*", containedTo: "src/features/$name/**/*" },
    ]);

    const customKnownFiles = new Set([
      `${ROOT_DIR}/src/features/auth/internal/helper.ts`,
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `${ROOT_DIR}/src/features/billing/service.ts`
    ]);

    // Billing importing Auth-internal — $name=auth, so importer must be features/auth/**/*
    // Billing is features/billing/**/*, so it should fail.
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/billing/service.ts`,
      `import { helper } from '../auth/internal/helper';`,
      config,
      makeCtx(customKnownFiles)
    );

    assert.strictEqual(violations.length, 1);
    assert.ok(violations[0].message.includes("contained to \"src/features/auth/**/*\""));
  });

  test("containedTo rule with interpolation and ** in imports: violation when cross-feature", () => {
    // Reproduces: imports: "features/$name/components/**/*", containedTo: "features/$name/**/*"
    // The ** in the imports pattern was causing captureVariablesFromPath to compute
    // maxStart = 0 (pathLen - patternLen), skipping the rule entirely.
    const config = makeConfig([
      {
        imports: "features/$name/components/**/*",
        containedTo: "features/$name/**/*",
        message: "Features components must be imported by their own feature.",
      },
    ]);

    // billing importing auth's component — should be a violation
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/billing/service.ts`,
      `import { LoginForm } from '../auth/components/LoginForm';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 1);
    assert.ok(violations[0].message.includes("Features components must be imported by their own feature."));
  });

  test("containedTo rule with interpolation and ** in imports: no violation when same feature", () => {
    const config = makeConfig([
      {
        imports: "features/$name/components/**/*",
        containedTo: "features/$name/**/*",
      },
    ]);

    // auth importing its own component — should be allowed
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/pages/LoginPage.tsx`,
      `import { LoginForm } from '../components/LoginForm';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 0);
  });

  test("containedTo rule with interpolation: no violation when scope matches", () => {
    const config = makeConfig([
      { imports: "src/features/$name/internal/*", containedTo: "src/features/$name/**/*" },
    ]);

    const customKnownFiles = new Set([
      `${ROOT_DIR}/src/features/auth/internal/helper.ts`,
      `${ROOT_DIR}/src/features/auth/service.ts`
    ]);

    // Auth importing Auth-internal — $name=auth matches both
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `import { helper } from './internal/helper';`,
      config,
      makeCtx(customKnownFiles)
    );

    assert.strictEqual(violations.length, 0);
  });

  // Gap 2: ** matching multiple real path segments

  test("containedTo rule: ** in imports matches multiple nested segments (violation)", () => {
    const config = makeConfig([
      { imports: "features/$name/components/**/*", containedTo: "features/$name/**/*" },
    ]);

    const deepFiles = new Set([
      ...knownFiles,
      `${ROOT_DIR}/src/features/auth/components/ui/atoms/Button.tsx`,
    ]);

    // billing importing a deeply-nested auth component — ** spans two segments
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/billing/service.ts`,
      `import { Button } from '../auth/components/ui/atoms/Button';`,
      config,
      makeCtx(deepFiles)
    );

    assert.strictEqual(violations.length, 1);
  });

  test("containedTo rule: ** in imports matches multiple nested segments (no violation, same feature)", () => {
    const config = makeConfig([
      { imports: "features/$name/components/**/*", containedTo: "features/$name/**/*" },
    ]);

    const deepFiles = new Set([
      ...knownFiles,
      `${ROOT_DIR}/src/features/auth/components/ui/atoms/Button.tsx`,
    ]);

    // auth importing its own deeply-nested component — same $name, no violation
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `import { Button } from './components/ui/atoms/Button';`,
      config,
      makeCtx(deepFiles)
    );

    assert.strictEqual(violations.length, 0);
  });

  // Gap 3: only: true with interpolation variables

  test("only rule with variables: violation when non-owning module imports", () => {
    const config = makeConfig([
      { importer: "services/$name", imports: "repositories/$name", only: true },
    ]);
    config.modules = {
      services: "src/services/*",
      repositories: "src/repositories/*",
    };

    const customKnownFiles = new Set([
      `${ROOT_DIR}/src/services/auth/UserService.ts`,
      `${ROOT_DIR}/src/services/billing/BillingService.ts`,
      `${ROOT_DIR}/src/repositories/auth/UserRepository.ts`,
    ]);

    // billing service importing auth repository — $name mismatch → violation
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/services/billing/BillingService.ts`,
      `import { repo } from '../../repositories/auth/UserRepository';`,
      config,
      makeCtx(customKnownFiles)
    );

    assert.strictEqual(violations.length, 1);
  });

  test("only rule with variables: no violation when owning module imports", () => {
    const config = makeConfig([
      { importer: "services/$name", imports: "repositories/$name", only: true },
    ]);
    config.modules = {
      services: "src/services/*",
      repositories: "src/repositories/*",
    };

    const customKnownFiles = new Set([
      `${ROOT_DIR}/src/services/auth/UserService.ts`,
      `${ROOT_DIR}/src/repositories/auth/UserRepository.ts`,
    ]);

    // auth service importing auth repository — same $name → no violation
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/services/auth/UserService.ts`,
      `import { repo } from '../../repositories/auth/UserRepository';`,
      config,
      makeCtx(customKnownFiles)
    );

    assert.strictEqual(violations.length, 0);
  });

  // Gap 4: target doesn't match imports pattern — rule must not fire (no false positives)

  test("containedTo rule with interpolation: no action when target does not match imports pattern", () => {
    const config = makeConfig([
      { imports: "features/$name/components/**/*", containedTo: "features/$name/**/*" },
    ]);

    // utils is outside the features/*/components/** pattern — rule must not apply
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/billing/service.ts`,
      `import { helpers } from '../../utils/helpers';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 0);
  });

  // Item 2: allow: true is silently ignored when containedTo is set.
  // containedTo forces isOnly=true, which never reads the allow field.
  // A user writing { containedTo: "X", allow: true } gets the same behaviour
  // as { containedTo: "X" } — the restriction is always enforced.

  test("allow: true has no effect when containedTo is set — restriction is still enforced", () => {
    const config = makeConfig([
      {
        imports: "features/$name/components/**/*",
        containedTo: "features/$name/**/*",
        allow: true, // ignored — containedTo overrides allow semantics
      },
    ]);

    // billing importing auth's component — still a violation despite allow: true
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/billing/service.ts`,
      `import { LoginForm } from '../auth/components/LoginForm';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 1);
  });

  // containedTo object form (with unless)

  test("containedTo object form: behaves identically to string form when no unless", () => {
    const config = makeConfig([
      {
        imports: "features/$name/components/**/*",
        containedTo: { path: "features/$name/**/*" },
        message: "Features components must be imported by their own feature.",
      },
    ]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/billing/service.ts`,
      `import { LoginForm } from '../auth/components/LoginForm';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 1);
    assert.ok(violations[0].message.includes("Features components must be imported by their own feature."));
  });

  test("containedTo object form: no violation when same feature", () => {
    const config = makeConfig([
      {
        imports: "features/$name/components/**/*",
        containedTo: { path: "features/$name/**/*" },
      },
    ]);

    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/auth/service.ts`,
      `import { LoginForm } from './components/LoginForm';`,
      config,
      makeCtx()
    );

    assert.strictEqual(violations.length, 0);
  });

  test("containedTo with unless: no violation when captured variable matches exempt value", () => {
    const sharedFiles = new Set([
      ...knownFiles,
      `${ROOT_DIR}/src/features/shared/components/Button.tsx`,
    ]);
    const config = makeConfig(
      [
        {
          imports: "features/$name/components/**/*",
          containedTo: {
            path: "features/$name/**/*",
            unless: { $name: "shared" },
          },
          message: "Features components must be imported by their own feature.",
        },
      ],
      {
        features: "src/features/*",
        components: "src/components/**/*",
        routes: "src/routes/*",
        utils: "src/utils/**/*",
      }
    );

    // billing imports from shared/components — must be allowed (exempted by unless)
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/billing/service.ts`,
      `import { Button } from '../shared/components/Button';`,
      config,
      makeCtx(sharedFiles)
    );

    assert.strictEqual(violations.length, 0);
  });

  test("containedTo with unless: violation still fires for non-exempt features", () => {
    const sharedFiles = new Set([
      ...knownFiles,
      `${ROOT_DIR}/src/features/shared/components/Button.tsx`,
    ]);
    const config = makeConfig(
      [
        {
          imports: "features/$name/components/**/*",
          containedTo: {
            path: "features/$name/**/*",
            unless: { $name: "shared" },
          },
          message: "Features components must be imported by their own feature.",
        },
      ],
      {
        features: "src/features/*",
        components: "src/components/**/*",
        routes: "src/routes/*",
        utils: "src/utils/**/*",
      }
    );

    // billing importing auth's component — not exempt, must still be a violation
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/billing/service.ts`,
      `import { LoginForm } from '../auth/components/LoginForm';`,
      config,
      makeCtx(sharedFiles)
    );

    assert.strictEqual(violations.length, 1);
    assert.ok(violations[0].message.includes("Features components must be imported by their own feature."));
  });

  // unless AND semantics (multi-variable)

  test("unless AND semantics: exempt only when ALL variables match", () => {
    // Pattern captures both $name and $layer; exempt only when name=shared AND layer=public
    const layeredFiles = new Set([
      ...knownFiles,
      `${ROOT_DIR}/src/features/shared/layers/public/Button.tsx`,
      `${ROOT_DIR}/src/features/shared/layers/private/Internal.tsx`,
    ]);
    const config = makeConfig([
      {
        imports: "features/$name/layers/$layer/**/*",
        containedTo: {
          path: "features/$name/**/*",
          unless: { $name: "shared", $layer: "public" },
        },
      },
    ]);

    // billing imports shared/layers/public — both match the unless condition → exempt
    const noViolations = checkBoundaries(
      `${ROOT_DIR}/src/features/billing/service.ts`,
      `import { Button } from '../shared/layers/public/Button';`,
      config,
      makeCtx(layeredFiles)
    );
    assert.strictEqual(noViolations.length, 0);
  });

  test("unless AND semantics: violation when only one of two conditions matches", () => {
    const layeredFiles = new Set([
      ...knownFiles,
      `${ROOT_DIR}/src/features/shared/layers/public/Button.tsx`,
      `${ROOT_DIR}/src/features/shared/layers/private/Internal.tsx`,
    ]);
    const config = makeConfig([
      {
        imports: "features/$name/layers/$layer/**/*",
        containedTo: {
          path: "features/$name/**/*",
          unless: { $name: "shared", $layer: "public" },
        },
      },
    ]);

    // $name=shared matches but $layer=private does not — not all conditions met → violation
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/billing/service.ts`,
      `import { Internal } from '../shared/layers/private/Internal';`,
      config,
      makeCtx(layeredFiles)
    );
    assert.strictEqual(violations.length, 1);
  });

  // unless references a variable not present in imports

  test("unless with unknown variable: rule always enforces (variable never captured)", () => {
    // $zone is not in the imports pattern, so captured[$zone] is always undefined
    const config = makeConfig([
      {
        imports: "features/$name/components/**/*",
        containedTo: {
          path: "features/$name/**/*",
          unless: { $zone: "global" }, // $zone never captured from imports pattern
        },
      },
    ]);

    // billing imports from auth/components — $zone won't match "global" → no exemption → violation
    const violations = checkBoundaries(
      `${ROOT_DIR}/src/features/billing/service.ts`,
      `import { LoginForm } from '../auth/components/LoginForm';`,
      config,
      makeCtx()
    );
    assert.strictEqual(violations.length, 1);
  });
});

// Reproduces the exact myco-log scenario:
//   modules: { features: "features/**" }  (no src/ prefix, /** not /*)
//   rule: imports: "features/$feature/$section/**", containedTo: { path: "features/$feature/**", unless: { $section: "pages" } }
//   violation: features/strain/pages/StrainManagementPage.tsx imports from features/batch/components/index.ts
suite("myco-log regression: containedTo with unless and flat features/** modules", () => {
  const mycoRoot = ROOT_DIR;

  // Mirrors the myco-log module layout (no src/ prefix, /** glob)
  const mycoModules = {
    domain: "domain/**",
    core: "core/**",
    infrastructure: "infrastructure/**",
    app: "app/**",
    features: "features/**",
  };

  const mycoFiles = new Set([
    `${mycoRoot}/features/strain/pages/StrainManagementPage.tsx`,
    `${mycoRoot}/features/batch/components/index.ts`,
    `${mycoRoot}/features/batch/components/TestBatchComponent.tsx`,
    `${mycoRoot}/features/batch/pages/BatchManagementPage.tsx`,
    `${mycoRoot}/app/page.tsx`,
  ]);

  function makeMycoCtx(aliases: Record<string, string> = {}): WorkspaceContext {
    return { knownFiles: mycoFiles, root: mycoRoot, aliases };
  }

  // The exact rule from myco-log pickety.json
  const containedToRule = {
    imports: "features/$feature/$section/**",
    containedTo: {
      path: "features/$feature/**",
      unless: { $section: "pages" },
    },
  };

  function makeMycoConfig(): PicketyConfig {
    return {
      modules: mycoModules,
      rules: { "module-boundaries": { severity: "error", rules: [containedToRule] } },
    };
  }

  test("cross-feature import from components section raises a violation", () => {
    // features/strain/pages/StrainManagementPage.tsx imports features/batch/components/index.ts
    // $feature=batch, $section=components — not exempt — must be a violation
    const violations = checkBoundaries(
      `${mycoRoot}/features/strain/pages/StrainManagementPage.tsx`,
      `import { TestBatchComponent } from '../../batch/components';`,
      makeMycoConfig(),
      makeMycoCtx()
    );
    assert.strictEqual(violations.length, 1, "expected 1 violation for cross-feature component import");
  });

  test("same-feature import from components section raises no violation", () => {
    // features/strain/pages/StrainManagementPage.tsx imports features/strain/components — allowed
    const strainFiles = new Set([
      ...mycoFiles,
      `${mycoRoot}/features/strain/components/index.ts`,
    ]);
    const violations = checkBoundaries(
      `${mycoRoot}/features/strain/pages/StrainManagementPage.tsx`,
      `import { StrainCard } from '../components';`,
      makeMycoConfig(),
      { knownFiles: strainFiles, root: mycoRoot, aliases: {} }
    );
    assert.strictEqual(violations.length, 0, "same-feature import should be allowed");
  });

  test("cross-feature import from pages section is exempt (unless $section=pages)", () => {
    // Importing from features/batch/pages is exempt under the unless condition
    // (pages are handled by a separate `only` rule in the real config)
    const violations = checkBoundaries(
      `${mycoRoot}/features/strain/pages/StrainManagementPage.tsx`,
      `import { BatchManagementPage } from '../../batch/pages/BatchManagementPage';`,
      makeMycoConfig(),
      makeMycoCtx()
    );
    assert.strictEqual(violations.length, 0, "importing from pages section should be exempt");
  });

  test("cross-feature import via @ alias raises a violation", () => {
    // Same violation but using the @/* path alias as in the real myco-log file
    const aliases = { "@/*": "./*" };
    const violations = checkBoundaries(
      `${mycoRoot}/features/strain/pages/StrainManagementPage.tsx`,
      `import { TestBatchComponent } from '@/features/batch/components';`,
      makeMycoConfig(),
      makeMycoCtx(aliases)
    );
    assert.strictEqual(violations.length, 1, "expected 1 violation when importing via @ alias");
  });

  test("explicit user scenario: strain/pages/StrainManagementPage.tsx cannot import from batch/api/client.ts", () => {
    // Exact file from prompt
    const filePath = `${mycoRoot}/features/strain/pages/StrainManagementPage.tsx`;
    const targetPath = `${mycoRoot}/features/batch/api/client.ts`;

    const files = new Set([
      ...mycoFiles,
      normalizePath(filePath),
      normalizePath(targetPath),
    ]);

    const content = `import { client } from '@/features/batch/api/client';`;
    const aliases = { "@/*": "./*" };

    const violations = checkBoundaries(
      filePath,
      content,
      makeMycoConfig(),
      { knownFiles: files, root: mycoRoot, aliases }
    );

    assert.strictEqual(violations.length, 1, "Should block cross-feature import from non-exempt section");
    assert.ok(violations[0].message.includes("contained to \"features/batch/**\""), "Message should mention the restriction");
  });
});

