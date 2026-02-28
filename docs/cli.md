# Pickety CLI

Pickety ships with a CLI for CI, pre-commit hooks, and local checks.

## Commands

```bash
pickety check [--root <path>] [--format <text|json>]
pickety impact <file> [--root <path>]
pickety health [--root <path>]
```

### `check`

Scans all known files for boundary violations and circular dependencies.

```bash
pickety check
pickety check --format json
pickety check --root ./packages/web
```

### `impact`

Shows direct and transitive dependents of a target file.

```bash
pickety impact src/features/auth/service.ts
```

### `health`

Prints module health metrics and validates configured thresholds.

```bash
pickety health
```

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
