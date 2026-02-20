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
exports.PicketyStatusBar = void 0;
const vscode = __importStar(require("vscode"));
class PicketyStatusBar {
    item;
    constructor(context) {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.item.command = "pickety.refresh";
        context.subscriptions.push(this.item);
        this.item.show();
    }
    update(config, diagnosticCollection) {
        if (!config) {
            this.item.text = "$(warning) Pickety: No Config";
            this.item.tooltip = "Pickety is inactive. Check pickety.json for errors.";
            this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
            return;
        }
        let violationCount = 0;
        diagnosticCollection.forEach((_uri, diagnostics) => {
            violationCount += diagnostics.filter((d) => d.source === "pickety").length;
        });
        if (violationCount > 0) {
            this.item.text = `$(shield) Pickety: ${violationCount} issue(s)`;
            this.item.tooltip = `Found ${violationCount} architectural violations. Click to refresh.`;
            this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
        }
        else {
            this.item.text = "$(check) Pickety";
            this.item.tooltip = "Architectural boundaries are secure. Click to refresh.";
            this.item.backgroundColor = undefined;
        }
    }
    dispose() {
        this.item.dispose();
    }
}
exports.PicketyStatusBar = PicketyStatusBar;
//# sourceMappingURL=statusBar.js.map