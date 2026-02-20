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
