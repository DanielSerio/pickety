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
const config_1 = require("./core/config");
const boundaries_1 = require("./core/boundaries");
const diagram_1 = require("./core/diagram");
const utils_1 = require("./core/utils");
const statusBar_1 = require("./statusBar");
const navigation_1 = require("./navigation");
const codeActions_1 = require("./codeActions");
const diagnostics_1 = require("./diagnostics");
/**
 * Encapsulates the extension state to avoid mutable globals and improve testability.
 */
class ExtensionState {
    config;
    aliases = {};
    knownFiles = new Set();
    diagnosticCollection;
    outputChannel;
    statusBar;
    analysisTimeout;
    workspaceRoot;
    constructor(context, workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.outputChannel = vscode.window.createOutputChannel("Pickety");
        context.subscriptions.push(this.outputChannel);
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection("pickety");
        context.subscriptions.push(this.diagnosticCollection);
        this.statusBar = new statusBar_1.PicketyStatusBar(context);
        context.subscriptions.push(this.statusBar);
    }
    dispose() {
        if (this.analysisTimeout) {
            clearTimeout(this.analysisTimeout);
        }
    }
}
let state;
function activate(context) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        return;
    }
    state = new ExtensionState(context, workspaceRoot);
    // Discover all source files in the workspace for import resolution
    const refreshKnownFiles = async () => {
        if (!state) {
            return;
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Pickety: Scanning workspace...",
            cancellable: false,
        }, async () => {
            const files = await vscode.workspace.findFiles(utils_1.SOURCE_GLOB, "**/node_modules/**");
            state.knownFiles = new Set(files.map((f) => (0, utils_1.normalizePath)(f.fsPath)));
        });
    };
    // Analyze a single document and update its diagnostics
    const analyzeDocument = (document) => {
        if (!state || !state.config) {
            return;
        }
        if (!isSourceFile(document)) {
            return;
        }
        const filePath = document.uri.fsPath;
        const content = document.getText();
        const violations = (0, boundaries_1.checkBoundaries)(filePath, content, state.config, state.knownFiles, state.workspaceRoot, state.aliases);
        const diagnostics = violations.map((v) => {
            const range = new vscode.Range(v.line, v.character, v.line, v.character + v.length);
            const severity = v.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
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
        state.diagnosticCollection.set(document.uri, diagnostics);
        state.statusBar.update(state.config, state.diagnosticCollection);
    };
    const analyzeOpenEditors = () => {
        if (!state) {
            return;
        }
        for (const document of vscode.workspace.textDocuments) {
            analyzeDocument(document);
        }
    };
    const handleConfigResult = (result) => {
        if (!state) {
            return;
        }
        state.diagnosticCollection.clear();
        if (result.ok) {
            state.config = result.config;
            state.outputChannel.appendLine("Pickety: Import boundaries active");
            const diagramPath = (0, diagram_1.generateMermaidDiagram)(result.config, state.workspaceRoot);
            if (diagramPath) {
                state.outputChannel.appendLine(`Pickety: Generated boundary diagram at ${diagramPath}`);
            }
            analyzeOpenEditors();
            state.statusBar.update(state.config, state.diagnosticCollection);
        }
        else {
            state.config = undefined;
            (0, diagnostics_1.reportConfigErrors)(result.errors, state.workspaceRoot, state.outputChannel, state.diagnosticCollection);
            state.statusBar.update(state.config, state.diagnosticCollection);
        }
    };
    const reloadAliases = () => {
        if (!state) {
            return;
        }
        state.aliases = (0, config_1.loadTsConfigAliases)(state.workspaceRoot);
        state.outputChannel.appendLine(`Pickety: Loaded ${Object.keys(state.aliases).length} path aliases`);
        analyzeOpenEditors();
    };
    const reload = () => {
        if (!state) {
            return;
        }
        const res = (0, config_1.loadConfig)(state.workspaceRoot);
        handleConfigResult(res);
    };
    // Watch for pickety.json changes
    const configWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceRoot, utils_1.CONFIG_FILENAME));
    context.subscriptions.push(configWatcher);
    configWatcher.onDidChange(reload);
    configWatcher.onDidCreate(reload);
    configWatcher.onDidDelete(() => {
        if (!state) {
            return;
        }
        state.config = undefined;
        state.diagnosticCollection.clear();
        state.outputChannel.appendLine("Pickety: pickety.json deleted, inactive");
        state.statusBar.update(undefined, state.diagnosticCollection);
    });
    // Watch for tsconfig changes
    const tsConfigWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceRoot, "tsconfig*.json"));
    context.subscriptions.push(tsConfigWatcher);
    tsConfigWatcher.onDidChange(reloadAliases);
    tsConfigWatcher.onDidCreate(reloadAliases);
    tsConfigWatcher.onDidDelete(reloadAliases);
    // Commands
    context.subscriptions.push(vscode.commands.registerCommand("pickety.refresh", () => {
        reload();
        reloadAliases();
        refreshKnownFiles().then(analyzeOpenEditors);
        vscode.window.showInformationMessage("Pickety: Configuration refreshed");
    }));
    context.subscriptions.push(vscode.commands.registerCommand("pickety.generateDiagram", () => {
        if (!state || !state.config) {
            vscode.window.showErrorMessage("Pickety: No active configuration. Check pickety.json for errors.");
            return;
        }
        const diagramPath = (0, diagram_1.generateMermaidDiagram)(state.config, state.workspaceRoot);
        if (diagramPath) {
            vscode.window.showInformationMessage(`Pickety: Generated boundary diagram at ${diagramPath}`);
        }
        else {
            vscode.window.showErrorMessage("Pickety: Failed to generate diagram. Is 'boundary-diagrams' enabled in pickety.json?");
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("pickety.goToRule", (root, rule) => (0, navigation_1.goToRule)(root, rule)));
    // Providers
    context.subscriptions.push(vscode.languages.registerCodeActionsProvider({ scheme: "file", language: "*" }, new codeActions_1.PicketyCodeActionProvider(workspaceRoot), {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }));
    // File Watching
    const fileWatcher = vscode.workspace.createFileSystemWatcher(utils_1.SOURCE_GLOB);
    context.subscriptions.push(fileWatcher);
    fileWatcher.onDidCreate((uri) => {
        state?.knownFiles.add((0, utils_1.normalizePath)(uri.fsPath));
    });
    fileWatcher.onDidDelete((uri) => {
        state?.knownFiles.delete((0, utils_1.normalizePath)(uri.fsPath));
    });
    // Text Document Events
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
        if (!state || !isSourceFile(event.document)) {
            return;
        }
        state.diagnosticCollection.delete(event.document.uri);
        if (state.analysisTimeout) {
            clearTimeout(state.analysisTimeout);
        }
        state.analysisTimeout = setTimeout(() => analyzeDocument(event.document), 300);
    }));
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((document) => analyzeDocument(document)));
    // Initialize
    const initialResult = (0, config_1.loadConfig)(workspaceRoot);
    handleConfigResult(initialResult);
    reloadAliases();
    refreshKnownFiles().then(analyzeOpenEditors);
}
function isSourceFile(document) {
    return ["typescript", "typescriptreact", "javascript", "javascriptreact"].includes(document.languageId);
}
function deactivate() {
    state?.dispose();
}
//# sourceMappingURL=extension.js.map