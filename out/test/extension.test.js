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
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
suite('Extension Integration Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');
    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('DanSerio.pickety'));
    });
    test('Extension should activate', async () => {
        const ext = vscode.extensions.getExtension('DanSerio.pickety');
        await ext?.activate();
        assert.strictEqual(ext?.isActive, true, 'Extension should be active');
    });
    test('Diagnostics should appear for boundary violations', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            assert.fail('No workspace folder open');
        }
        const rootPath = workspaceFolders[0].uri.fsPath;
        const testFilePath = path.join(rootPath, 'src', 'core', 'violation_test.ts');
        const testFileUri = vscode.Uri.file(testFilePath);
        // Rule in pickety.json: "core" cannot import "vscode-impl"
        // "vscode-impl" is src/{statusBar,diagnostics,navigation,codeActions}.ts
        const content = 'import { PicketyStatusBar } from "../statusBar";\n';
        try {
            await vscode.workspace.fs.writeFile(testFileUri, Buffer.from(content));
            const doc = await vscode.workspace.openTextDocument(testFileUri);
            await vscode.window.showTextDocument(doc);
            // Wait for the controller to perform analysis (it debounces/waits)
            // 2 seconds should be enough for the diagnostic to appear
            await new Promise(resolve => setTimeout(resolve, 3000));
            const diagnostics = vscode.languages.getDiagnostics(testFileUri);
            assert.ok(diagnostics.length > 0, 'Diagnostics should be generated for the violation');
            const picketyDiag = diagnostics.find(d => d.source === 'pickety');
            assert.ok(picketyDiag, 'At least one diagnostic should be from Pickety');
            assert.ok(picketyDiag?.message.includes('Core logic must remain platform-agnostic'), 'Diagnostic message should match rule');
            assert.strictEqual(picketyDiag?.severity, vscode.DiagnosticSeverity.Error, 'Severity should be Error as per config');
        }
        finally {
            // Cleanup: delete the test file
            try {
                await vscode.workspace.fs.delete(testFileUri);
            }
            catch (_e) {
                // Ignore cleanup errors
            }
        }
    }).timeout(10000);
    test('pickety.refresh command should exist', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('pickety.refresh'), 'pickety.refresh command should be registered');
    });
    test('Circular dependency should be detected', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            assert.fail('No workspace folder open');
        }
        const rootPath = workspaceFolders[0].uri.fsPath;
        const circularFilePath = path.join(rootPath, 'src', 'core', 'circular_dep_test.ts');
        const circularFileUri = vscode.Uri.file(circularFilePath);
        const configUri = vscode.Uri.file(path.join(rootPath, 'pickety.json'));
        // Create a file in 'core' that imports 'initCommand' (in commands), creating a cycle (commands -> core -> commands)
        const content = 'import { initCommand } from "../commands/init";\n';
        try {
            await vscode.workspace.fs.writeFile(circularFileUri, Buffer.from(content));
            // Trigger a refresh to ensure circular dependency check runs
            await vscode.commands.executeCommand('pickety.refresh');
            // Wait for analysis
            await new Promise(resolve => setTimeout(resolve, 5000));
            const diagnostics = vscode.languages.getDiagnostics(configUri);
            const circularDiag = diagnostics.find(d => d.message.includes('Circular dependency detected'));
            assert.ok(circularDiag, 'Circular dependency diagnostic should be present on pickety.json');
            assert.ok(circularDiag?.message.includes('core -> commands -> core') || circularDiag?.message.includes('commands -> core -> commands'));
        }
        finally {
            try {
                await vscode.workspace.fs.delete(circularFileUri);
            }
            catch (_e) { }
        }
    }).timeout(15000);
    test('Module health thresholds should be enforced', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            assert.fail('No workspace folder open');
        }
        const rootPath = workspaceFolders[0].uri.fsPath;
        const configPath = path.join(rootPath, 'pickety.json');
        const configUri = vscode.Uri.file(configPath);
        const originalConfig = await vscode.workspace.fs.readFile(configUri);
        const configJson = JSON.parse(originalConfig.toString());
        // Add a strict health threshold
        configJson.health = {
            maxEfferentCoupling: 1
        };
        try {
            await vscode.workspace.fs.writeFile(configUri, Buffer.from(JSON.stringify(configJson, null, 2)));
            // Wait for config reload and analysis
            await new Promise(resolve => setTimeout(resolve, 5000));
            const diagnostics = vscode.languages.getDiagnostics(configUri);
            const healthDiag = diagnostics.find(d => d.message.includes('has efferent coupling of'));
            assert.ok(healthDiag, 'Health threshold violation diagnostic should be present on pickety.json');
            assert.strictEqual(healthDiag?.severity, vscode.DiagnosticSeverity.Warning);
        }
        finally {
            // Restore original config
            await vscode.workspace.fs.writeFile(configUri, originalConfig);
        }
    }).timeout(20000);
});
//# sourceMappingURL=extension.test.js.map