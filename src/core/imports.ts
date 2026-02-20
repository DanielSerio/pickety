import * as path from "path";
import { minimatch } from "minimatch";
import type { ImportStatement } from "../types";
import { SOURCE_EXTENSIONS, normalizePath } from "./utils";

// Extensions to try when resolving imports without explicit extensions
const RESOLVE_EXTENSIONS = SOURCE_EXTENSIONS.map((ext) => `.${ext}`);

// Index filenames to try when resolving directory imports
const INDEX_FILES = RESOLVE_EXTENSIONS.map((ext) => `index${ext}`);

// Regex patterns for extracting import/export statements.
// Captures: the full match (for position/length) and the specifier string.

// Combined regex to match comments, strings, AND imports.
// This allows us to skip imports found inside comments or strings.
// Group 1: Comments (/* ... */ or // ...)
// Group 2: Strings ("..." or '...' or `...`)
// Group 3: Static imports/exports
// Group 4: Specifier for static
// Group 5: Dynamic imports
// Group 6: Specifier for dynamic
const COMBINED_REGEX =
  /(\/\*[\s\S]*?\*\/|\/\/.*)|(['"`](?:\\.|[^'"`])*['"`])|((?:import|export)\s+(?:[\s\S]*?from\s+)?['"`]([^'"`]+)['"`])|(import\s*\(\s*['"`]([^'"`]+)['"`]\s*\))/gm;

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

  let match: RegExpExecArray | null;
  COMBINED_REGEX.lastIndex = 0;

  while ((match = COMBINED_REGEX.exec(content)) !== null) {
    const [
      fullMatch,
      comment,
      stringLiteral,
      staticImport,
      staticSpecifier,
      dynamicImport,
      dynamicSpecifier,
    ] = match;

    if (comment || stringLiteral) {
      // Ignore matches inside comments or strings
      continue;
    }

    if (staticImport && staticSpecifier) {
      const pos = offsetToPosition(match.index);
      imports.push({
        specifier: staticSpecifier,
        line: pos.line,
        character: pos.character,
        length: staticImport.length,
      });
    } else if (dynamicImport && dynamicSpecifier) {
      const pos = offsetToPosition(match.index);
      imports.push({
        specifier: dynamicSpecifier,
        line: pos.line,
        character: pos.character,
        length: dynamicImport.length,
      });
    }
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
  const normalized = normalizePath(absolutePath);

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
  const relativePath = normalizePath(path.relative(root, filePath));

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
