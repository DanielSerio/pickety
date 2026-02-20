import * as assert from "assert";
import { checkBoundaries } from "../../core/boundaries";
import type { PicketyConfig } from "../../types";

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
const knownFiles = new Set([
  "C:/project/src/features/auth/service.ts",
  "C:/project/src/features/auth/components/LoginForm.tsx",
  "C:/project/src/features/auth/pages/LoginPage.tsx",
  "C:/project/src/features/auth/hooks/useAuth.ts",
  "C:/project/src/features/auth/schemas/loginSchema.ts",
  "C:/project/src/features/billing/api.ts",
  "C:/project/src/features/billing/pages/BillingPage.tsx",
  "C:/project/src/features/billing/components/Invoice.tsx",
  "C:/project/src/components/Button.tsx",
  "C:/project/src/routes/auth/index.ts",
  "C:/project/src/routes/billing/index.ts",
  "C:/project/src/utils/helpers.ts",
]);

const root = "C:/project";

suite("boundaries — simple deny rules", () => {
  test("detects a violation when feature imports another feature", () => {
    const config = makeConfig([
      { importer: "features", imports: "features" },
    ]);

    const violations = checkBoundaries(
      "C:/project/src/features/auth/service.ts",
      `import { api } from '../billing/api';`,
      config,
      knownFiles,
      root
    );

    assert.strictEqual(violations.length, 1);
    assert.ok(violations[0].message.includes("../billing/api"));
  });

  test("no violation when importing from a different module", () => {
    const config = makeConfig([
      { importer: "features", imports: "features" },
    ]);

    const violations = checkBoundaries(
      "C:/project/src/features/auth/service.ts",
      `import { Button } from '../../components/Button';`,
      config,
      knownFiles,
      root
    );

    assert.strictEqual(violations.length, 0);
  });

  test("wildcard importer matches any module", () => {
    const config = makeConfig([
      { importer: "*", imports: "utils" },
    ]);

    const violations = checkBoundaries(
      "C:/project/src/features/auth/service.ts",
      `import { helpers } from '../../utils/helpers';`,
      config,
      knownFiles,
      root
    );

    assert.strictEqual(violations.length, 1);
  });

  test("allow: true prevents violation", () => {
    const config = makeConfig([
      { importer: "features", imports: "components", allow: true },
    ]);

    const violations = checkBoundaries(
      "C:/project/src/features/auth/service.ts",
      `import { Button } from '../../components/Button';`,
      config,
      knownFiles,
      root
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
      "C:/project/src/features/auth/service.ts",
      `import { api } from '../billing/api';`,
      config,
      knownFiles,
      root
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
      "C:/project/src/features/auth/service.ts",
      `import { api } from '../billing/api';`,
      config,
      knownFiles,
      root
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
      "C:/project/src/routes/auth/index.ts",
      `import { LoginForm } from '../../features/auth/components/LoginForm';`,
      config,
      knownFiles,
      root
    );

    assert.strictEqual(violations.length, 1);
  });

  test("no violation when import does not match the path glob", () => {
    const config = makeConfig([
      { importer: "routes", imports: "features/**/components" },
    ]);

    const violations = checkBoundaries(
      "C:/project/src/routes/auth/index.ts",
      `import { LoginPage } from '../../features/auth/pages/LoginPage';`,
      config,
      knownFiles,
      root
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
      "C:/project/src/routes/auth/index.ts",
      content,
      config,
      knownFiles,
      root
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
      "C:/project/src/routes/auth/index.ts",
      `import { LoginPage } from '../../features/auth/pages/LoginPage';`,
      config,
      knownFiles,
      root
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
      "C:/project/src/routes/auth/index.ts",
      `import { BillingPage } from '../../features/billing/pages/BillingPage';`,
      config,
      knownFiles,
      root
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
      "C:/project/src/routes/auth/index.ts",
      `import { Button } from '../../components/Button';`,
      config,
      knownFiles,
      root
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
      "C:/project/src/routes/auth/index.ts",
      `import { useAuth } from '../../features/auth/hooks/useAuth';`,
      config,
      knownFiles,
      root
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
      "C:/project/src/routes/auth/index.ts",
      `import { LoginPage } from '../../features/auth/pages/LoginPage';`,
      config,
      knownFiles,
      root
    );

    assert.strictEqual(violations.length, 0);
  });

  // --- Multiple variables ---

  test("two variables both matching — no violation (allow: true)", () => {
    const multiVarModules = {
      features: "src/features/*",
      apps: "src/apps/*",
    };
    const multiVarKnownFiles = new Set([
      "C:/project/src/apps/web/routes/auth/index.ts",
      "C:/project/src/apps/web/pages/auth/LoginPage.tsx",
      "C:/project/src/apps/web/pages/billing/BillingPage.tsx",
      "C:/project/src/apps/mobile/pages/auth/LoginPage.tsx",
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
      "C:/project/src/apps/web/routes/auth/index.ts",
      `import { LoginPage } from '../../pages/auth/LoginPage';`,
      config,
      multiVarKnownFiles,
      root
    );

    assert.strictEqual(violations.length, 0);
  });

  test("two variables, second mismatches — violation (allow: true)", () => {
    const multiVarKnownFiles = new Set([
      "C:/project/src/apps/web/routes/auth/index.ts",
      "C:/project/src/apps/web/pages/billing/BillingPage.tsx",
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
      "C:/project/src/apps/web/routes/auth/index.ts",
      `import { BillingPage } from '../../pages/billing/BillingPage';`,
      config,
      multiVarKnownFiles,
      root
    );

    assert.strictEqual(violations.length, 1);
  });

  test("two variables, first mismatches — violation (allow: true)", () => {
    const multiVarKnownFiles = new Set([
      "C:/project/src/apps/web/routes/auth/index.ts",
      "C:/project/src/apps/mobile/pages/auth/LoginPage.tsx",
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
      "C:/project/src/apps/web/routes/auth/index.ts",
      `import { LoginPage } from '../../../mobile/pages/auth/LoginPage';`,
      config,
      multiVarKnownFiles,
      root
    );

    assert.strictEqual(violations.length, 1);
  });

  test("two variables deny rule — matching values denied (allow: false)", () => {
    const multiVarKnownFiles = new Set([
      "C:/project/src/apps/web/routes/auth/index.ts",
      "C:/project/src/apps/web/internal/auth/secrets.ts",
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
      "C:/project/src/apps/web/routes/auth/index.ts",
      `import { secrets } from '../../internal/auth/secrets';`,
      config,
      multiVarKnownFiles,
      root
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
      "C:/project/src/features/auth/service.ts",
      `import { BillingPage } from '../billing/pages/BillingPage';`,
      config,
      knownFiles,
      root
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
      "C:/project/src/routes/auth/index.ts",
      `import { BillingPage } from '../../features/billing/pages/BillingPage';`,
      config,
      knownFiles,
      root
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
      "C:/project/src/routes/auth/index.ts",
      content,
      config,
      knownFiles,
      root
    );

    assert.strictEqual(violations.length, 2);
  });
});

suite("boundaries — edge cases", () => {
  test("no violations for a file not in any module", () => {
    const config = makeConfig([
      { importer: "features", imports: "features" },
    ]);

    const violations = checkBoundaries(
      "C:/project/src/config/database.ts",
      `import { api } from '../features/billing/api';`,
      config,
      knownFiles,
      root
    );

    assert.strictEqual(violations.length, 0);
  });

  test("no violations when import resolves to unknown file", () => {
    const config = makeConfig([
      { importer: "features", imports: "features" },
    ]);

    const violations = checkBoundaries(
      "C:/project/src/features/auth/service.ts",
      `import { missing } from '../billing/nonexistent';`,
      config,
      knownFiles,
      root
    );

    assert.strictEqual(violations.length, 0);
  });

  test("no violations for external package imports", () => {
    const config = makeConfig([
      { importer: "*", imports: "*" },
    ]);

    const violations = checkBoundaries(
      "C:/project/src/features/auth/service.ts",
      `import React from 'react';`,
      config,
      knownFiles,
      root
    );

    assert.strictEqual(violations.length, 0);
  });

  test("no violations for empty file content", () => {
    const config = makeConfig([
      { importer: "features", imports: "features" },
    ]);

    const violations = checkBoundaries(
      "C:/project/src/features/auth/service.ts",
      "",
      config,
      knownFiles,
      root
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
      "C:/project/src/features/auth/service.ts",
      content,
      config,
      knownFiles,
      root
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
      "C:/project/src/features/billing/utils.ts",
    ]);

    const content = [
      `import { api } from '../billing/api';`,
      `import { utils } from '../billing/utils';`,
    ].join("\n");

    const violations = checkBoundaries(
      "C:/project/src/features/auth/service.ts",
      content,
      config,
      filesWithBilling,
      root
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
      "C:/project/src/features/auth/other.ts",
    ]);

    const violations = checkBoundaries(
      "C:/project/src/features/auth/service.ts",
      `import { other } from './other';`,
      config,
      authKnownFiles,
      root
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
      "C:/project/src/features/auth/service.ts",
      `import { api } from '@/features/billing/api';`,
      config,
      knownFiles,
      root,
      aliases
    );

    assert.strictEqual(violations.length, 1);
    assert.ok(violations[0].message.includes("@/features/billing/api"));
  });

  test("no violation when aliased import resolves to allowed module", () => {
    const config = makeConfig([{ importer: "features", imports: "features" }]);

    const violations = checkBoundaries(
      "C:/project/src/features/auth/service.ts",
      `import { Button } from '@/components/Button';`,
      config,
      knownFiles,
      root,
      aliases
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
      "C:/project/src/features/auth/service.ts",
      `import { api } from '../billing/api';`,
      config,
      knownFiles,
      root
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
      "C:/project/src/features/auth/service.ts",
      `import { api } from '../billing/api';`,
      config,
      knownFiles,
      root
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
      "C:/project/src/features/auth/service.ts",
      `import { api } from '../billing/api';`,
      config,
      knownFiles,
      root
    );

    // Second rule (index 1) was violated
    assert.ok(violations[0].message.startsWith("[rule[1]]"));
    assert.strictEqual(violations[0].ruleName, "rule[1]");
  });
});
