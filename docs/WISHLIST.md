# Wishlist

## "Architectural Scaffolding" (The pickety init command)

Status: Not implemented. CLI init exists but does not scan project structure.

The biggest barrier to entry for architectural tools is writing the initial config.

- The Value: A command that scans the src folder, identifies common folder patterns (like features, components, hooks), and generates a draft pickety.json.
- The Effort: Medium/Low. You already have the discoverFiles logic in the CLI. You would just need a heuristic to group top-level folders into a suggested modules object.

## Config Templates for Init

Status: Partially implemented in 0.3.0 with presets (hexagonal, feature-modules, layered). Additional templates and selection UI are still open.

The init command currently generates a single generic starter config. Offering curated templates for common architectures would make onboarding faster and more opinionated.

- The Value: Users select a template (e.g., Feature-Sliced Design, Onion/Clean Architecture, Next.js App Router, Monorepo) during init and get a fully-formed `pickety.json` with modules, rules, and boundary diagrams pre-configured for that pattern. Reduces the "blank page" problem and teaches best practices by example.
- The Effort: Low. The init command already writes a `pickety.json` — this adds a template selection step and a set of JSON template files. No new core logic required.

## "Barrel" File Enforcement (Public API)

Many projects use index.ts files (barrels) to export a clean API.

- The Value: Enforcing that if a module has an index.ts, other modules must import from that index.ts and cannot "reach inside" to private files (e.g., import { x } from 'features/auth/utils/secret').
- The Effort: High. Robust path resolution and module-root detection across platforms is complex.
- Unique Twist: Native enforcement without needing complex ESLint setup.

## "Production Telemetry" (Opt-in crash reporting)

Moving beyond local logs to a cloud-based provider.

- The Value: Detecting silent extension crashes across different OS/Node versions and understanding which features (Diagrams vs Health vs Impact) are actually used.
- The Effort: Medium. Requires setting up a backend (AppInsights/Sentry) and ensuring strict compliance with VS Code's telemetry privacy settings.

