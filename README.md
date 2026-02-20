# Pickety

Architectural enforcement for TypeScript projects. Pickety is a VS Code extension that catches illegal imports in real time — red and yellow squiggles appear the moment a boundary is crossed.

## Why

Large TypeScript codebases develop implicit rules: features shouldn't import other features, utilities shouldn't reach into the app layer, routes should only use their own feature's pages. These rules live in developers' heads and break silently. Pickety makes them explicit and enforced.

This is especially useful when working with AI coding agents. Agents are fast but don't know your architecture. Pickety keeps them on rails by flagging boundary violations as they write code, not after a review cycle.

## Getting Started

1. Install the extension in VS Code.
2. Create a `pickety.json` in your workspace root:

```json
{
  "modules": {
    "features": "src/features/*",
    "components": "src/components/**/*",
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
        }
      ]
    }
  }
}
```

3. Pickety activates automatically when `pickety.json` is present. Violations appear as diagnostics in the editor and Problems panel.

## Configuration

### Modules

Map names to file glob patterns. Each file belongs to the first module whose pattern matches.

```json
{
  "modules": {
    "features": "src/features/*",
    "components": "src/components/**/*",
    "hooks": "src/hooks/**/*",
    "utils": "src/utils/**/*"
  }
}
```

Patterns ending with `/*` are automatically expanded to `/**/*` for deep matching.

### Rules

Each rule defines an import restriction between modules.

| Field      | Type      | Required | Description                                    |
| ---------- | --------- | -------- | ---------------------------------------------- |
| `importer` | `string`  | Yes      | Source module name or glob pattern              |
| `imports`  | `string`  | Yes      | Target module name, glob, or file path pattern  |
| `allow`    | `boolean` | No       | `true` = permit, `false` = forbid (default)     |
| `message`  | `string`  | No       | Custom diagnostic message                      |

### Glob Patterns

Both `importer` and `imports` support glob patterns via [minimatch](https://github.com/isaacs/minimatch):

```json
{ "importer": "*", "imports": "utils", "message": "Nothing should import utils (it's internal)" }
```

When `imports` contains a `/`, it matches against the resolved file's relative path, letting you target subdirectories within a module:

```json
{ "importer": "routes", "imports": "features/**/components", "message": "Routes cannot import feature components" }
```

### Interpolation Variables

Use `$variable` placeholders to enforce that path segments match between importer and target:

```json
{
  "importer": "routes/$name/*",
  "imports": "features/$name/pages/*",
  "allow": true,
  "message": "Routes must import pages from their matching feature"
}
```

With this rule, `routes/auth/index.ts` can import from `features/auth/pages/` but not from `features/billing/pages/`.

With `allow: false` (default), the interpolated pattern is denied instead:

```json
{
  "importer": "routes/$name/*",
  "imports": "features/$name/hooks/*"
}
```

This prevents `routes/auth/index.ts` from importing `features/auth/hooks/` internals.

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
          "message": "Shared components should not depend on features"
        },
        {
          "importer": "utils",
          "imports": "*",
          "message": "Utils must remain dependency-free"
        },
        {
          "importer": "routes/$name/*",
          "imports": "features/$name/pages/*",
          "allow": true,
          "message": "Routes must use pages from their matching feature"
        }
      ]
    }
  }
}
```

This enforces:
- **Feature isolation** -- features cannot import from each other
- **Dependency direction** -- shared components can't reach into features
- **Utility purity** -- utils have no application-layer dependencies
- **Scoped routing** -- each route only accesses its own feature's pages

## Detailed Configuration Reference

See [pickety.json documentation](docs/pickety-json.md) for the full configuration reference.
