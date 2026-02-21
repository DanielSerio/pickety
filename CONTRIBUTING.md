# Contributing to Pickety

Thanks for your interest in contributing to Pickety! This guide will help you get set up and submit your first pull request.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [VS Code](https://code.visualstudio.com/)
- [Git](https://git-scm.com/)

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:

   ```bash
   git clone https://github.com/<your-username>/pickety.git
   cd pickety
   ```

3. **Install dependencies:**

   ```bash
   npm install
   ```

4. **Start the dev watcher:**

   ```bash
   npm run watch
   ```

5. **Open the project in VS Code** and press `F5` to launch the Extension Development Host.

## Available Scripts

| Script              | Description                            |
| ------------------- | -------------------------------------- |
| `npm run watch`     | Rebuild the extension on file changes  |
| `npm run build`     | Production build of the extension      |
| `npm run build:cli` | Production build of the CLI            |
| `npm run lint`      | Run ESLint                             |
| `npm run type-check`| Run the TypeScript compiler (no emit)  |
| `npm run test:core` | Run the core test suite (Mocha)        |

## Project Structure

```
src/
├── core/           # The analysis engine (boundaries, graph, health, imports)
├── commands/       # VS Code command implementations
├── cli/            # CLI entry point and formatters
├── test/           # Tests (Mocha, TDD interface)
├── extension.ts    # VS Code extension activation
├── cli.ts          # CLI entry point
└── types.ts        # Shared type definitions
```

- **`src/core/`** is the heart of Pickety. It has no VS Code dependencies and can be tested independently.
- **`src/commands/`** and the other top-level files wire the core engine into VS Code.
- **`src/cli/`** wires the core engine into the CLI.

## Development Workflow

1. Create a branch from `main`:

   ```bash
   git checkout -b my-change
   ```

2. Make your changes. Keep commits focused on a single concern.
3. Run the checks before pushing:

   ```bash
   npm run lint && npm run type-check && npm run test:core
   ```

4. Push your branch and open a pull request against `main`.

## Code Style

- **TypeScript strict mode** is enabled. Do not use `any`.
- **ESLint** is enforced in CI. Run `npm run lint` to catch issues early.
- Follow existing patterns in the codebase. When in doubt, match the style of the file you're editing.
- Keep functions small and focused. Comment non-obvious logic.

## Testing

Tests use [Mocha](https://mochajs.org/) with the TDD interface (`suite` / `test`).

```bash
npm run test:core
```

If you're adding a new core feature, add tests in `src/test/core/`. For VS Code-specific behavior, manual testing via the Extension Development Host (`F5`) is usually sufficient.

## Pull Request Guidelines

- **One concern per PR.** Bug fix? Feature? Refactor? Keep them separate.
- **Describe what and why** in the PR description. Link any related issues.
- **CI must pass.** Lint, type-check, and tests all run automatically.
- **Keep changes minimal.** Avoid unrelated reformatting or refactoring.

## Reporting Bugs

Use the [Bug Report](https://github.com/DanielSerio/pickety/issues/new?template=bug_report.md) issue template. Include steps to reproduce, expected vs. actual behavior, and your environment details.

## Requesting Features

Use the [Feature Request](https://github.com/DanielSerio/pickety/issues/new?template=feature_request.md) issue template. Describe the problem you're trying to solve and any alternatives you've considered.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
