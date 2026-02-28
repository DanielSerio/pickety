# pickety.json Configuration

Pickety uses a `pickety.json` file in the workspace root to define module boundaries. When this file is present, the extension activates and enforces import rules on save.

## Structure

```jsonc
{
  "version": "0.3.0",
  "preset": "layered",
  "modules": { ... },
  "rules": {
    "module-boundaries": { ... }
  },
  "warnOnUntrackedImporters": true,
  "boundary-diagrams": true,
  "health": { ... }
}
```

## `version`

Optional schema version marker for future migrations. It is currently informational.

## `preset`

Use a built-in preset to bootstrap a config. Presets define `modules` and `rules` which are merged with any overrides in your file.

Available presets are `hexagonal`, `feature-modules`, and `layered`.

```json
{
  "preset": "layered",
  "modules": {
    "app": "src/app/**/*"
  }
}
```

When both preset and overrides are provided, preset rules are appended to your rules and preset modules are merged with yours. You can also specify only `preset` and omit `modules` and `rules`.

## `modules`

A registry of named modules mapped to glob patterns. Each entry assigns a name to a set of files.

```json
{
  "modules": {
    "features": "src/features/*",
    "components": "src/components/**/*",
    "app": "src/app/**/*",
    "utils": "src/utils/**/*"
  }
}
```

**Pattern expansion:** Patterns ending with `/*` are automatically expanded to `/**/*` for deep matching. So `"src/features/*"` matches files in any subdirectory of `src/features/`.

**Module matching:** Each file is matched against patterns in order. A file belongs to the **first** module whose pattern matches its path relative to the workspace root.

**Module instances:** Patterns may include `$variable` placeholders. When a file matches, the captured values are appended to the module name for rule matching and diagnostics, for example `features[auth]`.

```json
{
  "modules": {
    "features": "src/features/$name/**"
  }
}
```

## `rules.module-boundaries`

Defines which modules are allowed or forbidden from importing each other.

```json
{
  "rules": {
    "module-boundaries": {
      "severity": "error",
      "rules": [
        {
          "importer": "features",
          "imports": "features",
          "message": "Features should not import other features directly"
        }
      ]
    }
  }
}
```

### `severity`

`"error"` or `"warn"` — controls how violations appear in the editor. Defaults to `"error"`.

| Value     | Appearance       |
| --------- | ---------------- |
| `"error"` | Red underline    |
| `"warn"`  | Yellow underline |

### `rules[]`

An array of boundary rules. Each rule has:

