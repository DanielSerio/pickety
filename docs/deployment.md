# Deployment & Release Guide

This guide covers how to publish Pickety to the VS Code Marketplace and manage future releases.

## 1. One-Time Setup

Pickety uses `vsce` (Visual Studio Code Extensions) as its publishing tool.

### Install the CLI

```bash
npm install -g @vscode/vsce
```

### Create a Publisher Identity

1. Go to the [Azure DevOps portal](https://aka.ms/vsc-create-token).
2. Create a **Personal Access Token (PAT)**.
   - Organization: `All accessible organizations`
   - Scopes: `Custom Defined` -> `Marketplace (Publish)`
3. Log in via your terminal:
   ```bash
   vsce login <your-publisher-id>
   ```

## 2. Manual Publishing

### Step 1: Validate & Build

Before publishing, generate a `.vsix` package to inspect the contents and test locally.

```bash
vsce package
```

Verify that the `out/extension.js` exists and the `icon.png` is correctly bundled in the `resources` folder.

### Step 2: Publish

To upload the extension directly to the Marketplace:

```bash
vsce publish
```

## 3. Versioning & Releases

Pickety follows [Semantic Versioning](https://semver.org/). `vsce` can automate the version bump, git tag, and publication in one command.

### Patch Release (Bug fixes)

Increments `0.0.1` to `0.0.2`:

```bash
vsce publish patch
```

### Minor Release (New features)

Increments `0.0.1` to `0.1.0`:

```bash
vsce publish minor
```

### Major Release (Breaking changes)

Increments `0.0.1` to `1.0.0`:

```bash
vsce publish major
```

## 4. GitHub Automation (Recommended)

To ensure quality, use GitHub Actions to automate the publishing process.

1. Store your Azure DevOps PAT in your GitHub repository secrets as `VSCE_PAT`.
2. Create a workflow at `.github/workflows/publish.yml`.
3. Configure it to trigger on `release` creation or pushes to `main`.

## 5. Post-Release Checklist

- [ ] **Verify README**: Check that screenshots and icons render correctly on the Marketplace page.
- [ ] **Update CHANGELOG**: Ensure the `CHANGELOG.md` file reflects the changes in the latest version.
- [ ] **GitHub Release**: Create a matching release on GitHub for transparency.
