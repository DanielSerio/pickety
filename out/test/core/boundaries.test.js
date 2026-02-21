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
const boundaries_1 = require("../../core/boundaries");
// Helper to build a minimal config
function makeConfig(rules, modules = {
    features: "src/features/*",
    components: "src/components/**/*",
    routes: "src/routes/*",
    utils: "src/utils/**/*",
}, severity = "error") {
    return {
        modules,
        rules: { "module-boundaries": { severity, rules } },
    };
}
// Standard set of known files for most tests
// Use lowercase drive letter to match normalizePath output on Windows
const knownFiles = new Set([
    "c:/project/src/features/auth/service.ts",
    "c:/project/src/features/auth/components/LoginForm.tsx",
    "c:/project/src/features/auth/pages/LoginPage.tsx",
    "c:/project/src/features/auth/hooks/useAuth.ts",
    "c:/project/src/features/auth/schemas/loginSchema.ts",
    "c:/project/src/features/billing/api.ts",
    "c:/project/src/features/billing/pages/BillingPage.tsx",
    "c:/project/src/features/billing/components/Invoice.tsx",
    "c:/project/src/components/Button.tsx",
    "c:/project/src/routes/auth/index.ts",
    "c:/project/src/routes/billing/index.ts",
    "c:/project/src/utils/helpers.ts",
]);
const root = "c:/project";
// Builds a WorkspaceContext from test fixtures
function makeCtx(files = knownFiles, ctxAliases = {}) {
    return { knownFiles: files, root, aliases: ctxAliases };
}
suite("boundaries — simple deny rules", () => {
    test("detects a violation when feature imports another feature", () => {
        const config = makeConfig([
            { importer: "features", imports: "features" },
        ]);
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/auth/service.ts", `import { api } from '../billing/api';`, config, makeCtx());
        assert.strictEqual(violations.length, 1);
        assert.ok(violations[0].message.includes("../billing/api"));
    });
    test("no violation when importing from a different module", () => {
        const config = makeConfig([
            { importer: "features", imports: "features" },
        ]);
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/auth/service.ts", `import { Button } from '../../components/Button';`, config, makeCtx());
        assert.strictEqual(violations.length, 0);
    });
    test("wildcard importer matches any module", () => {
        const config = makeConfig([
            { importer: "*", imports: "utils" },
        ]);
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/auth/service.ts", `import { helpers } from '../../utils/helpers';`, config, makeCtx());
        assert.strictEqual(violations.length, 1);
    });
    test("allow: true prevents violation", () => {
        const config = makeConfig([
            { importer: "features", imports: "components", allow: true },
        ]);
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/auth/service.ts", `import { Button } from '../../components/Button';`, config, makeCtx());
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
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/auth/service.ts", `import { api } from '../billing/api';`, config, makeCtx());
        assert.strictEqual(violations.length, 1);
        assert.ok(violations[0].message.includes("No cross-feature imports!"));
    });
    test("uses warn severity when configured", () => {
        const config = makeConfig([{ importer: "features", imports: "features" }], undefined, "warn");
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/auth/service.ts", `import { api } from '../billing/api';`, config, makeCtx());
        assert.strictEqual(violations[0].severity, "warn");
    });
});
suite("boundaries — file path glob patterns", () => {
    test("denies import matching a file path glob in imports", () => {
        const config = makeConfig([
            { importer: "routes", imports: "features/**/components" },
        ]);
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/routes/auth/index.ts", `import { LoginForm } from '../../features/auth/components/LoginForm';`, config, makeCtx());
        assert.strictEqual(violations.length, 1);
    });
    test("no violation when import does not match the path glob", () => {
        const config = makeConfig([
            { importer: "routes", imports: "features/**/components" },
        ]);
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/routes/auth/index.ts", `import { LoginPage } from '../../features/auth/pages/LoginPage';`, config, makeCtx());
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
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/routes/auth/index.ts", content, config, makeCtx());
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
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/routes/auth/index.ts", `import { LoginPage } from '../../features/auth/pages/LoginPage';`, config, makeCtx());
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
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/routes/auth/index.ts", `import { BillingPage } from '../../features/billing/pages/BillingPage';`, config, makeCtx());
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
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/routes/auth/index.ts", `import { Button } from '../../components/Button';`, config, makeCtx());
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
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/routes/auth/index.ts", `import { useAuth } from '../../features/auth/hooks/useAuth';`, config, makeCtx());
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
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/routes/auth/index.ts", `import { LoginPage } from '../../features/auth/pages/LoginPage';`, config, makeCtx());
        assert.strictEqual(violations.length, 0);
    });
    // --- Multiple variables ---
    test("two variables both matching — no violation (allow: true)", () => {
        const multiVarKnownFiles = new Set([
            "c:/project/src/apps/web/routes/auth/index.ts",
            "c:/project/src/apps/web/pages/auth/LoginPage.tsx",
            "c:/project/src/apps/web/pages/billing/BillingPage.tsx",
            "c:/project/src/apps/mobile/pages/auth/LoginPage.tsx",
        ]);
        const config = makeConfig([
            {
                importer: "apps/$app/routes/$route",
                imports: "apps/$app/pages/$route",
                allow: true,
            },
        ], { apps: "src/apps/*" });
        // apps/web/routes/auth importing apps/web/pages/auth — both match
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/apps/web/routes/auth/index.ts", `import { LoginPage } from '../../pages/auth/LoginPage';`, config, makeCtx(multiVarKnownFiles));
        assert.strictEqual(violations.length, 0);
    });
    test("two variables, second mismatches — violation (allow: true)", () => {
        const multiVarKnownFiles = new Set([
            "c:/project/src/apps/web/routes/auth/index.ts",
            "c:/project/src/apps/web/pages/billing/BillingPage.tsx",
        ]);
        const config = makeConfig([
            {
                importer: "apps/$app/routes/$route",
                imports: "apps/$app/pages/$route",
                allow: true,
            },
        ], { apps: "src/apps/*" });
        // apps/web/routes/auth importing apps/web/pages/billing — $app matches but $route doesn't
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/apps/web/routes/auth/index.ts", `import { BillingPage } from '../../pages/billing/BillingPage';`, config, makeCtx(multiVarKnownFiles));
        assert.strictEqual(violations.length, 1);
    });
    test("two variables, first mismatches — violation (allow: true)", () => {
        const multiVarKnownFiles = new Set([
            "c:/project/src/apps/web/routes/auth/index.ts",
            "c:/project/src/apps/mobile/pages/auth/LoginPage.tsx",
        ]);
        const config = makeConfig([
            {
                importer: "apps/$app/routes/$route",
                imports: "apps/$app/pages/$route",
                allow: true,
            },
        ], { apps: "src/apps/*" });
        // apps/web/routes/auth importing apps/mobile/pages/auth — $route matches but $app doesn't
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/apps/web/routes/auth/index.ts", `import { LoginPage } from '../../../mobile/pages/auth/LoginPage';`, config, makeCtx(multiVarKnownFiles));
        assert.strictEqual(violations.length, 1);
    });
    test("two variables deny rule — matching values denied (allow: false)", () => {
        const multiVarKnownFiles = new Set([
            "c:/project/src/apps/web/routes/auth/index.ts",
            "c:/project/src/apps/web/internal/auth/secrets.ts",
        ]);
        const config = makeConfig([
            {
                importer: "apps/$app/routes/$route",
                imports: "apps/$app/internal/$route",
            },
        ], { apps: "src/apps/*" });
        // apps/web/routes/auth importing apps/web/internal/auth — both vars match, denied
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/apps/web/routes/auth/index.ts", `import { secrets } from '../../internal/auth/secrets';`, config, makeCtx(multiVarKnownFiles));
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
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/auth/service.ts", `import { BillingPage } from '../billing/pages/BillingPage';`, config, makeCtx());
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
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/routes/auth/index.ts", `import { BillingPage } from '../../features/billing/pages/BillingPage';`, config, makeCtx());
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
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/routes/auth/index.ts", content, config, makeCtx());
        assert.strictEqual(violations.length, 2);
    });
});
suite("boundaries — edge cases", () => {
    test("no violations for a file not in any module", () => {
        const config = makeConfig([
            { importer: "features", imports: "features" },
        ]);
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/config/database.ts", `import { api } from '../features/billing/api';`, config, makeCtx());
        assert.strictEqual(violations.length, 0);
    });
    test("no violations when import resolves to unknown file", () => {
        const config = makeConfig([
            { importer: "features", imports: "features" },
        ]);
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/auth/service.ts", `import { missing } from '../billing/nonexistent';`, config, makeCtx());
        assert.strictEqual(violations.length, 0);
    });
    test("no violations for external package imports", () => {
        const config = makeConfig([
            { importer: "*", imports: "*" },
        ]);
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/auth/service.ts", `import React from 'react';`, config, makeCtx());
        assert.strictEqual(violations.length, 0);
    });
    test("no violations for empty file content", () => {
        const config = makeConfig([
            { importer: "features", imports: "features" },
        ]);
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/auth/service.ts", "", config, makeCtx());
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
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/auth/service.ts", content, config, makeCtx());
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
            "c:/project/src/features/billing/utils.ts",
        ]);
        const content = [
            `import { api } from '../billing/api';`,
            `import { utils } from '../billing/utils';`,
        ].join("\n");
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/auth/service.ts", content, config, makeCtx(filesWithBilling));
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
            "c:/project/src/features/auth/other.ts",
        ]);
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/auth/service.ts", `import { other } from './other';`, config, makeCtx(authKnownFiles));
        // Both files are in "features" module, so this matches the deny rule
        assert.strictEqual(violations.length, 1);
    });
});
suite("boundaries — aliases", () => {
    const aliases = { "@/*": "src/*" };
    test("resolves aliased import and detects violation", () => {
        const config = makeConfig([{ importer: "features", imports: "features" }]);
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/auth/service.ts", `import { api } from '@/features/billing/api';`, config, makeCtx(knownFiles, aliases));
        assert.strictEqual(violations.length, 1);
        assert.ok(violations[0].message.includes("@/features/billing/api"));
    });
    test("no violation when aliased import resolves to allowed module", () => {
        const config = makeConfig([{ importer: "features", imports: "features" }]);
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/auth/service.ts", `import { Button } from '@/components/Button';`, config, makeCtx(knownFiles, aliases));
        assert.strictEqual(violations.length, 0);
    });
});
suite("boundaries — rule identification and severity", () => {
    test("uses per-rule severity override", () => {
        const config = makeConfig([
            { importer: "features", imports: "features", severity: "warn" },
        ]);
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/auth/service.ts", `import { api } from '../billing/api';`, config, makeCtx());
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
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/auth/service.ts", `import { api } from '../billing/api';`, config, makeCtx());
        assert.ok(violations[0].message.startsWith("[no-cross-feature]"));
        assert.strictEqual(violations[0].ruleName, "no-cross-feature");
    });
    test("falls back to rule index if name is missing", () => {
        const config = makeConfig([
            { importer: "features", imports: "components", allow: true },
            { importer: "features", imports: "features" },
        ]);
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/auth/service.ts", `import { api } from '../billing/api';`, config, makeCtx());
        // Second rule (index 1) was violated
        assert.ok(violations[0].message.startsWith("[rule[1]]"));
        assert.strictEqual(violations[0].ruleName, "rule[1]");
    });
});
suite("boundaries — maxViolations threshold", () => {
    // Helper to create a violation with a specific rule name
    function makeViolation(ruleName, severity = "error") {
        return {
            file: "c:/project/src/features/auth/service.ts",
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
        const result = (0, boundaries_1.applyMaxViolations)(violations, config);
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
        const result = (0, boundaries_1.applyMaxViolations)(violations, config);
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
        const result = (0, boundaries_1.applyMaxViolations)(violations, config);
        assert.strictEqual(result[0].severity, "warn");
        assert.strictEqual(result[1].severity, "warn");
    });
    test("rules without maxViolations are not affected", () => {
        const config = makeConfig([
            { importer: "features", imports: "features", name: "no-cross" },
        ]);
        const violations = [makeViolation("no-cross")];
        const result = (0, boundaries_1.applyMaxViolations)(violations, config);
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
        const result = (0, boundaries_1.applyMaxViolations)(violations, config);
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
        const result = (0, boundaries_1.applyMaxViolations)(violations, config);
        assert.strictEqual(result[0].severity, "error");
    });
    test("unnamed rules with maxViolations use index-based name", () => {
        const config = makeConfig([
            { importer: "features", imports: "features", maxViolations: 5 },
        ]);
        const violations = [makeViolation("rule[0]")];
        const result = (0, boundaries_1.applyMaxViolations)(violations, config);
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
            "c:/project/src/services/UserService.ts",
            "c:/project/src/repositories/UserRepository.ts",
            "c:/project/src/controllers/UserController.ts"
        ]);
        // Controller importing Repository — should be a violation
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/controllers/UserController.ts", `import { repo } from '../repositories/UserRepository';`, config, makeCtx(customKnownFiles));
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
            "c:/project/src/services/UserService.ts",
            "c:/project/src/repositories/UserRepository.ts"
        ]);
        // Service importing Repository — should be allowed
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/services/UserService.ts", `import { repo } from '../repositories/UserRepository';`, config, makeCtx(customKnownFiles));
        assert.strictEqual(violations.length, 0);
    });
    test("containedTo rule: violation when importer is outside the allowed path", () => {
        const config = makeConfig([
            { imports: "src/features/auth/internal/*", containedTo: "src/features/auth/**/*" },
        ]);
        const customKnownFiles = new Set([
            "c:/project/src/features/auth/internal/helper.ts",
            "c:/project/src/features/billing/service.ts"
        ]);
        // Billing importing Auth-internal — should be a violation
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/billing/service.ts", `import { helper } from '../auth/internal/helper';`, config, makeCtx(customKnownFiles));
        assert.strictEqual(violations.length, 1);
        assert.ok(violations[0].message.includes("is contained to \"src/features/auth/**/*\""));
    });
    test("containedTo rule with interpolation: violation when scope mismatches", () => {
        const config = makeConfig([
            { imports: "src/features/$name/internal/*", containedTo: "src/features/$name/**/*" },
        ]);
        const customKnownFiles = new Set([
            "c:/project/src/features/auth/internal/helper.ts",
            "c:/project/src/features/auth/service.ts",
            "c:/project/src/features/billing/service.ts"
        ]);
        // Billing importing Auth-internal — $name=auth, so importer must be features/auth/**/*
        // Billing is features/billing/**/*, so it should fail.
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/billing/service.ts", `import { helper } from '../auth/internal/helper';`, config, makeCtx(customKnownFiles));
        assert.strictEqual(violations.length, 1);
        assert.ok(violations[0].message.includes("contained to \"src/features/auth/**/*\""));
    });
    test("containedTo rule with interpolation: no violation when scope matches", () => {
        const config = makeConfig([
            { imports: "src/features/$name/internal/*", containedTo: "src/features/$name/**/*" },
        ]);
        const customKnownFiles = new Set([
            "c:/project/src/features/auth/internal/helper.ts",
            "c:/project/src/features/auth/service.ts"
        ]);
        // Auth importing Auth-internal — $name=auth matches both
        const violations = (0, boundaries_1.checkBoundaries)("c:/project/src/features/auth/service.ts", `import { helper } from './internal/helper';`, config, makeCtx(customKnownFiles));
        assert.strictEqual(violations.length, 0);
    });
});
//# sourceMappingURL=boundaries.test.js.map