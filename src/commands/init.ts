import * as vscode from "vscode";
import * as fs from "fs";
import { getConfigPath } from "../shared/utils";

export async function initCommand(workspaceRoot: string, reload: () => void) {
  const configPath = getConfigPath(workspaceRoot);
  if (fs.existsSync(configPath)) {
    const choice = await vscode.window.showWarningMessage(
      "pickety.json already exists. Overwrite?",
      "Yes",
      "No"
    );
    if (choice !== "Yes") {
      return;
    }
  }

  const defaultConfig = {
    $schema: "https://raw.githubusercontent.com/DanielSerio/pickety/main/resources/pickety.schema.json",
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
  reload();
}
