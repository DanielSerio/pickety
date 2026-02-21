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
const graph_1 = require("./core/graph");
const utils_1 = require("./utils");
const utils_2 = require("./core/utils");
const health_1 = require("./core/health");
const formatters_1 = require("./cli/formatters");
function parseArgs(argv) {
    const args = argv.slice(2);
    const command = args[0];
    let root = process.cwd();
    const rootFlagIndex = args.indexOf("--root");
    if (rootFlagIndex !== -1 && args[rootFlagIndex + 1]) {
        root = path.resolve(args[rootFlagIndex + 1]);
    }
    const target = command === "impact" && args[1] && !args[1].startsWith("--")
        ? path.resolve(root, args[1])
        : undefined;
    return { command, root, target };
}
const SOURCE_EXT_SET = new Set(utils_1.SOURCE_EXTENSIONS.map((ext) => `.${ext}`));
function discoverFiles(root) {
    const entries = fs.readdirSync(root, { recursive: true, withFileTypes: true });
    const files = new Set();
    for (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }
        const fullPath = path.join(entry.parentPath, entry.name);
        if (fullPath.includes("node_modules")) {
            continue;
        }
        if (SOURCE_EXT_SET.has(path.extname(entry.name))) {
            files.add((0, utils_1.normalizePath)(fullPath));
        }
    }
    return files;
}
function printUsage() {
    console.log("Usage: pickety <command> [options]");
    console.log("");
    console.log("Commands:");
    console.log("  check              Check all files for boundary violations");
    console.log("  impact <file>      Show which files and modules depend on a file");
    console.log("  health             Show module health metrics and check thresholds");
    console.log("");
    console.log("Options:");
    console.log("  --root <path>      Workspace root (defaults to current directory)");
}
function loadWorkspace(root) {
    const result = (0, config_1.loadConfig)(root);
    if (!result.ok) {
        console.error("Configuration errors:");
        for (const err of result.errors) {
            console.error(`  ${err.message}${err.path ? ` (at ${err.path})` : ""}`);
        }
        process.exit(1);
    }
    const knownFiles = discoverFiles(root);
    const aliases = (0, config_1.loadTsConfigAliases)(root);
    return {
        config: result.config,
        ctx: { root, knownFiles, aliases }
    };
}
function buildImportGraph(ctx) {
    const graph = new graph_1.ImportGraph();
    for (const filePath of ctx.knownFiles) {
        try {
            const content = fs.readFileSync(filePath, "utf-8");
            const deps = (0, graph_1.getFileDependencies)(filePath, content, ctx);
            graph.updateFile(filePath, deps);
        }
        catch {
            continue;
        }
    }
    return graph;
}
function runCheck(root) {
    const { config, ctx } = loadWorkspace(root);
    const graph = new graph_1.ImportGraph();
    const allViolations = [];
    for (const filePath of ctx.knownFiles) {
        try {
            const content = fs.readFileSync(filePath, "utf-8");
            const violations = (0, boundaries_1.checkBoundaries)(filePath, content, config, ctx);
            allViolations.push(...violations);
            const fileDeps = (0, graph_1.getFileDependencies)(filePath, content, ctx);
            graph.updateFile(filePath, fileDeps);
        }
        catch {
            continue;
        }
    }
    const finalViolations = (0, boundaries_1.applyMaxViolations)(allViolations, config);
    const moduleGraph = graph.getModuleLevelGraph(config.modules, root);
    const cycles = (0, utils_2.findCycles)(moduleGraph);
    if (finalViolations.length === 0 && cycles.length === 0) {
        console.log("No boundary violations found.");
        process.exit(0);
    }
    for (const v of finalViolations) {
        console.log((0, formatters_1.formatViolation)(v, root));
    }
    for (const cycle of cycles) {
        console.log(`error: Circular dependency detected: ${cycle.join(" -> ")}`);
    }
    const errorCount = finalViolations.filter((v) => v.severity === "error").length + cycles.length;
    const warnCount = finalViolations.filter((v) => v.severity === "warn").length;
    console.log("");
    console.log(`Found ${finalViolations.length} violation(s): ${errorCount} error(s), ${warnCount} warning(s)`);
    process.exit(errorCount > 0 ? 1 : 0);
}
function runImpact(root, target) {
    if (!target) {
        console.error("Usage: pickety impact <file> [--root <path>]");
        process.exit(1);
    }
    if (!fs.existsSync(target)) {
        console.error(`File not found: ${target}`);
        process.exit(1);
    }
    const { config, ctx } = loadWorkspace(root);
    const graph = buildImportGraph(ctx);
    (0, formatters_1.printImpactReport)(target, graph, config, root);
}
function runHealth(root) {
    const { config, ctx } = loadWorkspace(root);
    const graph = buildImportGraph(ctx);
    const health = (0, health_1.computeModuleHealth)(graph, config.modules, ctx);
    const violations = config.health ? (0, health_1.checkHealthThresholds)(health, config.health) : [];
    (0, formatters_1.printHealthReport)(health, violations);
    if (violations.length > 0) {
        console.log(`\n  ${violations.length} threshold violation(s) found.`);
        process.exit(1);
    }
    else {
        console.log("\n  All modules within configured thresholds.");
        process.exit(0);
    }
}
function main() {
    const { command, root, target } = parseArgs(process.argv);
    if (!command || command === "--help" || command === "-h") {
        printUsage();
        process.exit(0);
    }
    switch (command) {
        case "check":
            runCheck(root);
            break;
        case "impact":
            runImpact(root, target);
            break;
        case "health":
            runHealth(root);
            break;
        default:
            console.error(`Unknown command: "${command}"`);
            printUsage();
            process.exit(1);
    }
}
main();
//# sourceMappingURL=cli.js.map