// Severity level for boundary violations
export type Severity = "error" | "warn";

// A single error found during configuration validation
export interface ConfigError {
  message: string;
  path?: string; // JSON path (e.g., "rules.module-boundaries.severity")
}

// Result of loading/validating configuration
export type ConfigResult =
  | { ok: true; config: PicketyConfig; }
  | { ok: false; errors: ConfigError[]; };

// A single boundary rule: defines whether an import between two modules is allowed
export interface BoundaryRule {
  importer?: string; // source module name or glob pattern
  imports: string; // target module name or glob pattern
  allow?: boolean; // defaults to false (deny)
  only?: boolean; // if true, the 'imports' can ONLY be imported by 'importer'
  containedTo?: string; // shortcut for 'only: true' with this importer pattern
  message?: string; // custom error message
  severity?: Severity; // optional per-rule severity override
  name?: string; // optional rule name for identification
  maxViolations?: number; // threshold: violations at or below this count are downgraded to warnings
}

// Configuration loaded from pickety.json
export interface PicketyConfig {
  modules: Record<string, string>; // module name -> glob pattern
  rules: {
    "module-boundaries": {
      severity: Severity;
      rules: BoundaryRule[];
    };
  };
  "boundary-diagrams"?: boolean | string;
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
}


