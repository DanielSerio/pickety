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
exports.resolveFileImports = resolveFileImports;
const path = __importStar(require("path"));
const minimatch_1 = require("minimatch");
const utils_1 = require("./utils");
// Extensions to try when resolving imports without explicit extensions
const RESOLVE_EXTENSIONS = utils_1.SOURCE_EXTENSIONS.map((ext) => `.${ext}`);
// Index filenames to try when resolving directory imports
const INDEX_FILES = RESOLVE_EXTENSIONS.map((ext) => `index${ext}`);
// Regex patterns for extracting import/export statements.
const COMBINED_REGEX = /(\/\*[\s\S]*?\*\/|\/\/.*)|(['"`](?:\\.|[^'"`])*['"`])|((?:import|export)\s+(?:[\s\S]*?from\s+)?['"`]([^'"`]+)['"`])|(import\s*\(\s*['"`]([^'"`]+)['"`]\s*\))/gm;
// Extracts all import/export specifiers from file content with position info.
function extractImports(content) {
    const imports = [];
    const lines = content.split("\n");
    const lineOffsets = [];
    let offset = 0;
    for (const line of lines) {
        lineOffsets.push(offset);
        offset += line.length + 1;
    }
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
    let match;
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
        }
        else if (dynamicImport && dynamicSpecifier) {
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
function resolveImport(specifier, fromFile, ctx) {
    const { knownFiles, root, aliases } = ctx;
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
    if (specifier.startsWith(".")) {
        const dir = path.dirname(fromFile);
        const resolved = path.resolve(dir, specifier);
        return resolveFile(resolved, knownFiles);
    }
    return undefined;
}
function resolveFile(absolutePath, knownFiles) {
    const normalized = (0, utils_1.normalizePath)(absolutePath);
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
function matchFileToModule(filePath, modules, root) {
    const relativePath = (0, utils_1.normalizePath)(path.relative(root, filePath));
    for (const [name, pattern] of Object.entries(modules)) {
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
function resolveFileImports(filePath, content, ctx) {
    const imports = extractImports(content);
    const resolved = [];
    for (const statement of imports) {
        const resolvedPath = resolveImport(statement.specifier, filePath, ctx);
        if (resolvedPath) {
            resolved.push({ statement, resolvedPath });
        }
    }
    return resolved;
}
//# sourceMappingURL=imports.js.map