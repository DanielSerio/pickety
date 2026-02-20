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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const config_1 = require("./core/config");
const boundaries_1 = require("./core/boundaries");
let config;
let aliases = {};
let knownFiles;
let diagnosticCollection;
let outputChannel;
let analysisTimeout;
function activate(context) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        return;
    }
    outputChannel = vscode.window.createOutputChannel("Pickety");
    context.subscriptions.push(outputChannel);
    diagnosticCollection = vscode.languages.createDiagnosticCollection("pickety");
    context.subscriptions.push(diagnosticCollection);
    // Discover all source files in the workspace for import resolution
    knownFiles = new Set();
    const refreshKnownFiles = async () => {
        const files = await vscode.workspace.findFiles("**/*.{ts,tsx,js,jsx,mjs,cjs}", "**/node_modules/**");
        knownFiles = new Set(files.map((f) => f.fsPath.replace(/\\/g, "/")));
    };
    // Analyze a single document and update its diagnostics
    const analyzeDocument = (document) => {
        if (!config) {
            return;
        }
        if (!isSourceFile(document)) {
            return;
        }
        const filePath = document.uri.fsPath;
        const content = document.getText();
        const violations = (0, boundaries_1.checkBoundaries)(filePath, content, config, knownFiles, workspaceRoot, aliases);
        const diagnostics = violations.map((v) => {
            const range = new vscode.Range(v.line, v.character, v.line, v.character + v.length);
            const severity = v.severity === "error"
                ? vscode.DiagnosticSeverity.Error
                : vscode.DiagnosticSeverity.Warning;
            const diagnostic = new vscode.Diagnostic(range, v.message, severity);
            diagnostic.source = "pickety";
            if (v.ruleName) {
                diagnostic.code = {
                    value: v.ruleName,
                    target: vscode.Uri.parse(`https://github.com/pickety/pickety/blob/main/docs/rules.md#${v.ruleName}`),
                };
            }
            return diagnostic;
        });
        diagnosticCollection.set(document.uri, diagnostics);
    };
    // Analyze all currently open text editors
    const analyzeOpenEditors = () => {
        for (const editor of vscode.window.visibleTextEditors) {
            analyzeDocument(editor.document);
        }
    };
    const handleConfigResult = (result) => {
        diagnosticCollection.clear();
        if (result.ok) {
            config = result.config;
            outputChannel.appendLine("Pickety: Import boundaries active");
            analyzeOpenEditors();
        }
        else {
            config = undefined;
            reportConfigErrors(result.errors, workspaceRoot);
        }
    };
    const reportConfigErrors = (errors, root) => {
        outputChannel.appendLine("Pickety: Configuration error(s) found:");
        const configUri = vscode.Uri.file(path.join(root, "pickety.json"));
        const diagnostics = errors.map((err) => {
            outputChannel.appendLine(` - ${err.message}${err.path ? ` (at ${err.path})` : ""}`);
            // If we don't have a path, just highlight the first line
            const range = new vscode.Range(0, 0, 0, 100);
            const diagnostic = new vscode.Diagnostic(range, err.message, vscode.DiagnosticSeverity.Error);
            diagnostic.source = "pickety";
            if (err.path) {
                diagnostic.code = err.path;
            }
            return diagnostic;
        });
        diagnosticCollection.set(configUri, diagnostics);
        vscode.window.showErrorMessage("Pickety: Configuration error. Check the Problems panel or Output channel for details.");
    };
    const reloadAliases = () => {
        aliases = (0, config_1.loadTsConfigAliases)(workspaceRoot);
        outputChannel.appendLine(`Pickety: Loaded ${Object.keys(aliases).length} path aliases`);
        analyzeOpenEditors();
    };
    // Initialize: load config, aliases and discover files
    const result = (0, config_1.loadConfig)(workspaceRoot);
    handleConfigResult(result);
    reloadAliases();
    refreshKnownFiles().then(analyzeOpenEditors);
    // Real-time analysis on text change
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
        if (!isSourceFile(event.document)) {
            return;
        }
        // Clear stale diagnostics immediately for this file
        diagnosticCollection.delete(event.document.uri);
        // Debounce analysis
        if (analysisTimeout) {
            clearTimeout(analysisTimeout);
        }
        analysisTimeout = setTimeout(() => {
            analyzeDocument(event.document);
        }, 300);
    }));
    // Re-analyze when a file is opened
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((document) => {
        analyzeDocument(document);
    }));
    // Watch for pickety.json changes — reload config and re-analyze
    const configWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceRoot, "pickety.json"));
    context.subscriptions.push(configWatcher);
    const reload = () => {
        const res = (0, config_1.loadConfig)(workspaceRoot);
        handleConfigResult(res);
    };
    configWatcher.onDidChange(reload);
    configWatcher.onDidCreate(reload);
    configWatcher.onDidDelete(() => {
        config = undefined;
        diagnosticCollection.clear();
        outputChannel.appendLine("Pickety: pickety.json deleted, inactive");
    });
    // Watch for tsconfig changes
    const tsConfigWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceRoot, "tsconfig*.json"));
    context.subscriptions.push(tsConfigWatcher);
    tsConfigWatcher.onDidChange(reloadAliases);
    tsConfigWatcher.onDidCreate(reloadAliases);
    tsConfigWatcher.onDidDelete(reloadAliases);
    // Register Refresh command
    context.subscriptions.push(vscode.commands.registerCommand("pickety.refresh", () => {
        reload();
        reloadAliases();
        refreshKnownFiles().then(analyzeOpenEditors);
        vscode.window.showInformationMessage("Pickety: Configuration refreshed");
    }));
    // Register Go to Rule command (called by Code Action)
    context.subscriptions.push(vscode.commands.registerCommand("pickety.goToRule", (root, rule) => goToRule(root, rule)));
    // Register Code Action Provider for "Go to Rule"
    context.subscriptions.push(vscode.languages.registerCodeActionsProvider({ scheme: "file", language: "*" }, new PicketyCodeActionProvider(workspaceRoot), {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }));
    // Update known files when files are created or deleted
    const fileWatcher = vscode.workspace.createFileSystemWatcher("**/*.{ts,tsx,js,jsx,mjs,cjs}");
    context.subscriptions.push(fileWatcher);
    fileWatcher.onDidCreate((uri) => {
        knownFiles.add(uri.fsPath.replace(/\\/g, "/"));
    });
    fileWatcher.onDidDelete((uri) => {
        knownFiles.delete(uri.fsPath.replace(/\\/g, "/"));
    });
}
/**
 * Provides Code Actions to jump to the relevant rule in pickety.json
 */
