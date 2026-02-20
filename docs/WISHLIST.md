# Wishlist

## 🎨 Interactive "Live" Visualizations

- [ ] **Interactive Webview Explorer**: A dedicated sidebar with a live-updating D3/Mermaid graph.
  - [ ] Node selection highlights specific rules in `pickety.json`.
  - [ ] Clicking connections jumps to the offending import in code.
- [ ] **"Ghost" Rules**: Tool to "draw" potential connections in the UI and see what changes are required.
- [ ] **Architectural Diffing**: Visual "Before vs After" when modifying `pickety.json`.

## 🛠️ Active Structural Refactoring

- [ ] **"Move to Module" Command**: Command-palette action to move files/folders while automatically:
  - [ ] Updating all affected relative imports.
  - [ ] Validating boundary rules _before_ the move completes.
- [ ] **Auto-Rule Generation**: "Scan Mode" to analyze existing project structure and suggest a foundational `pickety.json`.

## 🧩 Deep IDE Integration

- [ ] **Architectural Code Lenses**: Status indicators above import blocks (e.g., `⟳ Pickety: Enforced (Rule #4)`).
- [ ] **Graph Hovers**: Show a fragment of the dependency graph when hovering over forbidden imports.
- [ ] **Health Dashboard**: Status bar analytics showing "Architectural Secure %" and violation trends.

## 📈 Architectural "Drift" Management

- [ ] **Debt Tracking**: Support for `allow: "warn"` with a `maxViolations` threshold to manage legacy debt.
- [ ] **Strict Mode Zones**: Critical notification level for sensitive core modules.
- [ ] **CLI Audit**: Standalone CLI for CI/CD checks that matches IDE behavior exactly.
