# Pickety Suggestions

Suggestions gathered from real-world configuration of a Next.js 16 / hexagonal architecture project.

---

## Critical Priority (Must-Haves)

### 1. Rules are not enforced for files outside declared modules (Bug/Gap)

`containedTo` and `only` rules are only evaluated when the **importer** file belongs to a declared module. If a file's path isn't matched by any entry in `modules`, Pickety does not enforce any rules against it as an importer — it can import anything silently.

For example, `features/strain/pages/StrainManagementPage.tsx` was able to violate a `containedTo` rule because `features/**` was not declared as a module. Adding it restored enforcement.

This behavior is easy to miss. A warning (or doc callout) noting that untracked files are exempt from rule enforcement would help users catch gaps in their module declarations.

---

### 2. `containedTo` with `$variable` may not work when the importer belongs to a broad module (Bug/Limitation)

When a module is declared broadly (e.g. `"features": "features/**"`), Pickety appears to evaluate `containedTo` at the module level rather than the file level. This means `containedTo: "features/$feature/**"` checks whether the importer is in the `features` module — which is always true for any feature file — rather than checking whether the importer's actual path falls under `features/batch/**` (the specific `$feature` value captured from the import).

This makes fine-grained intra-module boundary enforcement with `$variable` effectively impossible when files share a broad parent module. Supporting `$variable` interpolation in the `modules` section would resolve this by allowing Pickety to treat each `$feature` as a distinct module instance:

```json
"feature": "features/$feature/**"
```

---

### 3. Encapsulation & Explicit Exports Syntax (Design Paradigm)

To express the architecture rule: **"Restrict all feature functionality to within its feature, EXCEPT expose feature `pages` directories ONLY to the `app` module"**, developers currently have to write two verbose rules using brace expansions, `only`, `containedTo`, and `unless` modifiers.

This is brittle and conceptually backwards. We are essentially saying "Everything is public, but let's try to block specific access patterns."

We propose an elegant, declarative extension to the `containedTo` rule structure that introduces an `exports` block, leaning into the idea of **Encapsulation by Default**:

```json
{
  "imports": "features/$feature/**",
  "containedTo": "features/$feature/**",
  "exports": {
    "path": "features/$feature/pages/**",
    "to": "app",
    "message": "Features are strictly encapsulated. They only expose their 'pages' directory to the 'app' module."
  }
}
```

**Why this is better:**

1. **Intention-Revealing:** `exports` maps perfectly to the architectural mental model (Private internals, Public API).
2. **Eliminates Globarithmetic:** Removes the need for complex `{app,features...}` brace expansions, `$section` variables, and negative lookaheads (`unless`).
3. **Safe by Default:** If a developer adds a new `/components` folder to a feature, it is automatically encapsulated. They don't have to remember to update an inverted exclusion list.
4. **First-class Module Alias Support:** The `to: "app"` parameter evaluates cleanly against user-defined module aliases.

---

### 4. Validation CLI / dry-run command (Enterprise Requirement)

Since Pickety runs as a VS Code extension, there is no easy way to validate a `pickety.json` config against actual files outside the IDE (e.g. in CI or during onboarding). A CLI command like `pickety check` or `pickety validate` would allow:

- CI enforcement as a second line of defence
- Verifying the config works before opening VS Code for the first time
- Confirming that `$variable` interpolation is matching files as expected

---

## High Priority (Should-Haves)

### 5. `$variable` must appear in both `imports` and `containedTo` to bind correctly

When `containedTo` uses a `$variable`, the same variable must also appear in the `imports` path — not an anonymous `*` wildcard. Using `*` provides no named capture, so `$feature` in `containedTo` has nothing to bind to and the cross-feature constraint silently fails:

```json
// ❌ $feature is unbound — containedTo has no value to match against
{ "imports": "features/*/components/**", "containedTo": "features/$feature/**" }

// ✅ $feature is captured in imports and correlated in containedTo
{ "imports": "features/$feature/components/**", "containedTo": "features/$feature/**" }
```

This is a subtle footgun — the rule appears valid and produces no config error, but cross-feature imports are silently permitted. A warning when `containedTo` references a `$variable` that is not present in `imports` would catch this immediately.

---

### 6. `$variable` interpolation documentation

The `containedTo` + `$variable` + `unless` combination is the most powerful part of the rule system, but the interaction between multiple variables is not clearly documented. A worked example showing a complete feature isolation config — including how `unless` exempts specific `$variable` values — would significantly lower the learning curve.

For reference, the pattern we arrived at after experimentation:

```json
{
  "imports": "features/$feature/$section/**",
  "containedTo": {
    "path": "features/$feature/**",
    "unless": { "$section": "pages" }
  }
}
```

This single rule enforces cross-feature isolation for all internals while exempting pages (which are handled by a separate `only` rule). It took several iterations to arrive at this — better docs would have shortened that path considerably. _(Note: If Item 3 is implemented, this becomes less critical)._

---

## Normal Priority (Nice-to-Haves)

### 7. Array support for `imports` in rules

The schema currently requires `imports` to be a single string, which forces one rule per forbidden import target:

```json
{ "importer": "domain", "imports": "core", "allow": false },
{ "importer": "domain", "imports": "infrastructure", "allow": false },
{ "importer": "domain", "imports": "app", "allow": false }
```

An array form would be much less noisy:

```json
{
  "importer": "domain",
  "imports": ["core", "infrastructure", "app"],
  "allow": false
}
```

---

### 8. Architecture presets

Built-in named presets for common patterns would lower the barrier to entry significantly. For example:

```json
{
  "preset": "hexagonal",
  "modules": {
    "domain": "domain/**",
    "application": "core/**",
    "infrastructure": "infrastructure/**",
    "ui": "app/**"
  }
}
```

Other candidates: `"feature-modules"`, `"clean-architecture"`, `"layered"`.

---

### 9. Rule naming / grouping in diagnostics

When a violation is surfaced in the IDE, it would be helpful to show the rule `name` (already a supported optional field) more prominently, and to support logical grouping of rules (e.g. "Hexagonal Boundaries", "Feature Isolation") so that large configs remain navigable.
