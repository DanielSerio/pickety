# Pickety Setup Guide

Get Pickety running in your project in under 3 minutes.

## 1. Installation

Install the **Pickety** extension from the VS Code Marketplace.

## 2. Basic Configuration

Create a `pickety.json` file in your workspace root. Paste this base template:

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
          "message": "Features should not depend on other features."
        },
        {
          "importer": "utils",
          "imports": "*",
          "message": "Utils must remain dependency-free."
        }
      ]
    }
  }
}
```

## 3. Verify Activation

Look at the **VS Code Status Bar** (bottom right). You should see a `$(check) Pickety` or a `$(shield) Pickety: N issues` indicator.

## 4. Fix Violations

When Pickety flags a violation, click the **Quick Fix** (lightbulb) on the red squiggle and select **"Go to Pickety rule"** to see which policy is being enforced.

---

For detailed rule syntax, see [pickety.json Reference](./pickety-json.md).