| Field         | Type               | Required    | Description                                                                                      |
| ------------- | ------------------ | ----------- | ------------------------------------------------------------------------------------------------ |
| `imports`     | `string \| string[]` | Yes       | Target module name(s), glob pattern(s), or file path glob(s). Any match triggers the rule.       |
| `importer`    | `string`           | Conditional | Source module name or glob pattern. Required unless `containedTo` is set.                        |
| `allow`       | `boolean`          | No          | `true` to permit the import, `false` to forbid it. Defaults to `false`.                          |
| `only`        | `boolean`          | No          | `true` = the `imports` target can **only** be used by this `importer`. Everyone else is blocked. |
| `containedTo` | `string \| object` | No          | Shortcut for `only: true`. See [Strict Containment](#strict-containment-only--containedto).      |
| `exports`     | `object \| object[]` | No         | Allowlist exceptions for `only`/`containedTo`. See [Exports](#exports).                          |
| `message`     | `string`           | No          | Custom message shown in the diagnostic                                                           |
| `severity`    | `string`           | No          | `"error"` or `"warn"`. Overrides the rule-set severity for this rule only.                       |
| `name`        | `string`           | No          | Rule identifier shown in diagnostics and quick-fix labels.                                       |
| `group`       | `string`           | No          | Group label shown in diagnostics and used for CLI summaries.                                     |
| `maxViolations` | `integer`        | No          | Violations at or below this count are downgraded to `warn`. Useful for gradual adoption.         |

Both `importer` and `imports` support glob patterns via [minimatch](https://github.com/isaacs/minimatch), so you can write rules like `"*"` (all modules) or `"feature-*"` (any module starting with `feature-`).

### File path patterns in `imports`

When `imports` contains a `/`, it is matched against the resolved file's path relative to the workspace root. This lets you target specific subdirectories within a module.

For example, `"features/**/components"` matches any file under a `components` folder inside any feature:

```json
{
  "importer": "routes",
  "imports": "features/**/components",
  "message": "Routes cannot import feature components directly"
}
```

This would flag an import like `import { Button } from '../features/auth/components/Button'`.

### Multiple import targets

You can provide a list of `imports` patterns instead of repeating rules:

```json
{
  "importer": "routes",
  "imports": ["features/**/components", "features/**/schemas"],
  "message": "Routes cannot import feature components or schemas directly"
}
```

### Interpolation variables

Use `$variable` placeholders to enforce that a captured path segment is consistent between `importer` and `imports`. Variables are prefixed with `$` and can contain letters, numbers, and hyphens (e.g., `$name`, `$route-name`).

The behavior depends on `allow`:

**`allow: true` — enforce matching.** Imports that target the general pattern must match the specific interpolated pattern.

```json
{
  "importer": "routes/$name/*",
  "imports": "features/$name/pages/*",
  "allow": true,
  "message": "Routes must import pages from their matching feature"
}
```

With this rule, `routes/auth/index.ts` can import from `features/auth/pages/*` but NOT from `features/billing/pages/*`.

**`allow: false` (default) — deny matching.** Imports matching the interpolated pattern are forbidden.

```json
{
  "importer": "routes/$name/*",
  "imports": "features/$name/hooks/*"
}
```

With this rule, `routes/auth/index.ts` cannot import from `features/auth/hooks/*`.

## Strict Containment (`only` & `containedTo`)

Standard rules are "blacklist" style — they forbid specific connections. `only` and `containedTo` are "whitelist" style — they forbid **everyone else** from importing a target.

### `only`

```json
{
  "importer": "services",
  "imports": "repositories",
  "only": true,
  "message": "Repositories can only be used by the Service layer"
}
```

### `containedTo`

`containedTo` is a shortcut for `only: true` that works well with interpolation variables, letting you express "this pattern is private to its owner" in a single rule.

**String form:**

```json
{
  "imports": "src/features/$name/internal/*",
  "containedTo": "src/features/$name/**/*",
  "message": "Internal files cannot be imported outside their feature"
}
```

**Object form** — adds an `unless` map to exempt specific variable values from the restriction. All entries in `unless` must match simultaneously (AND semantics).

```json
{
  "imports": "features/$name/components/**/*",
  "containedTo": {
    "path": "features/$name/**/*",
    "unless": { "$name": "shared" }
  },
  "message": "Features components must be imported by their own feature."
}
```

With this rule, `features/auth/components/LoginForm.tsx` can only be imported by files inside `features/auth/**/*`. But `features/shared/components/**/*` is exempt — any module may import from the shared feature.

#### `unless` validation

Pickety will report a configuration error if:

- `unless` is an empty object `{}` (meaningless — no variable to match against)
- `unless` keys do not start with `$` (they must be variable references)
- `unless` is present but `imports` contains no `$variable` (nothing to capture)

## `exports`

`exports` defines allowlist exceptions for `only` or `containedTo`. Each export entry specifies a `path` to allow and a `to` pattern that is allowed to import it.

```json
{
  "imports": "features/$name/**",
  "containedTo": "features/$name/**",
  "exports": {
    "path": "features/$name/pages/**",
    "to": "app",
    "message": "Only feature pages are public to the app."
  }
}
```

## `boundary-diagrams`

Automatically generate a [Mermaid](https://mermaid.js.org/) diagram of your module boundaries when the config is saved or via the **Pickety: Generate Boundary Diagram** command.

- `true`: Writes to `picket-boundaries.mermaid` in the workspace root.
- `"path/to/file.mermaid"`: Writes to a custom relative path.

## `warnOnUntrackedImporters`

When `true` (default), Pickety emits an **info** diagnostic if a file does not match any module in `modules`. These files bypass all import rules.

```json
{
  "warnOnUntrackedImporters": false
}
```

## `health`

Configure project-wide quality standards. Violations appear as diagnostics on the `pickety.json` file.

| Field                 | Type      | Description                           |
| --------------------- | --------- | ------------------------------------- |
| `maxAfferentCoupling` | `integer` | Maximum incoming dependencies (Ca).   |
| `maxEfferentCoupling` | `integer` | Maximum outgoing dependencies (Ce).   |
| `maxInstability`      | `number`  | Maximum `Ce / (Ca + Ce)` ratio (0-1). |
| `maxDepth`            | `integer` | Maximum dependency chain depth.       |

```json
{
  "health": {
    "maxInstability": 0.5,
    "maxDepth": 3
  }
}
```

## Full Example

```json
{
  "modules": {
    "app": "src/app/**/*",
    "features": "src/features/*",
    "components": "src/components/**/*",
    "hooks": "src/hooks/**/*",
    "utils": "src/utils/**/*"
  },
  "rules": {
    "module-boundaries": {
      "severity": "error",
      "rules": [
        {
          "importer": "features",
          "imports": "features",
          "message": "Features should not import other features directly"
        },
        {
          "importer": "components",
          "imports": "features",
          "message": "Components should not depend on features"
        },
        {
          "importer": "utils",
          "imports": "*",
          "message": "Utils should not import from application modules"
        },
        {
          "importer": "routes",
          "imports": "features/**/components",
          "message": "Routes cannot import feature components directly"
        }
      ]
    }
  },
  "boundary-diagrams": "docs/architecture.mermaid",
  "health": {
    "maxInstability": 0.8,
    "maxDepth": 5
  }
}
```

This configuration enforces:

- **Feature isolation** — features cannot import from each other
- **Dependency direction** — shared components cannot reach into features
- **Utility purity** — utils remain dependency-free
