# Change Log

All notable changes to the "pickety" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.4.0] - 2026-03-02

### Added

- **CLI `health` command.** `pickety health` prints a formatted table of module health metrics — afferent coupling (Ca), efferent coupling (Ce), instability, and dependency depth — with threshold violations annotated inline.
- **CLI `impact` command.** `pickety impact <file>` shows all files and modules that transitively depend on the given file, grouped by module.
- **`--format` flag for `check` command.** `pickety check --format json` emits a machine-readable report including cycles, a violation summary, and violations grouped by rule name/group. `--format text` (default) adds group summary blocks to the existing output.
- **Circular dependency detection.** The workspace graph now identifies cycles across the module-level dependency graph and includes them in both CLI JSON output and VS Code diagnostics.
- **Violation metadata.** `Violation` objects now carry `ruleName`, `ruleGroup`, `sourceModule`, and `targetModule` fields, enabling richer grouping and filtering in downstream tooling.

### Changed

- **BFS in `graph.ts` is now O(n).** Replaced `Array.shift()` in the transitive-dependents BFS loop with index-based iteration, eliminating quadratic behaviour for large graphs.
- **`validateBoundaryRules()` split into per-property validators.** The monolithic function in `validationRules.ts` is now composed of focused helpers, one per rule property.
- **`buildMermaidContent()` split into helper functions.** Node rendering, edge rendering, and health-metric overlays are now separate functions in `diagram.ts`.
- **Path traversal check uses `path.relative()`.** The diagram output path safety check now uses `path.relative()` instead of a string prefix comparison, correctly handling symlinks and trailing slashes.

### Fixed

- **Parse errors in `buildImportGraph()` are now surfaced.** Previously, file parse failures during graph construction were silently skipped unless `--verbose` was passed; they are now always reported to the CLI output.
- **Read errors in `handleExternalChange()` are now logged.** Failures to read an externally modified file are emitted to the VS Code output channel instead of being swallowed silently.

## [0.3.0] - 2026-02-28

### Added

- **Architecture presets.** New built-in presets (`hexagonal`, `feature-modules`, `layered`) can bootstrap modules and boundary rules via a top-level `preset` key in `pickety.json`.
- **CLI init with presets.** `pickety init --preset <name>` scaffolds a `pickety.json` using a preset.
- **JSON schema support for `preset`.** Autocomplete and validation now include preset options.
- **Preset tests.** Added coverage for preset merging and CLI initialization behavior.

### Changed

- **Preset-aware config loading.** When `preset` is provided, preset defaults are merged with user overrides, and preset rules are appended to custom rules.

## [0.2.0] - 2026-02-26

### Changed

- **Validation now triggers on file save instead of on every keystroke.** Replaces the `onDidChangeTextDocument` listener and 300ms debounce timer with `onDidSaveTextDocument`, reducing unnecessary analysis cycles and diagnostic noise while editing.
- **Missing `pickety.json` is no longer an error.** `loadConfig` returns `{ ok: true, config: undefined }` when no config file exists. The CLI exits cleanly with a message and the VS Code extension silently skips validation, making pickety safe to enable in any workspace.
- **Mermaid diagram layout overhauled.** Diagrams now render a unified clustered graph instead of one subgraph per rule. Modules are grouped by top-level path segment, nodes display inline health metrics, and `only` constraints use thicker edges for visual distinction.

### Fixed

- **tsconfig path aliases with bare `*` replacements failed to resolve.** Aliases like `"@/*": "./*"` where the replacement value is `"*"` or lacks a trailing `/*` now resolve correctly.
- **`only` rules not enforced when alias collapsed to bare `*`.** `path.join` normalized `"./*"` to `"*"`, causing aliased imports (e.g. `@/features/batch/pages/BatchPage`) to resolve as absolute paths and bypass `only` rule checks. The alias prefix replacement now correctly preserves the `./` relative prefix.
- **Hardcoded local path in `launch.json`.** Removed a debug launch configuration that pointed to a machine-specific directory.
- **New files not discovered until editor reload.** Restored the `fileWatcher.onDidCreate` handler so newly created source files are immediately added to the known file set.

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
