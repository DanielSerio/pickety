import * as path from "path";
import {
  matchFileToModule,
  resolveFileImports,
} from "./imports";
import type { PicketyConfig, Violation, WorkspaceContext } from "../shared/types";
import {
  normalizePath,
} from "./utils";
import { checkRule } from "./ruleChecker";

// Checks a single file for import boundary violations.
// Returns a list of violations with position info for diagnostics.
export function checkBoundaries(
  filePath: string,
  content: string,
  config: PicketyConfig,
  ctx: WorkspaceContext
): Violation[] {
  const violations: Violation[] = [];
  const { modules } = config;
  const { severity, rules } = config.rules["module-boundaries"];
  const { root } = ctx;
  const warnOnUntrackedImporters = config.warnOnUntrackedImporters ?? true;

  // Determine which module this file belongs to
  const sourceModule = matchFileToModule(filePath, modules, root);
  if (!sourceModule) {
    if (warnOnUntrackedImporters) {
      violations.push({
        file: filePath,
        line: 0,
        character: 0,
        length: 1,
        message: "This file is not covered by any declared module. Import rules will not be enforced here.",
        severity: "info",
      });
    }
    return violations;
  }

  const sourceRelativePath = normalizePath(path.relative(root, filePath));

  // Resolve all imports in the file
  const resolvedImports = resolveFileImports(
    filePath,
    content,
    ctx
  );

  for (const { statement: importStmt, resolvedPath } of resolvedImports) {
    // Determine which module the imported file belongs to
    const targetModule = matchFileToModule(resolvedPath, modules, root);
    if (!targetModule) {
      continue;
    }

    // Get the target file's relative path for glob matching
    const targetRelativePath = normalizePath(path.relative(root, resolvedPath));

    // Check each boundary rule for a match
    rules.forEach((rule, index) => {
      const v = checkRule(
        rule,
        index,
        severity,
        sourceModule,
        sourceRelativePath,
        targetModule,
        targetRelativePath,
        filePath,
        importStmt
      );
      if (v) {
        violations.push(v);
      }
    });
  }

  return violations;
}

