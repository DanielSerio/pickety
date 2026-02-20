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
