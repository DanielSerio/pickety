#!/usr/bin/env node
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config_1 = require("./core/config");
const boundaries_1 = require("./core/boundaries");
const utils_1 = require("./core/utils");
/**
 * Parses CLI arguments into a structured options object.
 * Supports: pickety check [--root <path>]
 */
function parseArgs(argv) {
    const args = argv.slice(2);
    const command = args[0];
    let root = process.cwd();
    const rootFlagIndex = args.indexOf("--root");
    if (rootFlagIndex !== -1 && args[rootFlagIndex + 1]) {
        root = path.resolve(args[rootFlagIndex + 1]);
    }
    return { command, root };
}
// Set of valid source file extensions for filtering
const SOURCE_EXT_SET = new Set(utils_1.SOURCE_EXTENSIONS.map((ext) => `.${ext}`));
/**
 * Discovers all source files in the workspace, excluding node_modules.
 * Uses Node's recursive readdirSync — no external glob dependency needed.
 */
function discoverFiles(root) {
    const entries = fs.readdirSync(root, { recursive: true, withFileTypes: true });
    const files = new Set();
    for (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }
        // Build the full path from parentPath + name
        const fullPath = path.join(entry.parentPath, entry.name);
        // Skip node_modules
        if (fullPath.includes("node_modules")) {
            continue;
        }
        // Only include source files
        if (SOURCE_EXT_SET.has(path.extname(entry.name))) {
            files.add((0, utils_1.normalizePath)(fullPath));
        }
    }
    return files;
}
/**
 * Formats a violation as a lint-style string: file:line:col: severity message
 */
function formatViolation(v, root) {
    const relativePath = path.relative(root, v.file).replace(/\\/g, "/");
    // Line/col are 0-indexed internally, display as 1-indexed
    const line = v.line + 1;
    const col = v.character + 1;
    const severity = v.severity === "error" ? "error" : "warning";
    return `${relativePath}:${line}:${col}: ${severity} ${v.message}`;
}
function printUsage() {
    console.log("Usage: pickety check [--root <path>]");
    console.log("");
    console.log("Commands:");
    console.log("  check    Check all files for boundary violations");
    console.log("");
    console.log("Options:");
    console.log("  --root   Workspace root (defaults to current directory)");
}
function main() {
    const { command, root } = parseArgs(process.argv);
    if (!command || command === "--help" || command === "-h") {
        printUsage();
        process.exit(0);
    }
    if (command !== "check") {
        console.error(`Unknown command: "${command}"`);
        printUsage();
        process.exit(1);
    }
    // Load configuration
    const result = (0, config_1.loadConfig)(root);
    if (!result.ok) {
        console.error("Configuration errors:");
        for (const err of result.errors) {
            console.error(`  ${err.message}${err.path ? ` (at ${err.path})` : ""}`);
        }
        process.exit(1);
    }
    const config = result.config;
    const aliases = (0, config_1.loadTsConfigAliases)(root);
    const knownFiles = discoverFiles(root);
    // Check each file for violations
    const allViolations = [];
    for (const filePath of knownFiles) {
        const content = fs.readFileSync(filePath, "utf-8");
        const violations = (0, boundaries_1.checkBoundaries)(filePath, content, config, knownFiles, root, aliases);
        allViolations.push(...violations);
    }
    // Apply maxViolations thresholds (downgrade/escalate severity)
    const finalViolations = (0, boundaries_1.applyMaxViolations)(allViolations, config);
    // Print results
    if (finalViolations.length === 0) {
        console.log("No boundary violations found.");
        process.exit(0);
    }
    for (const v of finalViolations) {
        console.log(formatViolation(v, root));
    }
    const errorCount = finalViolations.filter((v) => v.severity === "error").length;
    const warnCount = finalViolations.filter((v) => v.severity === "warn").length;
    console.log("");
    console.log(`Found ${finalViolations.length} violation(s): ${errorCount} error(s), ${warnCount} warning(s)`);
    process.exit(errorCount > 0 ? 1 : 0);
}
main();
//# sourceMappingURL=cli.js.map