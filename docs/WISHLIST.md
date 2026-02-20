# Wishlist

## Module-Level Circular Dependency Detection

ESLint plugins often struggle with circular dependencies because they check file-to-file. Since Pickety already maps files to high-level modules, it can detect "Architectural Loops."

- The Value: Preventing Feature A from importing Feature B while Feature B imports Feature A. This is the #1 cause of "spaghetti architecture."
- The Effort: Low. You already have the module graph for the Mermaid diagram. You simply need to run a Cycle Detection algorithm (like Tarjan’s or a simple DFS) on the module names after a scan.
- Unique Twist: Unlike madge or other tools that show file-level cycles, Pickety would report Module Cycles (e.g., "Circular dependency detected: Features -> Services -> Features").

## "Architectural Scaffolding" (The pickety init command)

The biggest barrier to entry for architectural tools is writing the initial config.

- The Value: A command that scans the src folder, identifies common folder patterns (like features, components, hooks), and generates a draft pickety.json.
- The Effort: Medium/Low. You already have the discoverFiles logic in the CLI. You would just need a heuristic to group top-level folders into a suggested modules object.

## Interactive "Allow" Quick-Fix

When a developer (or an AI agent) creates a violation, they currently have to manually open pickety.json.

- The Value: A VS Code Quick Fix (Lightbulb) that says "Allow this boundary in pickety.json."
- The Effort: Low. You already have PicketyCodeActionProvider. Instead of just "Go to Rule," you could add an action that programmatically appends a new rule to the rules array in pickety.json using the
  jsonc-parser you're already using.

## "Barrel" File Enforcement (Public API)

Many projects use index.ts files (barrels) to export a clean API.

- The Value: Enforcing that if a module has an index.ts, other modules must import from that index.ts and cannot "reach inside" to private files (e.g., import { x } from 'features/auth/utils/secret').
- The Effort: Low. You already resolve the targetRelativePath. You just need a rule flag like "forceBarrel": true which validates that if the target module has an index.ts, the import specifier must end
  at the module root.

## "Private" File Enforcement (Internal Exports)

TypeScript currently has no way to say "this file is only for use inside this folder."

- The Value: Enforcing that features/auth/internal-helper.ts can never be imported by anything outside of features/auth/\*, even if the auth module itself is allowed to be imported.
- The Effort: Very Low. This is a specialized version of your existing rule engine. You could add a reserved module naming convention (e.g., any file matching **/internal/** or \*.internal.ts) that
  automatically adds a "deny" rule for any importer not in the same directory.
