// Severity level for boundary violations
export type Severity = "error" | "warn" | "info";

// A single error found during configuration validation
export interface ConfigError {
  message: string;
  path?: string; // JSON path (e.g., "rules.module-boundaries.severity")
}

// Warning found during configuration validation
export type ConfigWarning = ConfigError;

// Result of loading/validating configuration
export type ConfigResult =
  | { ok: true; config: PicketyConfig | undefined; warnings?: ConfigWarning[]; }
  | { ok: false; errors: ConfigError[]; warnings?: ConfigWarning[]; };

// Object form of containedTo, allowing variable-based exemptions
export interface ContainedToOptions {
  path: string; // the importer pattern (same as the string form)
  unless?: Record<string, string>; // skip rule when a captured variable matches this value
}

export interface ExportRule {
  path: string;
  to: string;
  message?: string;
}

// A single boundary rule: defines whether an import between two modules is allowed
export interface BoundaryRule {
  importer?: string; // source module name or glob pattern
  imports: string | string[]; // target module name or glob pattern(s)
  allow?: boolean; // defaults to false (deny)
  only?: boolean; // if true, the 'imports' can ONLY be imported by 'importer'
  containedTo?: string | ContainedToOptions; // shortcut for 'only: true' with this importer pattern
  exports?: ExportRule | ExportRule[]; // allowlist exceptions for containedTo
  message?: string; // custom error message
  severity?: Severity; // optional per-rule severity override
  name?: string; // optional rule name for identification
  group?: string; // optional group label for diagnostics and CLI summaries
  maxViolations?: number; // threshold: violations at or below this count are downgraded to warnings
}

// Configuration loaded from pickety.json
export interface PicketyConfig {
  version?: string;
  modules: Record<string, string>; // module name -> glob pattern
  ignore?: string[]; // glob patterns to exclude from analysis
  rules: {
    "module-boundaries": {
      severity: Severity;
      rules: BoundaryRule[];
    };
  };
  warnOnUntrackedImporters?: boolean;
  "boundary-diagrams"?: boolean | string;
  health?: HealthConfig;
}

// Runtime context shared across enforcement functions
export interface WorkspaceContext {
  knownFiles: Set<string>;
  root: string;
  aliases: Record<string, string>;
}

// Result of matching a file path to a module definition.
export interface ModuleMatch {
  name: string;
  pattern: string;
  relativePath: string;
  variables?: Record<string, string>;
}

// Context passed to boundary rule evaluation.
export interface RuleContext {
  sourceModule: string;
  sourceRelativePath: string;
  targetModule: string;
  targetRelativePath: string;
  filePath: string;
  importStmt: ImportStatement;
}


// An extracted import statement with position info
export interface ImportStatement {
  specifier: string; // the import path (e.g., "../B/service")
  line: number; // 0-indexed line number
  character: number; // 0-indexed start column of the full import statement
  length: number; // length of the full import statement
}

// A boundary violation found in a file
export interface Violation {
  file: string;
  line: number; // 0-indexed
  character: number; // 0-indexed start column
  length: number; // length of the import statement
  message: string;
  severity: Severity;
  ruleName?: string; // the name or index of the rule that was violated
  ruleGroup?: string; // optional group name for diagnostics and CLI summaries
  sourceModule?: string;
  targetModule?: string;
}

export type PicketyMetadata = {
  sourceModule?: string;
  targetModule?: string;
};

// Health thresholds configuration in pickety.json
export interface HealthConfig {
  maxAfferentCoupling?: number;
  maxEfferentCoupling?: number;
  maxInstability?: number;
  maxDepth?: number;
}

// Computed health metrics for a single module
export interface ModuleHealth {
  moduleName: string;
  fileCount: number;
  afferentCoupling: number;  // Ca: count of modules that depend on this one
  efferentCoupling: number;  // Ce: count of modules this one depends on
  instability: number;       // Ce / (Ca + Ce), range 0–1
  dependencyDepth: number;   // longest chain from this module to a leaf
}

// A single threshold violation found during health checks
export interface HealthViolation {
  moduleName: string;
  metric: string;
  value: number;
  threshold: number;
}
