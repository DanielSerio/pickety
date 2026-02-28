# Variable Interpolation

Pickety supports `$variable` placeholders in rule patterns to bind related paths together. A captured variable must appear in the `imports` pattern so it can be bound and enforced.

## Basic Capture

Use `$name` to require that a route only imports pages from its matching feature:

```json
{
  "rules": {
    "module-boundaries": {
      "severity": "error",
      "rules": [
        {
          "importer": "routes/$name",
          "imports": "features/$name/pages",
          "allow": true,
          "message": "Routes must use pages from their own feature."
        }
      ]
    }
  }
}
```

## Feature Isolation with `containedTo`

Restrict internal files to their owning feature:

```json
{
  "rules": {
    "module-boundaries": {
      "severity": "error",
      "rules": [
        {
          "imports": "features/$name/internal/**/*",
          "containedTo": "features/$name/**/*",
          "message": "Internal code cannot be imported outside its feature."
        }
      ]
    }
  }
}
```

## `unless` Exemptions

Allow a shared feature to be imported by everyone:

```json
{
  "imports": "features/$name/components/**/*",
  "containedTo": {
    "path": "features/$name/**/*",
    "unless": { "$name": "shared" }
  }
}
```

## Common Pitfalls

- **Unbound variables**: If `importer` or `containedTo` contains `$name` but `imports` does not, the variable is never captured. Pickety warns on this configuration.
- **Overly broad patterns**: Use `**/*` only when you mean “any depth.” Narrow patterns reduce false matches.
- **Mismatched segments**: `$name` binds per path segment. `features/$name/pages` will not match `features/auth/pages/v1` unless you include `**`.


## Other Places Interpolation Applies

Interpolation also works in `modules` patterns to create module instances (for example `features[auth]`) and in `exports` rules for allowlist exceptions.
