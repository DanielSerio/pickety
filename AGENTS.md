# Repository Guidelines

## Project Structure & Module Organization
- `src/core/` holds the analysis engine and should stay free of VS Code dependencies.
- `src/extension/`, `src/commands/`, and `src/vscode/` wire the core into the extension UI and commands.
- `src/cli/` contains the CLI entry point and formatters.
- `src/services/` and `src/shared/` provide reusable services and utilities.
- `src/test/` contains tests; core tests live in `src/test/core/`.
- `resources/` stores assets and the `pickety.json` schema; `fixtures/` holds test workspaces; `docs/` contains product docs.
- `out/` is generated build output. Do not edit it directly.

## Build, Test, and Development Commands
- `npm run watch` rebuilds the extension bundle on changes for local dev.
- `npm run build` bundles the extension to `out/extension.js`.
- `npm run build:cli` bundles the CLI to `out/cli.js`.
- `npm run type-check` runs `tsc` with `--noEmit`.
- `npm run lint` runs ESLint on `src/`.
- `npm test` runs the VS Code extension test suite.
- `npm run test:fixture` runs all tests against the `fixtures/next-ddd` workspace.
- `npm run test:core` compiles and runs Mocha tests in `out/test/core/**/*.test.js`.

## Coding Style & Naming Conventions
- TypeScript is in strict mode; avoid `any`.
- Use 2-space indentation and semicolons, matching existing files.
- ESLint is authoritative. Import names should be `camelCase` or `PascalCase`.
- Prefix intentionally unused variables with `_` to satisfy the lint rules.

## Testing Guidelines
- Tests use Mocha with the TDD interface (`suite` / `test`).
- Test files are named `*.test.ts` under `src/test/**`.
- For core changes, run `npm run test:core`. For extension behavior, use `npm test` or `F5` in VS Code for manual validation.

## Commit & Pull Request Guidelines
- Commit messages follow a lightweight convention such as `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`. Release bumps appear as bare version tags (e.g., `0.2.3`).
- Keep commits and PRs focused on one concern.
- PRs should include a clear description of what/why, link related issues, and include screenshots for UI changes.
- Run `npm run lint`, `npm run type-check`, and relevant tests before opening a PR.

## Agent Notes
- Keep architecture logic in `src/core/`; extension-specific behavior belongs in `src/extension/`, `src/commands/`, or `src/vscode/`.
- Avoid touching `out/` and `node_modules/` in review changes.