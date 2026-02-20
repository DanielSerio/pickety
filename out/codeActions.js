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
exports.PicketyCodeActionProvider = void 0;
const vscode = __importStar(require("vscode"));
class PicketyCodeActionProvider {
    workspaceRoot;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    provideCodeActions(_document, _range, context) {
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
exports.PicketyCodeActionProvider = PicketyCodeActionProvider;
//# sourceMappingURL=codeActions.js.map