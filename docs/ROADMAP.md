# Roadmap

## Completed

- [x] Real-time boundary enforcement in VS Code
- [x] Glob patterns for module definitions
- [x] Interpolation variables (`$name` scoping)
- [x] Strict enforcement (`only`, `containedTo`)
- [x] Per-rule severity overrides
- [x] Debt tracking (`maxViolations`)
- [x] Circular dependency detection
- [x] Boundary diagram generation (Mermaid)
- [x] Quick fixes (go to rule, allow import)
- [x] CLI (`pickety check`) for CI/CD
- [x] `tsconfig.json` path alias support
- [x] JSON Schema for `pickety.json`
- [x] Status bar integration
- [x] `pickety init` scaffolding command

---

## ~~Phase 1: Impact Analysis~~ (Completed)

- [x] 1.1 — Build a workspace-wide file-level import graph (`ImportGraph` in `src/core/graph.ts`)
- [x] 1.2 — CodeLens: show dependent count on every file (`src/impactCodeLens.ts`)
- [x] 1.3 — Command: "Pickety: Show Impact" (`pickety.showImpact`)
- [x] 1.4 — CLI: `pickety impact <file>`

---

## Phase 2: Module Health Metrics

**Goal:** Turn architecture from a feeling into numbers. Give teams measurable metrics that answer: *"Is our architecture getting better or worse?"*

### 2.1 — Compute module-level metrics from the import graph

Using the file-level `ImportGraph` from Phase 1, aggregate to module-level metrics.

**Metrics to compute:**

| Metric | Formula | What it tells you |
|---|---|---|
| **Afferent coupling (Ca)** | Count of modules that depend on this module | How "depended upon" this module is. High Ca = changing it is risky |
| **Efferent coupling (Ce)** | Count of modules this module depends on | How many external dependencies this module has. High Ce = fragile |
| **Instability (I)** | `Ce / (Ca + Ce)` | 0 = maximally stable (everyone depends on it, it depends on nothing). 1 = maximally unstable (it depends on others, nothing depends on it) |
| **File count** | Number of files in the module | Module size. Helps spot "God modules" |
| **Dependency depth** | Longest chain from this module to a leaf in the dependency DAG | Deep chains = fragile. Changes cascade further |

**What to build:**

- A `computeModuleHealth()` function in `src/core/health.ts` that takes the `ImportGraph` and the module config, and returns a `ModuleHealth[]` array
- Each `ModuleHealth` entry contains: `moduleName`, `afferentCoupling`, `efferentCoupling`, `instability`, `fileCount`, `dependencyDepth`

**Key files touched:**

| File | Change |
|---|---|
| `src/core/health.ts` | New file. `computeModuleHealth()` function |
| `src/core/graph.ts` | Add `getModuleLevelGraph()` to aggregate file edges to module edges |
| `src/types.ts` | Add `ModuleHealth` interface |

### 2.2 — Health thresholds in `pickety.json`

Let teams set thresholds that trigger warnings or errors when metrics exceed acceptable limits.

**Config shape:**

```json
{
  "health": {
    "maxAfferentCoupling": 8,
    "maxEfferentCoupling": 5,
    "maxInstability": 0.8,
    "maxDepth": 4
  }
}
```

**Behavior:**

- After computing metrics, compare against thresholds
- Violations appear as diagnostics on `pickety.json` (similar to how circular dependencies are reported today)
- Diagnostics include the current value and the threshold: `Module "features" has efferent coupling of 7 (max: 5)`

**Key files touched:**

| File | Change |
|---|---|
| `src/types.ts` | Add `HealthConfig` to `PicketyConfig` |
| `src/core/config.ts` | Validate `health` section during config loading |
| `src/core/health.ts` | Add `checkHealthThresholds()` returning violations |
| `src/controller.ts` | Run health checks after graph is built, report diagnostics |
| `src/pickety.schema.json` | Add `health` properties to JSON schema |

### 2.3 — Command: "Pickety: Show Module Health"

