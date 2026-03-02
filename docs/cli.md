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

#### JSON output shape

`--format json` emits a single JSON object:

```jsonc
{
  "violations": [
    {
      "file": "src/features/auth/service.ts",
      "message": "Features should not import other features directly",
      "ruleName": "no-cross-feature",
      "ruleGroup": "isolation",
      "sourceModule": "features[auth]",
      "targetModule": "features[billing]",
      "severity": "error"
    }
  ],
  "cycles": [
    ["src/a.ts", "src/b.ts", "src/a.ts"]
  ],
  "summary": {
    "errors": 3,
    "warnings": 1,
    "cycles": 1
  },
  "groups": {
    "isolation": { "errors": 2, "warnings": 0 },
    "layer-order": { "errors": 1, "warnings": 1 }
  }
}
```

`cycles` is an array of paths — each path is an ordered list of files that form the cycle, with the starting file repeated at the end. `groups` is only present when at least one rule has a `group` field set.

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