class PicketyCodeActionProvider {
    workspaceRoot;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    provideCodeActions(document, range, context) {
        const actions = [];
        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source === "pickety" && diagnostic.code) {
                const ruleName = typeof diagnostic.code === "object"
                    ? diagnostic.code.value
                    : diagnostic.code;
                const action = new vscode.CodeAction(`Go to Pickety rule: ${ruleName}`, vscode.CodeActionKind.QuickFix);
                action.command = {
                    command: "pickety.goToRule",
                    title: "Go to Rule",
                    arguments: [this.workspaceRoot, ruleName],
                };
                actions.push(action);
            }
        }
        return actions;
    }
}
// Helper function to find a rule in pickety.json and jump to it
async function goToRule(workspaceRoot, ruleName) {
    const configPath = path.join(workspaceRoot, "pickety.json");
    if (!fs.existsSync(configPath)) {
        return;
    }
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(configPath));
    const editor = await vscode.window.showTextDocument(document);
    const text = document.getText();
    let offset = -1;
    // Search for the rule name or index in the JSON text
    if (typeof ruleName === "string" && !ruleName.startsWith("rule[")) {
        // Try to find the rule name in quotes
        offset = text.indexOf(`"${ruleName}"`);
    }
    else {
        // For rule index (e.g., "rule[1]"), try to find the Nth occurrence of "importer"
        // (This is a heuristic since we don't have a full JSON parser with positions)
        const indexMatch = String(ruleName).match(/rule\[(\d+)\]/);
        const index = indexMatch ? parseInt(indexMatch[1]) : -1;
        if (index !== -1) {
            let currentIdx = 0;
            let pos = -1;
            while (currentIdx <= index) {
                pos = text.indexOf('"importer"', pos + 1);
                if (pos === -1) {
                    break;
                }
                currentIdx++;
            }
            offset = pos;
        }
    }
    if (offset !== -1) {
        const position = document.positionAt(offset);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }
}
// Returns true if the document is a TypeScript/JavaScript source file
function isSourceFile(document) {
    return [
        "typescript",
        "typescriptreact",
        "javascript",
        "javascriptreact",
    ].includes(document.languageId);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map