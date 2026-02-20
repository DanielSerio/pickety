# Pickety

**Architectural guardrails for TypeScript projects.**

Pickety is a VS Code extension that enforces import boundaries in real time. Define your module structure once, and every illegal import lights up instantly -- in your editor, as you type.

No CI pipeline. No build step. No review cycle. Just immediate, visual enforcement.

<!--
![Pickety in action](resources/demo.gif)
TODO: Add animated GIF showing a violation appearing as the user types an import
-->

---

## Why Pickety?

Every growing TypeScript codebase develops architectural rules:

- Features shouldn't import other features
- Shared components can't reach into the app layer
- Utilities must remain dependency-free
- Routes should only access their own feature's pages

These rules live in developers' heads and break silently. Pickety makes them **explicit, enforceable, and visible**.

### Built for the AI era

AI coding agents are fast but don't know your architecture. Pickety keeps them on rails -- violations appear the instant an agent writes a bad import, not after a review cycle. Works with Claude Code, GitHub Copilot, Cursor, and any tool that edits files in VS Code.

---

## Features

- **Real-time enforcement** -- violations appear as you type, not just on save
- **Glob patterns** -- flexible module definitions using [minimatch](https://github.com/isaacs/minimatch) syntax
- **Interpolation variables** -- enforce scoped relationships like "route X can only import from feature X"
- **Strict enforcement** -- use `only` and `containedTo` to restrict modules to specific consumers
- **Per-rule severity** -- mark some boundaries as hard errors and others as soft warnings
- **Debt tracking** -- set a `maxViolations` threshold per rule to adopt boundaries gradually in legacy codebases
- **Named rules** -- identify exactly which rule triggered a violation
- **tsconfig.json alias support** -- automatically resolves `@/*` and other path aliases
- **Boundary diagrams** -- auto-generate Mermaid diagrams of your architecture
- **Quick fixes** -- jump directly to the rule in `pickety.json` from any violation
- **Status bar** -- always know whether Pickety is active and how many violations exist
- **CLI** -- `pickety check` for CI/CD pipelines, matching IDE behavior exactly
- **JSON Schema** -- autocomplete and inline validation for `pickety.json`
- **Zero config beyond `pickety.json`** -- no build plugins, no dependencies to manage

---

## Quick Start

**1. Install** the Pickety extension from the VS Code Marketplace.

**2. Create `pickety.json`** in your workspace root:

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
          "name": "no-cross-feature",
          "message": "Features should not import other features directly"
        }
      ]
    }
  }
}
```

**3. Done.** Pickety activates automatically. Violations appear as red/yellow squiggles in the editor, in the Problems panel, and in the status bar.

---

## Configuration

### Modules

Map logical module names to file glob patterns. Each file belongs to the **first** module whose pattern matches.

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

> Patterns ending with `/*` are automatically expanded to `/**/*` for deep matching.

### Rules

Each rule defines an import boundary between modules.

| Field         | Type      | Required | Description                                                 |
| ------------- | --------- | -------- | ----------------------------------------------------------- |
| `imports`     | `string`  | Yes      | Target module name, glob, or file path pattern               |
| `importer`    | `string`  | Conditional| Source module name or glob pattern. Required unless using `containedTo`. |
| `allow`       | `boolean` | No       | `true` = permit, `false` = forbid. Default: `false`         |
| `only`        | `boolean` | No       | `true` = the `imports` target can ONLY be used by this `importer`. |
| `containedTo` | `string`  | No       | Shortcut for `only: true`. Restricts `imports` to this path pattern. |
| `message`     | `string`  | No       | Custom diagnostic message shown in the editor               |
| `severity`    | `string`  | No       | `"error"` or `"warn"`. Overrides the global severity        |
| `name`        | `string`  | No       | Rule identifier. Shown in diagnostics and quick fix labels  |

### Glob Patterns

Both `importer` and `imports` support glob syntax. Use `*` to match all modules:

```json
{ "importer": "utils", "imports": "*", "message": "Utils must remain dependency-free" }
```

When `imports` contains a `/`, it matches against the resolved file's relative path, letting you target subdirectories:

```json
{ "importer": "routes", "imports": "features/**/components", "message": "Routes cannot import feature components" }
```

### Strict Enforcement (`only` & `containedTo`)

Standard rules are "blacklist" style: they forbid specific connections. `only` and `containedTo` are "whitelist" style: they forbid **everyone else** from importing a target.

#### `only`

Use `only` to ensure a module is only consumed by a specific layer:

```json
{
  "importer": "services",
  "imports": "repositories",
  "only": true,
  "message": "Repositories can only be used by the Service layer"
}
```

#### `containedTo`

Use `containedTo` for "private" file patterns that should never leak outside their owner. It is a shortcut for `only: true` where the `importer` is the allowed scope.

```json
{
  "imports": "src/features/$name/internal/*",
  "containedTo": "src/features/$name/**/*",
  "message": "Internal files cannot be imported outside their feature"
}
```

### Interpolation Variables

Use `$variable` placeholders to enforce that path segments match between the importer and the target:

```json
{
  "importer": "routes/$name/*",
  "imports": "features/$name/pages/*",
  "allow": true,
  "message": "Routes must import pages from their matching feature"
}
```

With this rule, `routes/auth/index.ts` can import from `features/auth/pages/` but **not** from `features/billing/pages/`.

---

## Boundary Diagrams

Pickety can auto-generate a [Mermaid](https://mermaid.js.org/) diagram of your module boundaries. Each rule appears as its own section with clear ALLOW/DENY labeling.

Add this to your `pickety.json`:

```json
{
  "boundary-diagrams": true
}
```

Or specify a custom output path:

```json
{
  "boundary-diagrams": "docs/architecture.mermaid"
}
```

You can also generate diagrams on demand via the command palette: **Pickety: Generate Boundary Diagram**.

---

## Commands

| Command                                | Description                                   |
| -------------------------------------- | --------------------------------------------- |
| `Pickety: Refresh Configuration`       | Reload `pickety.json`, aliases, and file index |
| `Pickety: Generate Boundary Diagram`   | Generate a Mermaid diagram of your boundaries  |

---

## Example

A complete configuration enforcing feature isolation, dependency direction, utility purity, and scoped routing:

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
          "name": "no-cross-feature",
          "message": "Features should not import other features directly"
        },
        {
          "importer": "components",
          "imports": "features",
          "name": "no-component-to-feature",
          "message": "Shared components should not depend on features"
        },
        {
          "importer": "utils",
          "imports": "*",
          "name": "utility-purity",
          "message": "Utils must remain dependency-free"
        },
        {
          "importer": "routes/$name/*",
          "imports": "features/$name/pages/*",
          "allow": true,
          "name": "scoped-routing",
          "message": "Routes must use pages from their matching feature"
        },
        {
          "imports": "src/features/$name/internal/*",
          "containedTo": "src/features/$name/**/*",
          "name": "internal-isolation",
          "message": "Internal feature logic cannot leak outside its feature"
        }
      ]
    }
  },
  "boundary-diagrams": true
}
```

For more patterns -- Feature-Sliced Design, Onion Architecture, scoped utilities -- see the [Rule Recipes](docs/recipes.md).

---

## Documentation

| Resource | Description |
| -------- | ----------- |
| [Setup Guide](docs/setup.md) | Get running in under 3 minutes |
| [Configuration Reference](docs/pickety-json.md) | Full `pickety.json` specification |
| [Rule Recipes](docs/recipes.md) | Common architectural patterns (FSD, Onion, etc.) |
| [Roadmap](docs/ROADMAP.md) | What's been built and what's planned |

---

## License

[MIT](LICENSE)
