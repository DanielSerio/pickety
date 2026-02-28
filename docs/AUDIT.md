# Code Audit: `feat/suggestions-1` Branch

**Date:** 2026-02-28
**Scope:** All changes on `feat/suggestions-1` relative to `main` (40 files, ~2,300 lines added)
**Commits reviewed:** 9 (`4238687..b044fa8`)

---

## Overview

This branch delivers three major features:

1. **Architecture presets** (`hexagonal`, `feature-modules`, `layered`) with preset-aware config merging.
2. **CLI `init` command** that scaffolds `pickety.json`, optionally from a preset.
3. **Module-instance matching, exports exemptions, and expanded interpolation** for fine-grained `containedTo` enforcement.

Plus: CLI JSON output format, `warnOnUntrackedImporters`, config variable warnings, expanded validation, new test suites, schema and docs updates.

---

## Correctness Issues

### 1. `discoverFiles` uses `entry.parentPath` (non-standard)

**File:** `src/cli/index.ts:70`

`fs.Dirent` gained `parentPath` in Node 20.12+. Older LTS versions (18.x, early 20.x) only have `path` on `Dirent` when using `recursive: true`. If the CLI needs to support Node 18 (still in maintenance LTS), this will throw at runtime.

**Recommendation:** Use `entry.parentPath ?? entry.path` or document a minimum Node version requirement.

### 2. `applyMaxViolations` slicing in `DocumentValidator` is fragile

**File:** `src/services/documentValidator.ts:81-89`

The logic collects all violations from all documents, passes them to `applyMaxViolations`, then slices the result back per-document by assuming the output array preserves the exact same order and length as the input. This works today because `applyMaxViolations` uses `.map()`, but:

- If `applyMaxViolations` ever filters, deduplicates, or reorders, this breaks silently — diagnostics would be assigned to the wrong files.
- The `offset` tracking is index-coupled to the original array without any file-identity check.

**Recommendation:** After calling `applyMaxViolations`, re-group by `v.file` instead of relying on positional slicing.

### 3. Silent `catch` blocks in CLI swallow real errors

**Files:** `src/cli/index.ts:141,154`

Both `runCheck` and `buildImportGraph` have bare `catch { continue }` blocks when reading files. If a file is unreadable due to permissions or encoding issues, the error is silently swallowed. This makes debugging CI failures harder than it needs to be.

**Recommendation:** Log a warning to stderr (e.g., `console.warn(\`Skipping unreadable file: ${filePath}\`)`), at least when a `--verbose` flag is present.

### 4. `replaceVariables` builds a new RegExp per variable per call

**File:** `src/core/interpolation.ts:132`

`new RegExp(escapedV, "g")` is constructed inside a hot loop (called for every rule evaluation on every import). While not a correctness bug, the repeated regex compilation is wasteful — `String.replaceAll()` (available since Node 15) or a pre-compiled regex would be more efficient.

---

## Design & Architecture

### 5. Preset merging logic is deeply nested and hard to follow

**File:** `src/core/config.ts:91-168`

`mergePresetConfig` is 77 lines of nested conditionals covering every combination of override presence. It works, but it's brittle for future preset fields. The repeated `if (override.X !== undefined) ... else if (preset.X !== undefined)` pattern appears 4 times.

**Recommendation:** Extract a generic `mergeField(preset, override, key)` helper, or use a structured merge strategy (e.g., deep merge with explicit override semantics per field).

### 6. `exports` rule evaluation rebuilds captures on every call

**File:** `src/core/interpolatedEnforcement.ts:188-242`

`isExportExempt` iterates over all export rules, calling `getCaptureForPattern` and `mergeCaptures` for each one. For configs with many export exemptions, this is O(exports * variables) per import per rule. Not a problem at current scale, but worth noting.

### 7. CLI `main()` calls `process.exit()` in every code path

**File:** `src/cli/index.ts:294-319`

Every command function calls `process.exit()` directly, which prevents the CLI from being used as a library or tested without process mocking. The new `cli.test.ts` works around this by spawning a child process, but extracting return codes from the command functions and having `main()` be the single exit point would be cleaner.

---

## Code Quality

### 8. Type assertion chain in `validationRules.ts`

**File:** `src/core/validationRules.ts:203`

```ts
validatedRules.push(r as unknown as BoundaryRule);
```

This double-cast (`unknown` -> `BoundaryRule`) bypasses TypeScript's structural checks entirely. Since the validation above already checks every field, a safer approach would be to construct the `BoundaryRule` explicitly from validated fields.

