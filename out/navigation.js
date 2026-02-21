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
exports.goToRule = goToRule;
exports.allowImport = allowImport;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const jsonc = __importStar(require("jsonc-parser"));
const utils_1 = require("./utils");
async function goToRule(workspaceRoot, ruleName) {
    const configPath = path.join(workspaceRoot, utils_1.CONFIG_FILENAME);
    if (!fs.existsSync(configPath)) {
        return;
    }
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(configPath));
    const editor = await vscode.window.showTextDocument(document);
    const text = document.getText();
    const root = jsonc.parseTree(text);
    if (!root) {
        return;
    }
    let offset = -1;
    // Search for the rule in the JSON tree
    const boundariesNode = jsonc.findNodeAtLocation(root, ["rules", "module-boundaries", "rules"]);
    if (boundariesNode && boundariesNode.children) {
        if (typeof ruleName === "string" && !ruleName.startsWith("rule[")) {
            // Find rule by name
            for (const ruleNode of boundariesNode.children) {
                const nameNode = jsonc.findNodeAtLocation(ruleNode, ["name"]);
                if (nameNode && nameNode.value === ruleName) {
                    offset = ruleNode.offset;
                    break;
                }
            }
            // Fallback: if name not found, maybe ruleName IS the importer (old behavior)
            if (offset === -1) {
                for (const ruleNode of boundariesNode.children) {
                    const importerNode = jsonc.findNodeAtLocation(ruleNode, ["importer"]);
                    if (importerNode && importerNode.value === ruleName) {
                        offset = importerNode.offset;
                        break;
                    }
                }
            }
        }
        else {
            // Find rule by index (e.g., "rule[1]")
            const indexMatch = String(ruleName).match(/rule\[(\d+)\]/);
            const index = indexMatch ? parseInt(indexMatch[1]) : -1;
            if (index !== -1 && boundariesNode.children[index]) {
                offset = boundariesNode.children[index].offset;
            }
        }
    }
    if (offset !== -1) {
        const position = document.positionAt(offset);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }
}
async function allowImport(workspaceRoot, importer, target) {
    const configPath = path.join(workspaceRoot, utils_1.CONFIG_FILENAME);
    if (!fs.existsSync(configPath)) {
        return;
    }
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(configPath));
    const text = document.getText();
    const edits = jsonc.modify(text, ["rules", "module-boundaries", "rules", -1], {
        importer,
        imports: target,
        allow: true,
        name: `allow-${importer}-to-${target}`
    }, {
        formattingOptions: {
            insertSpaces: true,
            tabSize: 2
        }
    });
    const edit = new vscode.WorkspaceEdit();
    for (const e of edits) {
        edit.replace(document.uri, new vscode.Range(document.positionAt(e.offset), document.positionAt(e.offset + e.length)), e.content);
    }
    await vscode.workspace.applyEdit(edit);
    await document.save();
    vscode.window.showInformationMessage(`Added exception: Allow '${target}' in '${importer}'`);
}
//# sourceMappingURL=navigation.js.map