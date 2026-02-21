import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

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

    } finally {
      // Cleanup: delete the test file
      try {
        await vscode.workspace.fs.delete(testFileUri);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }).timeout(10000);

  test('pickety.refresh command should exist', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('pickety.refresh'), 'pickety.refresh command should be registered');
  });
});
