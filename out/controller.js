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
const boundaries_1 = require("./core/boundaries");
const diagram_1 = require("./core/diagram");
const utils_1 = require("./utils");
const statusBar_1 = require("./statusBar");
const impactCodeLens_1 = require("./impactCodeLens");
const diagnostics_1 = require("./diagnostics");
const codeActions_1 = require("./codeActions");
const diagnosticManager_1 = require("./diagnosticManager");
const telemetry_1 = require("./telemetry");
const configService_1 = require("./configService");
const analysisService_1 = require("./analysisService");
class PicketyController {
    context;
    workspaceRoot;
    diagnosticManager;
    outputChannel;
    analysisTimeout;
    codeLensProvider;
    configRef = { config: undefined };
    statusBar;
    telemetry = telemetry_1.TelemetryProvider.getInstance();
    configService;
    analysisService;
    constructor(context, workspaceRoot) {
        this.context = context;
        this.workspaceRoot = workspaceRoot;
        this.configService = new configService_1.ConfigService(workspaceRoot);
        this.context.subscriptions.push(this.configService);
        this.analysisService = new analysisService_1.AnalysisService(workspaceRoot, this.configService);
        this.context.subscriptions.push(this.analysisService);
        this.statusBar = new statusBar_1.PicketyStatusBar(context);
        this.context.subscriptions.push(this.statusBar);
        this.outputChannel = vscode.window.createOutputChannel("Pickety");
        this.context.subscriptions.push(this.outputChannel);
        this.telemetry.setOutputChannel(this.outputChannel);
        const collection = vscode.languages.createDiagnosticCollection("pickety");
        this.context.subscriptions.push(collection);
        this.diagnosticManager = new diagnosticManager_1.DiagnosticManager(collection);
    }
    async activate() {
        this.telemetry.logEvent("extension_activate");
        this.outputChannel.appendLine(`Pickety: Extension activated for workspace: ${this.workspaceRoot}`);
        this.registerProviders();
        this.registerEventListeners();
        // Wire up config events
        this.configService.onConfigChanged((res) => this.handleConfigResult(res));
        // Wire up analysis events
        this.analysisService.onAnalysisReady(() => {
            this.outputChannel.appendLine(`Pickety: Analysis complete. Found ${this.analysisService.getKnownFiles().size} files.`);
            this.analyzeOpenEditors();
        });
        // Start loading - this will trigger an aliases change, which starts the scan
        this.configService.reload();
        this.configService.reloadAliases();
    }
    dispose() {
        if (this.analysisTimeout) {
            clearTimeout(this.analysisTimeout);
        }
        this.statusBar.dispose();
        this.diagnosticManager.dispose();
        this.outputChannel.dispose();
        this.configService.dispose();
    }
    getWorkspaceContext() {
        return this.analysisService.getWorkspaceContext();
    }
    analyzeDocument(document) {
        const config = this.configService.getConfig();
        if (!config || !this.isSourceFile(document)) {
            return;
        }
        if (this.hasMaxViolationsRules(config)) {
            this.analyzeOpenEditors();
            return;
        }
        const violations = this.checkDocument(document, config);
        this.diagnosticManager.setViolations(document.uri, violations);
        this.statusBar.update(config, this.diagnosticManager.getCollection());
    }
    analyzeOpenEditors() {
        try {
            const config = this.configService.getConfig();
            if (!config) {
                return;
            }
            const allEntries = [];
            for (const document of vscode.workspace.textDocuments) {
                if (this.isSourceFile(document)) {
                    allEntries.push({ uri: document.uri, violations: this.checkDocument(document, config) });
                }
            }
            const allViolations = allEntries.flatMap((e) => e.violations);
            const adjusted = (0, boundaries_1.applyMaxViolations)(allViolations, config);
            let offset = 0;
            for (const entry of allEntries) {
                const count = entry.violations.length;
                this.diagnosticManager.setViolations(entry.uri, adjusted.slice(offset, offset + count));
                offset += count;
            }
            this.statusBar.update(config, this.diagnosticManager.getCollection());
            // Perform heavy graph analysis in background
            setTimeout(() => {
                this.checkCircularDependencies(config);
                this.checkHealthThresholds(config);
            }, 0);
        }
        catch (e) {
            this.telemetry.logError(e instanceof Error ? e : String(e), "analyzeOpenEditors");
        }
    }
    checkDocument(document, config) {
        return (0, boundaries_1.checkBoundaries)(document.uri.fsPath, document.getText(), config, this.getWorkspaceContext());
    }
    hasMaxViolationsRules(config) {
        return config.rules["module-boundaries"].rules.some((r) => r.maxViolations !== undefined);
    }
    checkCircularDependencies(config) {
        const cycles = this.analysisService.computeCycles(config, this.getWorkspaceContext());
        const configUri = vscode.Uri.file((0, utils_1.getConfigPath)(this.workspaceRoot));
        this.diagnosticManager.setCircularDiagnostics(configUri, cycles);
    }
    checkHealthThresholds(config) {
        const violations = this.analysisService.computeHealthViolations(config, this.getWorkspaceContext());
        const configUri = vscode.Uri.file((0, utils_1.getConfigPath)(this.workspaceRoot));
        this.diagnosticManager.setHealthDiagnostics(configUri, violations);
    }
    handleConfigResult(result) {
        this.diagnosticManager.clear();
        const config = result.ok ? result.config : undefined;
        this.configRef.config = config;
        if (result.ok && result.config) {
            this.outputChannel.appendLine("Pickety: Import boundaries active");
            try {
                const diagramPath = (0, diagram_1.generateMermaidDiagram)(result.config, this.workspaceRoot);
                if (diagramPath) {
                    this.outputChannel.appendLine(`Pickety: Generated boundary diagram at ${diagramPath}`);
                }
            }
            catch (e) {
                this.outputChannel.appendLine(`Pickety: Failed to generate boundary diagram: ${e instanceof Error ? e.message : String(e)}`);
            }
            this.analyzeOpenEditors();
        }
        else if (!result.ok) {
            (0, diagnostics_1.reportConfigErrors)(result.errors, this.workspaceRoot, this.outputChannel, this.diagnosticManager.getCollection());
        }
        this.statusBar.update(config, this.diagnosticManager.getCollection());
    }
    refresh() {
        this.configService.reload();
        this.configService.reloadAliases(); // Implicitly restarts analysis
        vscode.window.showInformationMessage("Pickety: Configuration refreshed");
    }
    registerProviders() {
        this.context.subscriptions.push(vscode.languages.registerCodeActionsProvider({ scheme: "file", language: "*" }, new codeActions_1.PicketyCodeActionProvider(this.workspaceRoot), {
            providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
        }));
        this.codeLensProvider = new impactCodeLens_1.ImpactCodeLensProvider(this.analysisService.getImportGraph(), this.workspaceRoot, this.configRef);
        this.context.subscriptions.push(this.codeLensProvider);
        this.context.subscriptions.push(vscode.languages.registerCodeLensProvider({ scheme: "file", pattern: utils_1.SOURCE_GLOB }, this.codeLensProvider));
    }
    registerEventListeners() {
        this.context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
            if (!this.isSourceFile(event.document)) {
                return;
            }
            this.diagnosticManager.delete(event.document.uri);
            if (this.analysisTimeout) {
                clearTimeout(this.analysisTimeout);
            }
            this.analysisTimeout = setTimeout(() => {
                this.analysisService.updateFile(event.document.uri.fsPath, event.document.getText(), this.getWorkspaceContext());
                this.analyzeDocument(event.document);
                this.codeLensProvider?.refresh();
            }, 300);
        }));
        this.context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((document) => this.analyzeDocument(document)));
        const fileWatcher = vscode.workspace.createFileSystemWatcher(utils_1.SOURCE_GLOB);
        this.context.subscriptions.push(fileWatcher);
        fileWatcher.onDidCreate((uri) => {
            // For new files, we don't have content yet but we can add them to knownFiles
            // They will be analyzed when opened or during full graph population
            this.analysisService.getKnownFiles().add((0, utils_1.normalizePath)(uri.fsPath));
        });
        fileWatcher.onDidDelete((uri) => {
            this.analysisService.removeFile(uri.fsPath);
            this.codeLensProvider?.refresh();
        });
    }
    isSourceFile(document) {
        return ["typescript", "typescriptreact", "javascript", "javascriptreact"].includes(document.languageId);
    }
}
exports.PicketyController = PicketyController;
//# sourceMappingURL=controller.js.map