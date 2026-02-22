import * as vscode from "vscode";
import { loadConfig, loadTsConfigAliases } from "../core/config";
import { CONFIG_FILENAME } from "../shared/utils";
import type { PicketyConfig, ConfigResult } from "../shared/types";

export class ConfigService {
  private config: PicketyConfig | undefined;
  private aliases: Record<string, string> = {};

  private readonly _onConfigChanged = new vscode.EventEmitter<ConfigResult>();
  public readonly onConfigChanged = this._onConfigChanged.event;

  private readonly _onAliasesChanged = new vscode.EventEmitter<Record<string, string>>();
  public readonly onAliasesChanged = this._onAliasesChanged.event;

  private disposables: vscode.Disposable[] = [];

  constructor(private readonly workspaceRoot: string) {
    this.registerWatchers();
  }

  public getConfig(): PicketyConfig | undefined {
    return this.config;
  }

  public getAliases(): Record<string, string> {
    return this.aliases;
  }

  public reload() {
    const res = loadConfig(this.workspaceRoot);
    this.config = res.ok ? res.config : undefined;
    this._onConfigChanged.fire(res);
  }

  public reloadAliases() {
    this.aliases = loadTsConfigAliases(this.workspaceRoot);
    this._onAliasesChanged.fire(this.aliases);
  }

  private registerWatchers() {
    const configWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.workspaceRoot, CONFIG_FILENAME)
    );
    this.disposables.push(configWatcher);
    configWatcher.onDidChange(() => this.reload());
    configWatcher.onDidCreate(() => this.reload());
    configWatcher.onDidDelete(() => {
      this.config = undefined;
      this._onConfigChanged.fire({ ok: false, errors: [{ message: "Configuration file deleted" }] });
    });

    const tsConfigWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.workspaceRoot, "**/tsconfig*.json")
    );
    this.disposables.push(tsConfigWatcher);
    tsConfigWatcher.onDidChange(() => this.reloadAliases());
    tsConfigWatcher.onDidCreate(() => this.reloadAliases());
    tsConfigWatcher.onDidDelete(() => this.reloadAliases());
  }

  public dispose() {
    this.disposables.forEach((d) => d.dispose());
    this._onConfigChanged.dispose();
    this._onAliasesChanged.dispose();
  }
}
