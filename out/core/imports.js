"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractImports = extractImports;
exports.resolveImport = resolveImport;
exports.matchFileToModule = matchFileToModule;
const path = __importStar(require("path"));
const minimatch_1 = require("minimatch");
const utils_1 = require("./utils");
// Extensions to try when resolving imports without explicit extensions
const RESOLVE_EXTENSIONS = utils_1.SOURCE_EXTENSIONS.map((ext) => `.${ext}`);
// Index filenames to try when resolving directory imports
const INDEX_FILES = RESOLVE_EXTENSIONS.map((ext) => `index${ext}`);
// Regex patterns for extracting import/export statements.
// Captures: the full match (for position/length) and the specifier string.
// Matches: import ... from 'specifier' and export ... from 'specifier'
// Uses [\s\S]*? to handle multi-line imports
const STATIC_IMPORT_REGEX = /(?:import|export)\s[\s\S]*?from\s*['"]([^'"]+)['"]/gm;
// Matches: import('specifier') — dynamic imports
const DYNAMIC_IMPORT_REGEX = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;
// Extracts all import/export specifiers from file content with position info.
function extractImports(content) {
    const imports = [];
    const lines = content.split("\n");
    // Build a line offset map for converting character offsets to line/column
    const lineOffsets = [];
    let offset = 0;
    for (const line of lines) {
        lineOffsets.push(offset);
        offset += line.length + 1; // +1 for the newline character
    }
    // Helper to convert a character offset to { line, character }
    const offsetToPosition = (charOffset) => {
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
    let match;
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
function resolveImport(specifier, fromFile, knownFiles, root, aliases = {}) {
    // 1. Try alias resolution
    for (const [alias, replacement] of Object.entries(aliases)) {
        if (alias.endsWith("/*") && replacement.endsWith("/*")) {
            const aliasPrefix = alias.slice(0, -2);
            const replacementPrefix = replacement.slice(0, -2);
            if (specifier.startsWith(aliasPrefix)) {
                const resolved = specifier.replace(aliasPrefix, replacementPrefix);
                return resolveFile(path.resolve(root, resolved), knownFiles);
            }
        }
        else if (specifier === alias) {
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
function resolveFile(absolutePath, knownFiles) {
    const normalized = (0, utils_1.normalizePath)(absolutePath);
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
function matchFileToModule(filePath, modules, root) {
    const relativePath = (0, utils_1.normalizePath)(path.relative(root, filePath));
    for (const [name, pattern] of Object.entries(modules)) {
        // Expand trailing /* to /**/* for deep matching (same as code-scanner)
        const expandedPattern = pattern.endsWith("/*")
            ? pattern.slice(0, -2) + "/**/*"
            : pattern;
        if ((0, minimatch_1.minimatch)(relativePath, expandedPattern) ||
            (0, minimatch_1.minimatch)(relativePath, pattern)) {
            return name;
        }
    }
    return undefined;
}
//# sourceMappingURL=imports.js.map