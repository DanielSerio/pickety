# Wishlist

## "Architectural Scaffolding" (The pickety init command)

The biggest barrier to entry for architectural tools is writing the initial config.

- The Value: A command that scans the src folder, identifies common folder patterns (like features, components, hooks), and generates a draft pickety.json.
- The Effort: Medium/Low. You already have the discoverFiles logic in the CLI. You would just need a heuristic to group top-level folders into a suggested modules object.

## "Barrel" File Enforcement (Public API)

Many projects use index.ts files (barrels) to export a clean API.

- The Value: Enforcing that if a module has an index.ts, other modules must import from that index.ts and cannot "reach inside" to private files (e.g., import { x } from 'features/auth/utils/secret').
- The Effort: High. Robust path resolution and module-root detection across platforms is complex.
- Unique Twist: Native enforcement without needing complex ESLint setup.

## "Production Telemetry" (Opt-in crash reporting)

Moving beyond local logs to a cloud-based provider.

- The Value: Detecting silent extension crashes across different OS/Node versions and understanding which features (Diagrams vs Health vs Impact) are actually used.
- The Effort: Medium. Requires setting up a backend (AppInsights/Sentry) and ensuring strict compliance with VS Code's telemetry privacy settings.

## CLI Parity ("init" command)

The CLI is currently for checking, but not for bootstrapping.

- The Value: Supporting "Headless" setup or developers who prefer CLI-first workflows.
- The Effort: Low. Most logic is already in `src/commands/init.ts` and just needs to be adapted for a terminal-friendly `fs` write without `vscode` dependencies.
