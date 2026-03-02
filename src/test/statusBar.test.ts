import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { PicketyStatusBar } from '../vscode/statusBar';
import type { PicketyConfig } from '../shared/types';

const buildConfig = (): PicketyConfig => ({
  modules: {},
  rules: {
    "module-boundaries": {
      severity: "error",
      rules: []
    }
  }
});

const createDiagnostic = (severity: vscode.DiagnosticSeverity) => {
  const range = new vscode.Range(
    new vscode.Position(0, 0),
    new vscode.Position(0, 1)
  );
  const diagnostic = new vscode.Diagnostic(range, 'Violation', severity);
  diagnostic.source = 'pickety';
  return diagnostic;
};

const getItem = (statusBar: PicketyStatusBar) => {
  return (statusBar as unknown as { item: vscode.StatusBarItem }).item;
};

suite('Status Bar', () => {
  test('Counts only errors and warnings when info diagnostics are present', () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      assert.fail('No workspace folder open');
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const uri = vscode.Uri.file(path.join(rootPath, 'status_bar_error_info_test.ts'));
    const config = buildConfig();
    const collection = vscode.languages.createDiagnosticCollection('pickety-status-bar');
    const statusBar = new PicketyStatusBar({ subscriptions: [] } as unknown as vscode.ExtensionContext);

    try {
      const diagnostics = [
        createDiagnostic(vscode.DiagnosticSeverity.Error),
        createDiagnostic(vscode.DiagnosticSeverity.Information)
      ];
      collection.set(uri, diagnostics);
      statusBar.update(config, collection);

      const item = getItem(statusBar);
      assert.ok(item.text.includes('Pickety: 1 issue(s)'), 'Info diagnostics should be excluded from count');
      assert.strictEqual(item.backgroundColor, undefined);
      assert.strictEqual(item.color, '#ff8c00');
    } finally {
      statusBar.dispose();
      collection.dispose();
    }
  });

  test('Info-only diagnostics do not mark violations', () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      assert.fail('No workspace folder open');
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const uri = vscode.Uri.file(path.join(rootPath, 'status_bar_info_only_test.ts'));
    const config = buildConfig();
    const collection = vscode.languages.createDiagnosticCollection('pickety-status-bar');
    const statusBar = new PicketyStatusBar({ subscriptions: [] } as unknown as vscode.ExtensionContext);

    try {
      collection.set(uri, [createDiagnostic(vscode.DiagnosticSeverity.Information)]);
      statusBar.update(config, collection);

      const item = getItem(statusBar);
      assert.strictEqual(item.text, '$(check) Pickety');
      assert.strictEqual(item.color, undefined);
      assert.strictEqual(item.backgroundColor, undefined);
    } finally {
      statusBar.dispose();
      collection.dispose();
    }
  });

  test('Warnings-only use the warning icon color', () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      assert.fail('No workspace folder open');
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const uri = vscode.Uri.file(path.join(rootPath, 'status_bar_warning_only_test.ts'));
    const config = buildConfig();
    const collection = vscode.languages.createDiagnosticCollection('pickety-status-bar');
    const statusBar = new PicketyStatusBar({ subscriptions: [] } as unknown as vscode.ExtensionContext);

    try {
      collection.set(uri, [createDiagnostic(vscode.DiagnosticSeverity.Warning)]);
      statusBar.update(config, collection);

      const item = getItem(statusBar);
      assert.ok(item.text.includes('Pickety: 1 issue(s)'));
      assert.strictEqual(item.backgroundColor, undefined);
      assert.strictEqual(item.color, '#f2c200');
    } finally {
      statusBar.dispose();
      collection.dispose();
    }
  });

  test('Errors take precedence over warnings', () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      assert.fail('No workspace folder open');
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const uri = vscode.Uri.file(path.join(rootPath, 'status_bar_error_warning_test.ts'));
    const config = buildConfig();
    const collection = vscode.languages.createDiagnosticCollection('pickety-status-bar');
    const statusBar = new PicketyStatusBar({ subscriptions: [] } as unknown as vscode.ExtensionContext);

    try {
      const diagnostics = [
        createDiagnostic(vscode.DiagnosticSeverity.Warning),
        createDiagnostic(vscode.DiagnosticSeverity.Error)
      ];
      collection.set(uri, diagnostics);
      statusBar.update(config, collection);

      const item = getItem(statusBar);
      assert.ok(item.text.includes('Pickety: 2 issue(s)'));
      assert.strictEqual(item.backgroundColor, undefined);
      assert.strictEqual(item.color, '#ff8c00');
    } finally {
      statusBar.dispose();
      collection.dispose();
    }
  });
});