A webview panel that displays a table of all modules with their metrics, sorted by instability or coupling.

**What to build:**

- Register command `pickety.showHealth`
- Render an HTML table in a webview panel with columns: Module, Files, Ca, Ce, Instability, Depth
- Color-code cells that exceed thresholds (red) or are near thresholds (yellow)
- Clicking a module name filters the file explorer or shows the module's files

**Key files touched:**

| File | Change |
|---|---|
| `src/healthPanel.ts` | New file. Webview panel rendering |
| `src/controller.ts` | Register `pickety.showHealth` command |
| `package.json` | Declare the command |

### 2.4 — CLI: `pickety health`

Expose module health metrics in CI so teams can gate PRs on architectural quality.

**What to build:**

- A new `health` subcommand in `src/cli.ts`
- Builds the `ImportGraph`, computes metrics, checks thresholds
- Prints a table to stdout
- Exits with code 1 if any threshold is exceeded

**Output format:**

```
Module Health Report:

  Module        Files   Ca   Ce   Instability   Depth
  ──────        ─────   ──   ──   ───────────   ─────
  utils            12    6    0   0.00          0
  components       34    4    2   0.33          1
  hooks             8    3    3   0.50          2
  features         47    1    4   0.80          3      ← exceeds maxInstability (0.8)
  app               5    0    5   1.00          4      ← exceeds maxDepth (4)

  2 threshold violation(s) found.
```

**Key files touched:**

| File | Change |
|---|---|
| `src/cli.ts` | Add `health` command branch |

### 2.5 — Health metrics in boundary diagrams

Extend the existing Mermaid diagram generator to annotate modules with their health metrics.

**What to build:**

- When `boundary-diagrams` is enabled, include Ca/Ce/I values as labels on module nodes
- Optionally add a `"health-diagrams"` config key for a standalone health-focused diagram showing only module relationships and metrics (no rules)

**Key files touched:**

| File | Change |
|---|---|
| `src/core/diagram.ts` | Add metric annotations to module nodes |
| `src/types.ts` | Add `"health-diagrams"` to config type |

---

## Implementation Order

The phases are designed to build on each other:

```
Phase 1.1  ImportGraph (foundation)
  ├── Phase 1.2  CodeLens
  ├── Phase 1.3  Show Impact command
  ├── Phase 1.4  CLI impact
  └── Phase 2.1  Module health metrics (depends on ImportGraph)
        ├── Phase 2.2  Health thresholds
        ├── Phase 2.3  Health panel
        ├── Phase 2.4  CLI health
        └── Phase 2.5  Health diagrams
```

Phase 1.1 (the `ImportGraph`) is the critical path. Everything else is additive once that foundation exists. The file-level graph is a ~200-line class that reuses the existing import extraction and resolution pipeline — no new parsing required.

---

## Performance Constraints

The `ImportGraph` piggybacks on the full workspace scan that `checkCircularDependencies` already performs — it reads every file, extracts imports, and resolves paths. The new graph just stores file-level edges from data that's already being computed and discarded. This means **zero additional file I/O** for the initial build.

To keep it that way, follow these rules:

1. **Health metrics and impact analysis are computed on demand only.** They run when a user triggers a command (`pickety.showImpact`, `pickety.showHealth`) or when the CLI is invoked. They never run on file change or keystroke.
2. **CodeLens reads from the cached graph.** It must never trigger a graph rebuild or metric recomputation. It calls `getDependents()` / `getDependencies()` which are `O(1)` map lookups.
3. **Incremental graph updates stay scoped to the changed file.** On file change, remove that file's old forward edges and their corresponding reverse edges, then add the new ones. This is a handful of `Set.delete` / `Set.add` calls — sub-millisecond work that runs inside the existing `updateDependencyCache` debounce.
4. **Health threshold diagnostics are not re-evaluated on every file change.** Recompute only when the user saves `pickety.json` or explicitly refreshes, matching the existing pattern for config-level diagnostics like circular dependencies.
