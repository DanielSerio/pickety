# Pickety CLI

Pickety ships with a CLI for CI, pre-commit hooks, and local checks.

## Commands

```bash
pickety check [--root <path>] [--format <text|json>] [--verbose]
pickety impact <file> [--root <path>] [--verbose]
pickety health [--root <path>] [--verbose]
pickety init [--root <path>] [--preset <name>]
```

### `check`

Scans all known files for boundary violations and circular dependencies.

```bash
pickety check
pickety check --format json
pickety check --root ./packages/web
```

Use `--verbose` to log unreadable files.

```bash
pickety check --verbose
```

### `impact`

Shows direct and transitive dependents of a target file.

```bash
pickety impact src/features/auth/service.ts
```

Use `--verbose` to log unreadable files.

```bash
pickety impact src/features/auth/service.ts --verbose
```

### `health`

Prints module health metrics and validates configured thresholds.

```bash
pickety health
```

Use `--verbose` to log unreadable files.

```bash
pickety health --verbose
```

### `init`

Creates a starter `pickety.json` in the workspace root.

```bash
pickety init
pickety init --preset layered
```

Available presets are `hexagonal`, `feature-modules`, and `layered`.

## CI Example (GitHub Actions)

```yaml
name: CI
on: [push, pull_request]
jobs:
  pickety:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx pickety check --format json
```

For local enforcement, see `docs/pre-commit.md`.
