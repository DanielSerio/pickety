# Pickety Roadmap

Improvements to make Pickety more useful for keeping agents (and humans) on rails.

## Legend

- [x] **Completed**: Implemented and tested.
- [>] **In Progress**: Currently being worked on or partially implemented.
- [ ] **Planned**: Future enhancement.

---

## Phase 1: Foundational DX [Completed]

Addresses the biggest pain points — silent failures and delayed feedback.

- [x] **1.1 Config Validation Errors**: Structured errors for `pickety.json` with human-readable messages and workspace diagnostics.
- [x] **1.2 Real-Time Analysis**: Debounced analysis on text change (300ms) with immediate stale diagnostic clearing.
- [x] **1.3 Path Alias Support**: Full support for `tsconfig.json` path aliases and `baseUrl` resolution.

---

## Phase 2: Better Violation Context [Completed]

Makes violations easier to understand and act on.

- [x] **2.1 Per-Rule Severity**: Support for `severity` overrides on individual rules ("error" vs "warn").
- [x] **2.2 Rule Identification**: Support for `name` field in rules. Violations now include rule identifiers.
- [x] **2.3 Documentation Links**: Clickable diagnostic codes that link directly to rule documentation on GitHub.

---

## Phase 3: Editor Integration [Completed]

Deeper VS Code integration for a smoother workflow.

- [x] **3.1 Status Bar Indicator**: Persistent indicator in the status bar showing Pickety's status and violation count.
- [x] **3.2 Quick Fixes**:
  - [x] "Go to rule": Instantly jump to the rule in `pickety.json`.
  - [ ] "Suppress this line": Insert `// pickety-ignore-next-line` (Planned).
- [ ] **3.3 Boundary Diagram Visualizer**: Instead of just generating a Mermaid file, provide a "Show Diagram" command that opens a live preview in a Webview.

---

## Phase 4: Production Readiness [In Progress]

Polishing Pickety for Marketplace release and high performance.

### 4.1 Branding & Marketplace Presence

- [x] **Icon**: Professional logo integration.
- [x] **Manifest Polish**: Added publisher ID, repository links, license, and keywords to `package.json`.
- [ ] **Media**: Add an animated GIF to `README.md` (Planned).

### 4.2 Performance & Build Optimization

- [x] **esbuild Bundling**: Production build pipeline with `esbuild` (minification, bundling, bundling into `out/extension.js`).
- [ ] **Lazy Loading**: (Planned).

### 4.3 Robustness & UX

- [x] **jsonc-parser Integration**: Switched to `jsonc-parser` for 100% accurate rule navigation.
- [x] **Progress Notifications**: Added scan indicator for large project file discovery.
- [x] **Improved JSON Schema**: Enhanced with markdown descriptions and rule examples.

### 4.4 Documentation

- [x] **Getting Started Guide**: Created `docs/setup.md`.
- [x] **Rule Recipes**: Created `docs/recipes.md` with common patterns (FSD, Onion, etc.).
