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
exports.reportConfigErrors = reportConfigErrors;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const utils_1 = require("./core/utils");
function reportConfigErrors(errors, workspaceRoot, outputChannel, diagnosticCollection) {
    outputChannel.appendLine("Pickety: Configuration error(s) found:");
    const configUri = vscode.Uri.file(path.join(workspaceRoot, utils_1.CONFIG_FILENAME));
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
}
//# sourceMappingURL=diagnostics.js.map