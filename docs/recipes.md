# Pickety Rule Recipes

Common architectural patterns implemented with Pickety rules.

## Feature-Sliced Design (FSD)

Enforce isolation between features and ensure they only depend on the `shared` layer.

```json
{
  "modules": {
    "app": "src/app/*",
    "pages": "src/pages/*",
    "widgets": "src/widgets/*",
    "features": "src/features/*",
    "entities": "src/entities/*",
    "shared": "src/shared/*"
  },
  "rules": {
    "module-boundaries": {
      "severity": "error",
      "rules": [
        {
          "importer": "features",
          "imports": "features",
          "message": "FSD: Features cannot depend on other features."
        },
        {
          "importer": "entities",
          "imports": "src/{features,widgets,pages}/**/*",
          "message": "FSD: Entities cannot depend on higher layers."
        },
        {
          "importer": "shared",
          "imports": "*",
          "message": "FSD: Shared layer must be dependency-free."
        }
      ]
    }
  }
}
```

## Feature Isolation (Per-Feature Boundaries)

Keep each feature self-contained by restricting imports to the owning feature. This pattern scales well for large codebases where features should not cross-import.

```json
{
  "modules": {
    "features": "src/features/*"
  },
  "rules": {
    "module-boundaries": {
      "severity": "error",
      "rules": [
        {
          "imports": "features/$name/**/*",
          "containedTo": "features/$name/**/*",
          "message": "Features must not be imported outside their own boundary."
        }
      ]
    }
  }
}
```

This means:
- `features/auth/**` can only be imported by other `features/auth/**` files.
- `features/billing/**` can only be imported by other `features/billing/**` files.

## Layered Architecture (Onion)

Ensure the Domain and Application layers don't depend on Infrastructure.

```json
{
  "modules": {
    "domain": "src/domain/**/*",
    "app": "src/application/**/*",
    "infra": "src/infrastructure/**/*"
  },
  "rules": {
    "module-boundaries": {
      "severity": "error",
      "rules": [
        {
          "importer": "domain",
          "imports": "src/{application,infrastructure}/**/*",
          "message": "Domain layer must have zero external dependencies."
        },
        {
          "importer": "app",
          "imports": "infra",
          "message": "Application layer cannot depend on Infrastructure."
        }
      ]
    }
  }
}
```

## Feature Components with a Shared Exemption

Enforce that each feature's components can only be imported by code in the same feature, while allowing a `shared` feature to act as a project-wide component library.

```json
{
  "modules": {
    "features": "src/features/*"
  },
  "rules": {
    "module-boundaries": {
      "severity": "error",
      "rules": [
        {
          "imports": "features/$name/components/**/*",
          "containedTo": {
            "path": "features/$name/**/*",
            "unless": { "$name": "shared" }
          },
          "message": "Features components must be imported by their own feature."
        }
      ]
    }
  }
}
```

With this rule:
- `features/auth/components/LoginForm.tsx` → only importable from within `features/auth/**/*`
- `features/shared/components/Button.tsx` → importable from anywhere (`$name === "shared"` exempts it)

This pattern is common in Feature-Sliced Design and any architecture where one module acts as a shared library alongside isolated feature modules.

## Scoped Utilities

Prevent "Utility Bloat" by ensuring only specific modules can use certain utils.

```json
{
  "modules": {
    "auth": "src/features/auth/**/*",
    "auth-utils": "src/features/auth/utils/*"
  },
  "rules": {
    "module-boundaries": {
      "severity": "error",
      "rules": [
        {
          "importer": "!(auth)",
          "imports": "auth-utils",
          "message": "Auth-specific utils are private to the auth module."
        }
      ]
    }
  }
}
```
