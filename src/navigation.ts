import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as jsonc from "jsonc-parser";
import { CONFIG_FILENAME } from "./core/utils";

export async function goToRule(workspaceRoot: string, ruleName: string | number) {
  const configPath = path.join(workspaceRoot, CONFIG_FILENAME);
  if (!fs.existsSync(configPath)) {
    return;
  }

  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.file(configPath)
  );
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
    } else {
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
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenter
    );
  }
}

export async function allowImport(workspaceRoot: string, importer: string, target: string) {
  const configPath = path.join(workspaceRoot, CONFIG_FILENAME);
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
