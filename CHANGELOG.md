# Change Log

All notable changes to the "pickety" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.2.0] - 2026-02-26

### Changed

- **Validation now triggers on file save instead of on every keystroke.** Replaces the `onDidChangeTextDocument` listener and 300ms debounce timer with `onDidSaveTextDocument`, reducing unnecessary analysis cycles and diagnostic noise while editing.
- **Missing `pickety.json` is no longer an error.** `loadConfig` returns `{ ok: true, config: undefined }` when no config file exists. The CLI exits cleanly with a message and the VS Code extension silently skips validation, making pickety safe to enable in any workspace.
- **Mermaid diagram layout overhauled.** Diagrams now render a unified clustered graph instead of one subgraph per rule. Modules are grouped by top-level path segment, nodes display inline health metrics, and `only` constraints use thicker edges for visual distinction.

### Fixed

- **tsconfig path aliases with bare `*` replacements failed to resolve.** Aliases like `"@/*": "./*"` where the replacement value is `"*"` or lacks a trailing `/*` now resolve correctly.

### Added

- **Fixture-based integration test suite.** Tests run against a real `fixtures/next-ddd` project, validating config loading, alias resolution, and boundary checking end-to-end.
- **Regression test for `containedTo` with `unless` and `@/*` aliasing.** Reproduces the myco-log scenario with cross-feature violations, same-feature imports, and `unless` exemptions.

## [0.1.4] - 2026-02-24

### Added

- **`containedTo` object form with `unless` exemptions.** `containedTo` now accepts either a plain string (existing behaviour, unchanged) or an object with a `path` property and an optional `unless` map. `unless` skips the containment rule when all specified `$variable` values match simultaneously (AND semantics), making it easy to exempt a shared module from a feature-scoping rule without a second allow rule. Example:
  ```json
  {
    "imports": "features/$name/components/**/*",
    "containedTo": {
      "path": "features/$name/**/*",
      "unless": { "$name": "shared" }
    }
  }
  ```
- **Config validation for `unless`.** Reports an error if `unless` is an empty object, if its keys do not start with `$`, or if `imports` contains no variables (making `unless` meaningless).
- **JSON schema updated.** `containedTo` now has full autocomplete and inline documentation for both the string and object forms.

## [0.1.3] - 2026-02-24

### Fixed

- **Interpolation rules with `**` in the `imports` pattern were silently skipped.** `captureVariablesFromPath` computed the maximum starting offset as `pathSegments.length - patternSegments.length`. Because `**` counts as one pattern segment but can match zero path segments, this produced an offset of zero whenever path and pattern had equal segment counts — causing the match to fail immediately and the rule to be ignored with no error. The fix counts only non-`**` segments toward the minimum, so the correct starting offsets are tried. Rules such as `{ imports: "features/$name/components/**/*", containedTo: "features/$name/**/*" }` now enforce correctly.

## [0.1.0] - 2026-02-21

### Added

- Initial production-ready release.
- **Impact Analysis**: Visualize transitive dependents of any file to understand the scope of changes.
- **Module Health Metrics**: Track coupling (Ca/Ce), instability, and dependency depth for every module in your project.
- **Health Thresholds**: Set project-wide quality standards for module coupling and depth in `pickety.json`.
- **Large Workspace Performance**: Automatic speed-guarded analysis for repositories with 5,000+ files.
- **Opt-in Telemetry**: Automated error reporting that respects VS Code user privacy settings.
- **Pre-commit Integration**: New guide for blocking architectural debt before it hits Git.
- **Configuration Versioning**: Support for `version` field in `pickety.json` to ensure future-proof migrations.
- Real-time boundary enforcement for TypeScript.
- Interpolation variables for scoped rules.
- `only` and `containedTo` strict enforcement.
- Automatic Mermaid diagram generation.
- CLI for CI/CD integration (`pickety check`).
- Debt tracking via `maxViolations`.
- JSON schema for `pickety.json` autocomplete.
- **Improved Security**: Implemented Content Security Policy for all webview panels.
