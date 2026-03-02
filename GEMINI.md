# Pickety

Pickety is a high-performance architectural enforcement engine for TypeScript projects. It enforces import boundaries in real time through a VS Code extension and provides a CLI for CI/CD integration.

## Project Overview

- **Purpose:** Enforce module boundaries and architectural rules (e.g., "features shouldn't import other features") directly in the editor and CLI.
- **Core Stack:** TypeScript, Node.js, VS Code Extension API.
- **Key Features:** 
  - Real-time boundary enforcement using glob patterns.
  - Interpolation variables for scoped rules (e.g., `routes/$name` -> `features/$name`).
  - `only` and `containedTo` rules for exclusive module access and private file isolation.
  - Debt tracking via `maxViolations` thresholds.
  - Automatic Mermaid diagram generation for architecture visualization.
  - Path alias support (`tsconfig.json`).

## Architecture

The project is split into a shared core and two entry points:
- `src/core/`: The platform-agnostic enforcement engine.
  - `boundaries.ts`: Main rule evaluation logic.
  - `imports.ts`: Regex-based import extraction and path resolution.
  - `config.ts`: `pickety.json` loading and validation (supports JSONC).
  - `diagram.ts`: Mermaid diagram generation.
- `src/extension.ts`: VS Code extension entry point, handling diagnostics, status bar, and workspace events.
- `src/cli.ts`: CLI entry point (`pickety check`) for CI pipelines.

## Development

### Key Commands

- **Build Extension:** `npm run build` (uses `esbuild` to `out/extension.js`)
- **Build CLI:** `npm run build:cli` (to `out/cli.js`)
- **Watch Mode:** `npm run watch` (rebuilds extension on change)
- **Type Check:** `npm run type-check`
- **Lint:** `npm run lint`
- **Core Tests:** `npm run test:core` (Mocha tests for the enforcement engine)
- **Extension Tests:** `npm test` (VS Code integration tests)

### Configuration

The project is configured via `pickety.json` in the workspace root. It uses `jsonc-parser`, so comments and trailing commas are supported. The schema is defined in `src/pickety.schema.json`.

## Conventions

- **Modular Core:** Keep enforcement logic in `src/core` and avoid platform-specific (VS Code) dependencies there to ensure CLI compatibility.
- **Performance:** Import extraction uses optimized regex; avoid adding heavy AST parsers unless absolutely necessary.
- **Testing:** 
  - New logic in `src/core` must have corresponding tests in `src/test/core/`.
  - Extension behavior changes should be verified with integration tests in `src/test/extension.test.ts`.
- **Imports:** Prefer literal union types over enums (as per global context).
- **Dependencies:** Keep external dependencies minimal (currently uses `minimatch` and `jsonc-parser`).
- **Functions:** Avoid more than 3 arguments per function.
