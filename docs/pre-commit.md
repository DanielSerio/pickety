# Pre-commit Hook Integration

Enforcing architectural boundaries in your CI pipeline is great, but catching them locally before you even commit is even better. You can integrate `pickety check` into your workflow using common tools like Husky or Lefthook.

## Husky & lint-staged

If you are already using [Husky](https://typicode.github.io/husky/) and [lint-staged](https://github.com/lint-staged/lint-staged), add Pickety to your configuration.

**Note:** Unlike ESLint, Pickety is most effective when it checks the _entire_ project to catch side-effects (like broken module-level coupling), so we recommend running a full check rather than just checking staged files.

### 1. Install Husky

```bash
npx husky-init && npm install
```

### 2. Add pre-commit hook

```bash
# .husky/pre-commit
npx pickety check
```

Alternatively, if you want it to be part of your `npm test` or a custom `lint` script:

```json
// package.json
"scripts": {
  "lint:architecture": "pickety check"
}
```

```bash
# .husky/pre-commit
npm run lint:architecture
```

---

## Lefthook

[Lefthook](https://github.com/evilmartians/lefthook) is a fast, polyglot Git hooks manager.

### 1. Install Lefthook

```bash
npm install lefthook --save-dev
```

### 2. Configure `lefthook.yml`

Create or update `lefthook.yml` in your project root:

```yaml
# lefthook.yml
pre-commit:
  commands:
    pickety:
      run: npx pickety check
```

---

## CI Usage

For CI, you can run the same command and use JSON output for structured logs:

```bash
npx pickety check --format json
```

Example GitHub Actions job:

```yaml
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

---

## Why full check instead of staged files?

Most linters only check the files you changed. Pickety is different:

- Changing `file A` might create a circular dependency with `file B`.
- Moving a file might push a module's **instability** or **depth** score past your configured threshold.

Running `pickety check` on the whole workspace is extremely fast (typically <1s for 500+ files) and ensures your architecture remains sound after every commit.
