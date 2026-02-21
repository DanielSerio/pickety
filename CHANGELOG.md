# Change Log

All notable changes to the "pickety" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.0] - 2026-02-21

### Added

- Initial production-ready release.
- **Impact Analysis**: Visualize transitive dependents of any file to understand the scope of changes.
- **Module Health Metrics**: Track coupling (Ca/Ce), instability, and dependency depth for every module in your project.
- **Health Thresholds**: Set project-wide quality standards for module coupling and depth in `pickety.json`.
- Real-time boundary enforcement for TypeScript.
- Interpolation variables for scoped rules.
- `only` and `containedTo` strict enforcement.
- Automatic Mermaid diagram generation.
- CLI for CI/CD integration (`pickety check`).
- Debt tracking via `maxViolations`.
- JSON schema for `pickety.json` autocomplete.
