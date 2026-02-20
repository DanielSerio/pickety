# pickety.json Configuration

Pickety uses a `pickety.json` file in the workspace root to define module boundaries. When this file is present, the extension activates and enforces import rules in real time.

## Structure

```jsonc
{
  "modules": { ... },
  "rules": {
    "module-boundaries": { ... }
  }
}
```

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

| Value     | Appearance              |
| --------- | ----------------------- |
| `"error"` | Red underline           |
| `"warn"`  | Yellow underline        |

### `rules[]`

An array of boundary rules. Each rule has:

| Field      | Type      | Required | Description                                         |
| ---------- | --------- | -------- | --------------------------------------------------- |
| `importer` | `string`  | Yes      | Source module name or glob pattern                   |
| `imports`  | `string`  | Yes      | Target module name, glob pattern, or file path glob  |
| `allow`    | `boolean` | No       | `true` to permit the import, `false` to forbid it. Defaults to `false`. |
| `message`  | `string`  | No       | Custom message shown in the diagnostic               |

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
  }
}
```

This configuration enforces:
- **Feature isolation** — features cannot import from each other
- **Dependency direction** — shared components cannot reach into features
- **Utility purity** — utils remain dependency-free
