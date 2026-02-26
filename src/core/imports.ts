import * as path from "path";
import { minimatch } from "minimatch";
import type { ImportStatement, WorkspaceContext } from "../shared/types";
import { SOURCE_EXTENSIONS, normalizePath } from "./utils";

// Extensions to try when resolving imports without explicit extensions
const RESOLVE_EXTENSIONS = SOURCE_EXTENSIONS.map((ext) => `.${ext}`);

// Index filenames to try when resolving directory imports
const INDEX_FILES = RESOLVE_EXTENSIONS.map((ext) => `index${ext}`);

// Regex patterns for extracting import/export statements.
const COMBINED_REGEX =
  /(\/\*[\s\S]*?\*\/|\/\/.*)|(['"`](?:\\.|[^'"`])*['"`])|((?:import|export)\s+(?:[\s\S]*?from\s+)?['"`]([^'"`]+)['"`])|(import\s*\(\s*['"`]([^'"`]+)['"`]\s*\))/gm;

// Extracts all import/export specifiers from file content with position info.
export function extractImports(content: string): ImportStatement[] {
  const imports: ImportStatement[] = [];
  const lines = content.split("\n");

  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

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
    const [_fullMatch, comment, stringLiteral, staticImport, staticSpecifier, dynamicImport, dynamicSpecifier] = match;

    if (comment || stringLiteral) {
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
export function resolveImport(
  specifier: string,
  fromFile: string,
  ctx: WorkspaceContext
): string | undefined {
  const { knownFiles, root, aliases } = ctx;

  for (const [alias, replacement] of Object.entries(aliases)) {
    if (alias.endsWith("/*")) {
      const aliasPrefix = alias.slice(0, -2);
      const replacementPrefix = replacement.endsWith("/*")
        ? replacement.slice(0, -2)
        : (replacement === "*" ? "" : replacement);

      if (specifier.startsWith(aliasPrefix)) {
        const resolved = specifier.replace(aliasPrefix, replacementPrefix);
        return resolveFile(path.resolve(root, resolved), knownFiles);
      }
    } else if (specifier === alias) {
      return resolveFile(path.resolve(root, replacement), knownFiles);
    }
  }

  if (specifier.startsWith(".")) {
    const dir = path.dirname(fromFile);
    const resolved = path.resolve(dir, specifier);
    return resolveFile(resolved, knownFiles);
  }

  return undefined;
}

function resolveFile(
  absolutePath: string,
  knownFiles: Set<string>
): string | undefined {
  const normalized = normalizePath(absolutePath);
  if (knownFiles.has(normalized)) {
    return normalized;
  }

  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = normalized + ext;
    if (knownFiles.has(candidate)) {
      return candidate;
    }
  }

  for (const indexFile of INDEX_FILES) {
    const candidate = normalized + "/" + indexFile;
    if (knownFiles.has(candidate)) {
      return candidate;
    }
  }
  return undefined;
}



export function matchFileToModule(
  filePath: string,
  modules: Record<string, string>,
  root: string
): string | undefined {
  const relativePath = normalizePath(path.relative(root, filePath));

  for (const [name, pattern] of Object.entries(modules)) {
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

export interface ResolvedImport {
  statement: ImportStatement;
  resolvedPath: string;
}

export function resolveFileImports(
  filePath: string,
  content: string,
  ctx: WorkspaceContext
): ResolvedImport[] {
  const imports = extractImports(content);
  const resolved: ResolvedImport[] = [];

  for (const statement of imports) {
    const resolvedPath = resolveImport(statement.specifier, filePath, ctx);
    if (resolvedPath) {
      resolved.push({ statement, resolvedPath });
    }
  }
  return resolved;
}
