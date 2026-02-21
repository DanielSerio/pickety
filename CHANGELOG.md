# Change Log

All notable changes to the "pickety" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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
