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
exports.PicketyController = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const config_1 = require("./core/config");
const boundaries_1 = require("./core/boundaries");
const diagram_1 = require("./core/diagram");
const utils_1 = require("./core/utils");
const statusBar_1 = require("./statusBar");
const diagnostics_1 = require("./diagnostics");
const navigation_1 = require("./navigation");
const codeActions_1 = require("./codeActions");
class PicketyController {
    context;
    workspaceRoot;
    config;
    aliases = {};
    knownFiles = new Set();
    diagnosticCollection;
    outputChannel;
    statusBar;
    analysisTimeout;
    dependencyGraph = new Map();
    constructor(context, workspaceRoot) {
        this.context = context;
        this.workspaceRoot = workspaceRoot;
        this.outputChannel = vscode.window.createOutputChannel("Pickety");
        this.context.subscriptions.push(this.outputChannel);
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection("pickety");
        this.context.subscriptions.push(this.diagnosticCollection);
        this.statusBar = new statusBar_1.PicketyStatusBar(this.context);
        this.context.subscriptions.push(this.statusBar);
    }
    async activate() {
        this.registerWatchers();
        this.registerCommands();
        this.registerProviders();
        this.registerEventListeners();
        // Initial run
        this.reload();
        this.reloadAliases();
        await this.refreshKnownFiles();
        this.analyzeOpenEditors();
    }
    dispose() {
        if (this.analysisTimeout) {
            clearTimeout(this.analysisTimeout);
        }
        this.statusBar.dispose();
        this.diagnosticCollection.dispose();
        this.outputChannel.dispose();
    }
    async refreshKnownFiles() {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Pickety: Scanning workspace...",
            cancellable: false,
        }, async () => {
            const files = await vscode.workspace.findFiles(utils_1.SOURCE_GLOB, "**/node_modules/**");
            this.knownFiles = new Set(files.map((f) => (0, utils_1.normalizePath)(f.fsPath)));
        });
    }
    analyzeDocument(document) {
        if (!this.config || !this.isSourceFile(document)) {
            return;
        }
        if (this.hasMaxViolationsRules()) {
            this.analyzeOpenEditors();
            return;
        }
        const violations = this.checkDocument(document);
        this.setDiagnostics(document.uri, violations);
        this.statusBar.update(this.config, this.diagnosticCollection);
    }
    analyzeOpenEditors() {
        if (!this.config) {
            return;
        }
        const allEntries = [];
        for (const document of vscode.workspace.textDocuments) {
            if (this.isSourceFile(document)) {
                allEntries.push({ uri: document.uri, violations: this.checkDocument(document) });
            }
        }
        const allViolations = allEntries.flatMap((e) => e.violations);
        const adjusted = (0, boundaries_1.applyMaxViolations)(allViolations, this.config);
        let offset = 0;
        for (const entry of allEntries) {
            const count = entry.violations.length;
            this.setDiagnostics(entry.uri, adjusted.slice(offset, offset + count));
            offset += count;
        }
        this.statusBar.update(this.config, this.diagnosticCollection);
        this.checkCircularDependencies();
    }
    updateDependencyCache(document) {
        if (!this.config) {
            return;
        }
        try {
            const deps = (0, boundaries_1.getModuleDependencies)(document.uri.fsPath, document.getText(), this.config, this.knownFiles, this.workspaceRoot, this.aliases);
            if (deps) {
                this.dependencyGraph.set((0, utils_1.normalizePath)(document.uri.fsPath), deps);
            }
            else {
                this.dependencyGraph.delete((0, utils_1.normalizePath)(document.uri.fsPath));
            }
        }
        catch {
            // Ignore
        }
    }
    checkDocument(document) {
        if (!this.config || !this.isSourceFile(document)) {
            return [];
        }
        return (0, boundaries_1.checkBoundaries)(document.uri.fsPath, document.getText(), this.config, this.knownFiles, this.workspaceRoot, this.aliases);
    }
    setDiagnostics(uri, violations) {
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
            diagnostic._picketyMetadata = {
                sourceModule: v.sourceModule,
                targetModule: v.targetModule
            };
            return diagnostic;
        });
        this.diagnosticCollection.set(uri, diagnostics);
    }
    hasMaxViolationsRules() {
        return this.config?.rules["module-boundaries"].rules.some((r) => r.maxViolations !== undefined) ?? false;
    }
    async checkCircularDependencies() {
        if (!this.config) {
            return;
        }
        const graph = new Map();
        const configUri = vscode.Uri.file(path.join(this.workspaceRoot, utils_1.CONFIG_FILENAME));
        // Use cached dependency graph where possible
        for (const filePath of this.knownFiles) {
            let deps = this.dependencyGraph.get(filePath);
            if (!deps) {
                try {
                    const content = fs.readFileSync(filePath, "utf-8");
                    deps = (0, boundaries_1.getModuleDependencies)(filePath, content, this.config, this.knownFiles, this.workspaceRoot, this.aliases);
                    if (deps) {
                        this.dependencyGraph.set(filePath, deps);
                    }
                }
                catch {
                    continue;
                }
            }
            if (deps) {
                if (!graph.has(deps.sourceModule)) {
                    graph.set(deps.sourceModule, new Set());
                }
                const sourceSet = graph.get(deps.sourceModule);
                for (const target of deps.targetModules) {
                    sourceSet.add(target);
                }
            }
        }
        const cycles = (0, utils_1.findCycles)(graph);
        const diagnostics = (this.diagnosticCollection.get(configUri) || [])
            .filter(d => !d.message.includes("Circular dependency"));
        if (cycles.length > 0) {
            for (const cycle of cycles) {
                const cycleStr = cycle.join(" -> ");
                const diagnostic = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 100), `Circular dependency detected: ${cycleStr}`, vscode.DiagnosticSeverity.Error);
                diagnostic.source = "pickety";
                diagnostics.push(diagnostic);
            }
        }
        this.diagnosticCollection.set(configUri, diagnostics);
    }
    handleConfigResult(result) {
        this.diagnosticCollection.clear();
        if (result.ok) {
            this.config = result.config;
            this.outputChannel.appendLine("Pickety: Import boundaries active");
            this.dependencyGraph.clear(); // Clear cache when config changes
            const diagramPath = (0, diagram_1.generateMermaidDiagram)(result.config, this.workspaceRoot);
            if (diagramPath) {
                this.outputChannel.appendLine(`Pickety: Generated boundary diagram at ${diagramPath}`);
            }
            this.analyzeOpenEditors();
            this.statusBar.update(this.config, this.diagnosticCollection);
        }
        else {
            this.config = undefined;
            (0, diagnostics_1.reportConfigErrors)(result.errors, this.workspaceRoot, this.outputChannel, this.diagnosticCollection);
            this.statusBar.update(this.config, this.diagnosticCollection);
        }
    }
    reloadAliases() {
        this.aliases = (0, config_1.loadTsConfigAliases)(this.workspaceRoot);
        this.outputChannel.appendLine(`Pickety: Loaded ${Object.keys(this.aliases).length} path aliases`);
        this.dependencyGraph.clear(); // Clear cache when aliases change
        this.analyzeOpenEditors();
    }
    reload() {
        const res = (0, config_1.loadConfig)(this.workspaceRoot);
        this.handleConfigResult(res);
    }
    registerWatchers() {
        const configWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.workspaceRoot, utils_1.CONFIG_FILENAME));
        this.context.subscriptions.push(configWatcher);
        configWatcher.onDidChange(() => this.reload());
        configWatcher.onDidCreate(() => this.reload());
        configWatcher.onDidDelete(() => {
            this.config = undefined;
            this.diagnosticCollection.clear();
            this.outputChannel.appendLine("Pickety: pickety.json deleted, inactive");
            this.statusBar.update(undefined, this.diagnosticCollection);
        });
        const tsConfigWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.workspaceRoot, "tsconfig*.json"));
        this.context.subscriptions.push(tsConfigWatcher);
        tsConfigWatcher.onDidChange(() => this.reloadAliases());
        tsConfigWatcher.onDidCreate(() => this.reloadAliases());
        tsConfigWatcher.onDidDelete(() => this.reloadAliases());
        const fileWatcher = vscode.workspace.createFileSystemWatcher(utils_1.SOURCE_GLOB);
        this.context.subscriptions.push(fileWatcher);
        fileWatcher.onDidCreate((uri) => {
            this.knownFiles.add((0, utils_1.normalizePath)(uri.fsPath));
        });
        fileWatcher.onDidDelete((uri) => {
            this.knownFiles.delete((0, utils_1.normalizePath)(uri.fsPath));
        });
    }
    registerCommands() {
        this.context.subscriptions.push(vscode.commands.registerCommand("pickety.refresh", () => {
            this.reload();
            this.reloadAliases();
            this.refreshKnownFiles().then(() => this.analyzeOpenEditors());
            vscode.window.showInformationMessage("Pickety: Configuration refreshed");
        }));
        this.context.subscriptions.push(vscode.commands.registerCommand("pickety.generateDiagram", () => {
            if (!this.config) {
                vscode.window.showErrorMessage("Pickety: No active configuration. Check pickety.json for errors.");
                return;
            }
            const diagramPath = (0, diagram_1.generateMermaidDiagram)(this.config, this.workspaceRoot);
            if (diagramPath) {
                vscode.window.showInformationMessage(`Pickety: Generated boundary diagram at ${diagramPath}`);
            }
            else {
                vscode.window.showErrorMessage("Pickety: Failed to generate diagram. Is 'boundary-diagrams' enabled in pickety.json?");
            }
        }));
        this.context.subscriptions.push(vscode.commands.registerCommand("pickety.goToRule", (root, rule) => (0, navigation_1.goToRule)(root, rule)));
        this.context.subscriptions.push(vscode.commands.registerCommand("pickety.allowImport", (root, importer, target) => (0, navigation_1.allowImport)(root, importer, target)));
        this.context.subscriptions.push(vscode.commands.registerCommand("pickety.init", async () => {
            const configPath = path.join(this.workspaceRoot, utils_1.CONFIG_FILENAME);
            if (fs.existsSync(configPath)) {
                const choice = await vscode.window.showWarningMessage("pickety.json already exists. Overwrite?", "Yes", "No");
                if (choice !== "Yes") {
                    return;
                }
            }
            const defaultConfig = {
                $schema: "https://raw.githubusercontent.com/danserio/pickety/main/src/pickety.schema.json",
                modules: {
                    features: "src/features/*",
                    components: "src/components/**/*",
                    utils: "src/utils/**/*",
                },
                rules: {
                    "module-boundaries": {
                        severity: "error",
                        rules: [
                            {
                                importer: "features",
                                imports: "features",
                                allow: true,
                                message: "Features can import from their own module.",
                            },
                            {
                                importer: "features",
                                imports: "components",
                                allow: true,
                            },
                            {
                                importer: "features",
                                imports: "utils",
                                allow: true,
                            },
                        ],
                    },
                },
                "boundary-diagrams": true,
            };
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
            vscode.window.showInformationMessage("Pickety: pickety.json created.");
            const doc = await vscode.workspace.openTextDocument(configPath);
            await vscode.window.showTextDocument(doc);
            this.reload();
        }));
    }
    registerProviders() {
        this.context.subscriptions.push(vscode.languages.registerCodeActionsProvider({ scheme: "file", language: "*" }, new codeActions_1.PicketyCodeActionProvider(this.workspaceRoot), {
            providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
        }));
    }
    registerEventListeners() {
        this.context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
            if (!this.isSourceFile(event.document)) {
                return;
            }
            this.diagnosticCollection.delete(event.document.uri);
            if (this.analysisTimeout) {
                clearTimeout(this.analysisTimeout);
            }
            this.analysisTimeout = setTimeout(() => {
                this.updateDependencyCache(event.document);
                this.analyzeDocument(event.document);
            }, 300);
        }));
        this.context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((document) => this.analyzeDocument(document)));
    }
    isSourceFile(document) {
        return ["typescript", "typescriptreact", "javascript", "javascriptreact"].includes(document.languageId);
    }
}
exports.PicketyController = PicketyController;
//# sourceMappingURL=controller.js.map