### 9. Duplicated violation counting logic

**Files:** `src/cli/index.ts:188-190`, `src/cli/formatters.ts:89-91`

The same `violations.filter(v => v.severity === "error").length` / `"warn"` / `"info"` pattern appears in both `runCheck` and `buildCheckReport`. This is a DRY violation that could diverge.

**Recommendation:** Extract a `countBySeverity(violations)` utility.

### 10. `buildMermaidContent` uses `!` non-null assertions

**File:** `src/core/diagram.ts:118`

```ts
clusters.get(cluster)!.push(name);
```

The `!` is safe here because of the preceding `if (!clusters.has(cluster))` guard, but it would be more idiomatic to use the pattern:

```ts
const existing = clusters.get(cluster) ?? [];
existing.push(name);
clusters.set(cluster, existing);
```

### 11. Inconsistent loop styles

Throughout `src/core/`, the codebase mixes `for...of`, `.forEach()`, and `.map()` for iteration. For example, `boundaries.ts:72` uses `.forEach()` where a `for...of` with early `break` would be more appropriate (since we want to stop after the first violation per import). This doesn't cause bugs since violations are accumulated, but it's inconsistent with the `for...of` style used elsewhere.

---

## Schema & Configuration

### 12. Schema `version` enum is stale

**File:** `resources/pickety.schema.json:10`

The schema only allows `"0.1.0"` for the version field, but the changelog is at `0.3.0`. If version is meant to track the config format, the enum should be updated. If it's not meaningfully used, consider removing it from the schema to avoid user confusion.

### 13. Schema `exports` property is missing

The `BoundaryRule` type includes `exports?: ExportRule | ExportRule[]`, but the JSON schema does not define an `exports` property on rule objects. Users won't get autocomplete or validation for this feature.

**Recommendation:** Add `exports` to `pickety.schema.json` with proper `oneOf` handling for the single-object and array forms.

---

## Test Coverage

### 14. CLI test relies on compiled output path

**File:** `src/test/core/cli.test.ts:7`

```ts
const CLI_PATH = path.resolve(__dirname, "../../cli/index.js");
```

This assumes the CLI has been compiled to `out/cli/index.js` before tests run. If the build step is skipped or the output structure changes, the test fails with a confusing "module not found" error rather than a clear message.

**Recommendation:** Add a guard that checks `fs.existsSync(CLI_PATH)` and skips with a descriptive message if missing.

### 15. No negative test for unknown CLI commands

The CLI tests cover `check`, `init`, and missing config, but don't test the `default` branch in `main()` (unknown command). A simple test asserting `exit code 1` and `stderr` containing `Unknown command` would close this gap.

### 16. No tests for `--format` flag validation

The CLI arg parser has explicit validation for `--format` (rejects values other than `"text"` and `"json"`), but this isn't covered by any test.

---

## Security

### 17. Path traversal protection is solid

`src/core/diagram.ts:40-46` properly prevents diagram output from escaping the workspace root. This is well-implemented.

### 18. No input sanitization on preset names

**File:** `src/cli/index.ts:243-248`

The `--preset` value is passed to `getPreset()` which does a simple map lookup, so there's no injection risk. However, the error message interpolates the user-provided string directly into console output. This is fine for a CLI, but worth noting for future use in webviews.

---

## Documentation

### 19. `AGENTS.md` is a good addition

The repository guidelines file provides clear structure for AI-assisted development. It correctly documents build commands, test commands, and project structure.

### 20. `pickety.md` suggestions document is useful but should track resolution status

The suggestions file documents real-world pain points. Items #1 (untracked importers) and #2 (module-instance matching) appear to be addressed by this branch. Consider marking them as resolved or moving them to the changelog.

---

## Summary

| Category | Count |
|---|---|
| Correctness issues | 4 |
| Design concerns | 3 |
| Code quality | 4 |
| Schema issues | 2 |
| Test gaps | 3 |
| Security | 2 (1 positive, 1 minor) |
| Documentation | 2 (both positive) |

**Overall assessment:** The branch is well-structured and the core logic is sound. The most actionable items are:

1. **Fix the `applyMaxViolations` slicing** (#2) — this is the highest-risk correctness issue.
2. **Add `exports` to the JSON schema** (#13) — users can't discover this feature without it.
3. **Address the Node version requirement** (#1) — or document it explicitly.
4. **Extract duplicated severity counting** (#9) — quick DRY win.
