# Pickety Roadmap

Improvements to make pickety more useful for keeping agents (and humans) on rails.

## Phase 1: Foundational DX

These improvements address the biggest pain points — silent failures and delayed feedback.

### 1.1 Config Validation Error Messages

**Problem:** `loadConfig` returns `undefined` for every failure mode. Invalid JSON, missing fields, wrong types — the user gets zero feedback. Pickety just silently doesn't activate.

**Solution:**

- Change `loadConfig` to return a result type with structured errors:
  ```ts
  type ConfigResult =
    | { ok: true; config: PicketyConfig }
    | { ok: false; errors: ConfigError[] };
  ```
- Each `ConfigError` includes a human-readable message and, where possible, a JSON path (e.g., `rules.module-boundaries.severity`).
- Surface config errors as VS Code diagnostics on `pickety.json` itself — red squiggles on the invalid field.
- Show an output channel message on activation failure so users know pickety is broken.

**Files to change:**
- `src/types.ts` — add `ConfigError` type
- `src/core/config.ts` — rewrite `validateConfig` to collect errors instead of returning early
- `src/extension.ts` — handle error results, show diagnostics on `pickety.json`
- `src/test/core/config.test.ts` — update tests for new return type

**Validation messages to support:**
- `pickety.json is not valid JSON: <parse error>`
- `"modules" is required and must be an object`
- `Module "<name>" pattern must be a string, got <type>`
- `"rules" is required and must be an object`
- `"rules.module-boundaries" is required and must be an object`
- `"rules.module-boundaries.severity" must be "error" or "warn", got "<value>"`
- `"rules.module-boundaries.rules" must be an array`
- `Rule #<n>: "importer" is required and must be a string`
- `Rule #<n>: "imports" is required and must be a string`
- `Rule #<n>: "allow" must be a boolean`
- `Rule #<n>: "message" must be a string`

---

### 1.2 Real-Time Analysis on Text Change

**Problem:** Violations only appear on file save. Users write bad imports, keep coding, then get surprised when they save.

**Solution:**

- Add `onDidChangeTextDocument` listener in `extension.ts`.
- Debounce analysis (300ms) to avoid running on every keystroke.
- Clear stale diagnostics immediately when a file is modified so old violations don't linger.

**Files to change:**
- `src/extension.ts` — add change listener with debounce

---

### 1.3 tsconfig.json Path Alias Support

**Problem:** `resolveImport` accepts an `aliases` parameter but it's never populated. Most TypeScript projects use `@/*` path aliases via `tsconfig.json`. Without this, pickety silently skips all aliased imports — a major blind spot.

**Solution:**

- Read `tsconfig.json` (and `tsconfig.app.json`, etc.) from the workspace root on activation.
- Extract `compilerOptions.paths` and `compilerOptions.baseUrl`.
- Convert tsconfig paths to the alias format `resolveImport` already supports.
- Watch for `tsconfig.json` changes and reload aliases.

**Files to change:**
- `src/core/config.ts` — add `loadTsConfigAliases` function
- `src/extension.ts` — call alias loader, pass aliases to `checkBoundaries`
- `src/core/boundaries.ts` — pass aliases through to `resolveImport`
- `src/core/imports.ts` — no changes needed (already supports aliases)
- `src/test/core/imports.test.ts` — add alias integration tests

---

## Phase 2: Better Violation Context

These improvements make violations easier to understand and act on.

### 2.1 Per-Rule Severity

**Problem:** Severity is global — every rule is either `error` or `warn`. In practice, some boundaries are hard lines (never cross) while others are soft preferences (we'd rather you didn't).

**Solution:**

- Add optional `severity` field to `BoundaryRule` that overrides the global severity.
- Fall back to the global `rules.module-boundaries.severity` when not specified.

**Files to change:**
- `src/types.ts` — add optional `severity` to `BoundaryRule`
- `src/core/config.ts` — validate per-rule severity
- `src/core/boundaries.ts` — use rule-level severity when present
- `src/test/core/boundaries.test.ts` — add per-rule severity tests

---

### 2.2 Rule Identification in Violations

**Problem:** When a user sees `Module "routes" cannot import from "features"`, they have to manually search `pickety.json` to find which rule caused it. This is tedious with many rules.

**Solution:**

- Add optional `name` field to `BoundaryRule`.
- Include rule name (or index fallback) in violation messages:
  ```
  [no-cross-feature] Module "routes" cannot import from "features" (importing "../features/auth")
  ```
- Include rule info in the diagnostic's `code` field for VS Code UI.

**Files to change:**
- `src/types.ts` — add optional `name` to `BoundaryRule`
- `src/core/config.ts` — validate rule name
- `src/core/boundaries.ts` — include rule name in violation messages
- `src/extension.ts` — set `diagnostic.code` with rule name

---

### 2.3 Diagnostic Codes with Documentation Links

**Problem:** Violations show a message but offer no path to learn more. Users new to pickety don't know what to do.

**Solution:**

- Set `diagnostic.code` with a `target` URI that links to documentation.
- The link appears as a clickable code in VS Code's Problems panel.

**Files to change:**
- `src/extension.ts` — set `diagnostic.code` with value and target URI

---

## Phase 3: Editor Integration

Deeper VS Code integration for a smoother workflow.

### 3.1 Status Bar Indicator

**Problem:** When pickety is inactive (broken config, no `pickety.json`), there's no visible indication. Users may think they're protected when they're not.

**Solution:**

- Add a status bar item that shows one of:
  - `Pickety: active` — config loaded, monitoring
  - `Pickety: 3 violations` — click to show Problems panel
  - `Pickety: config error` — click to open `pickety.json`
  - `Pickety: inactive` — no `pickety.json` found
- Update the status bar on config load, analysis completion, and config errors.

**Files to change:**
- `src/extension.ts` — create and manage status bar item

---

### 3.2 Quick Fixes via Code Actions

**Problem:** When a violation is flagged, the only option is to manually fix the import or update the config. There's no assisted path.

**Solution:**

- Register a `CodeActionProvider` for pickety diagnostics.
- Offer these quick fixes:
  - **"Suppress this line"** — insert `// pickety-ignore-next-line` comment above the import
  - **"Go to rule"** — open `pickety.json` and jump to the rule that triggered the violation
- This requires:
  - A comment-based suppression system in `boundaries.ts`
  - Tracking which rule index triggered each violation

**Files to change:**
- `src/types.ts` — add rule index to `Violation`
- `src/core/boundaries.ts` — detect suppression comments, attach rule index
- `src/extension.ts` — register `CodeActionProvider`
- `src/test/core/boundaries.test.ts` — test suppression comments

---

## Implementation Order

```
Phase 1 (Foundation)
  1.1 Config validation errors     ← start here
  1.2 Real-time analysis
  1.3 tsconfig alias support

Phase 2 (Context)
  2.1 Per-rule severity
  2.2 Rule identification
  2.3 Diagnostic links

Phase 3 (Integration)
  3.1 Status bar
  3.2 Quick fixes
```

Each item is independently shippable. Within each phase, items are ordered by dependency — earlier items inform later ones (e.g., rule identification in 2.2 is used by quick fixes in 3.2).
