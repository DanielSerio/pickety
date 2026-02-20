import * as path from "path";
import { minimatch } from "minimatch";
import type { ImportStatement } from "../types";

// Extensions to try when resolving imports without explicit extensions
const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

// Index filenames to try when resolving directory imports
const INDEX_FILES = RESOLVE_EXTENSIONS.map((ext) => `index${ext}`);

// Regex patterns for extracting import/export statements.
// Captures: the full match (for position/length) and the specifier string.

// Matches: import ... from 'specifier' and export ... from 'specifier'
// Uses [\s\S]*? to handle multi-line imports
const STATIC_IMPORT_REGEX =
  /(?:import|export)\s[\s\S]*?from\s*['"]([^'"]+)['"]/gm;

// Matches: import('specifier') — dynamic imports
const DYNAMIC_IMPORT_REGEX = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;

// Extracts all import/export specifiers from file content with position info.
export function extractImports(content: string): ImportStatement[] {
  const imports: ImportStatement[] = [];
  const lines = content.split("\n");

  // Build a line offset map for converting character offsets to line/column
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1; // +1 for the newline character
  }

  // Helper to convert a character offset to { line, character }
  const offsetToPosition = (charOffset: number) => {
    let line = 0;
    for (let i = 1; i < lineOffsets.length; i++) {
      if (lineOffsets[i] > charOffset) {
        break;
      }
      line = i;
    }
    return { line, character: charOffset - lineOffsets[line] };
  };


  // Extract static imports/exports: import/export ... from '...'
  let match: RegExpExecArray | null;

  STATIC_IMPORT_REGEX.lastIndex = 0;
  while ((match = STATIC_IMPORT_REGEX.exec(content)) !== null) {
    const pos = offsetToPosition(match.index);
    imports.push({
      specifier: match[1],
      line: pos.line,
      character: pos.character,
      length: match[0].length,
    });
  }

  // Extract dynamic imports: import('...')
  DYNAMIC_IMPORT_REGEX.lastIndex = 0;
  while ((match = DYNAMIC_IMPORT_REGEX.exec(content)) !== null) {
    const pos = offsetToPosition(match.index);
    imports.push({
      specifier: match[1],
      line: pos.line,
      character: pos.character,
      length: match[0].length,
    });
  }

  return imports;
}

// Resolves an import specifier to an absolute file path.
// Handles aliases and relative imports. Returns undefined if not resolvable.
export function resolveImport(
  specifier: string,
  fromFile: string,
  knownFiles: Set<string>,
  root: string,
  aliases: Record<string, string> = {}
): string | undefined {
  // 1. Try alias resolution
  for (const [alias, replacement] of Object.entries(aliases)) {
    if (alias.endsWith("/*") && replacement.endsWith("/*")) {
      const aliasPrefix = alias.slice(0, -2);
      const replacementPrefix = replacement.slice(0, -2);
      if (specifier.startsWith(aliasPrefix)) {
        const resolved = specifier.replace(aliasPrefix, replacementPrefix);
        return resolveFile(path.resolve(root, resolved), knownFiles);
      }
    } else if (specifier === alias) {
      return resolveFile(path.resolve(root, replacement), knownFiles);
    }
  }

  // 2. Handle relative imports
  if (specifier.startsWith(".")) {
    const dir = path.dirname(fromFile);
    const resolved = path.resolve(dir, specifier);
    return resolveFile(resolved, knownFiles);
  }

  // 3. Non-relative, non-aliased imports are external packages — skip
  return undefined;
}

// Tries to resolve an absolute path to a known file by checking:
// exact match, then with extensions, then as directory with index file.
function resolveFile(
  absolutePath: string,
  knownFiles: Set<string>
): string | undefined {
  const normalized = absolutePath.replace(/\\/g, "/");

  // Exact match
  if (knownFiles.has(normalized)) {
    return normalized;
  }

  // Try adding extensions
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = normalized + ext;
    if (knownFiles.has(candidate)) {
      return candidate;
    }
  }

  // Try index files in directory
  for (const indexFile of INDEX_FILES) {
    const candidate = normalized + "/" + indexFile;
    if (knownFiles.has(candidate)) {
      return candidate;
    }
  }

  return undefined;
}


// Matches a file to a named module from the config.
// Returns the module name, or undefined if the file doesn't belong to any module.
export function matchFileToModule(
  filePath: string,
  modules: Record<string, string>,
  root: string
): string | undefined {
  const relativePath = path.relative(root, filePath).replace(/\\/g, "/");

  for (const [name, pattern] of Object.entries(modules)) {
    // Expand trailing /* to /**/* for deep matching (same as code-scanner)
    const expandedPattern = pattern.endsWith("/*")
      ? pattern.slice(0, -2) + "/**/*"
      : pattern;

    if (
      minimatch(relativePath, expandedPattern) ||
      minimatch(relativePath, pattern)
    ) {
      return name;
    }
  }

  return undefined;
}
