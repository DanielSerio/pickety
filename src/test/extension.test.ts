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
    const isFixture = rootPath.includes('next-ddd');

    // Choose a path that exists in the current workspace
    const testFilePath = isFixture
      ? path.join(rootPath, 'core', 'violation_test.ts')
      : path.join(rootPath, 'src', 'core', 'violation_test.ts');

    const testFileUri = vscode.Uri.file(testFilePath);

    // Set content and expected message based on workspace
    const content = isFixture
      ? 'import { App } from "../app/main";\n' // Core cannot import App in fixture
      : 'import { PicketyStatusBar } from "../vscode/statusBar";\n';

    const expectedMessage = isFixture
      ? 'Core layer can only depend on the domain'
      : 'Core logic must remain platform-agnostic';

    try {
      await vscode.workspace.fs.writeFile(testFileUri, Buffer.from(content));

      const doc = await vscode.workspace.openTextDocument(testFileUri);
      await vscode.window.showTextDocument(doc);
      await doc.save();

      // Trigger a refresh to ensure re-analysis of open editors
      await vscode.commands.executeCommand('pickety.refresh');

      // Wait for the controller to perform analysis
      await new Promise(resolve => setTimeout(resolve, 5000));

      const diagnostics = vscode.languages.getDiagnostics(testFileUri);

      assert.ok(diagnostics.length > 0, 'Diagnostics should be generated for the violation');
      const picketyDiag = diagnostics.find(d => d.source === 'pickety');
      assert.ok(picketyDiag, 'At least one diagnostic should be from Pickety');
      assert.ok(picketyDiag?.message.includes(expectedMessage), `Diagnostic message should match rule. Expected to include: "${expectedMessage}", but got: "${picketyDiag?.message}"`);
      assert.strictEqual(picketyDiag?.severity, vscode.DiagnosticSeverity.Error, 'Severity should be Error as per config');

    } finally {
      // Cleanup: delete the test file
      try {
        await vscode.workspace.fs.delete(testFileUri);
      } catch (_e) {
        // Ignore cleanup errors
      }
    }
  }).timeout(30000);

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
    const isFixture = rootPath.includes('next-ddd');

    if (isFixture) {
      // Skip circular dependency test for now in the fixture as it requires specific structure
      return;
    }

    const circularFilePath = path.join(rootPath, 'src', 'core', 'circular_dep_test.ts');
    const circularFileUri = vscode.Uri.file(circularFilePath);
    const configUri = vscode.Uri.file(path.join(rootPath, 'pickety.json'));

    // Create a file in 'core' that imports 'showHealthCommand' (in commands), creating a cycle (commands -> core -> commands)
    const content = 'import { showHealthCommand } from "../commands/showHealth";\n';

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
    } finally {
      try {
        await vscode.workspace.fs.delete(circularFileUri);
      } catch (_e) { }
    }
  }).timeout(15000);

  test('Module health thresholds should be enforced', async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      assert.fail('No workspace folder open');
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const isFixture = rootPath.includes('next-ddd');

    if (isFixture) {
      return;
    }
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
    } finally {
      // Restore original config
      await vscode.workspace.fs.writeFile(configUri, originalConfig);
    }
  }).timeout(20000);

  test('Diagnostics should be cleared when violation is fixed', async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      assert.fail('No workspace folder open');
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const isFixture = rootPath.includes('next-ddd');

    const testFilePath = isFixture
      ? path.join(rootPath, 'core', 'clear_violation_test.ts')
      : path.join(rootPath, 'src', 'core', 'clear_violation_test.ts');

    const testFileUri = vscode.Uri.file(testFilePath);

    const violationContent = isFixture
      ? 'import { App } from "../app/main";\n'
      : 'import { PicketyStatusBar } from "../vscode/statusBar";\n';
    const validContent = 'const validVal = 42;\n';

    try {
      await vscode.workspace.fs.writeFile(testFileUri, Buffer.from(violationContent));
      const doc = await vscode.workspace.openTextDocument(testFileUri);
      await vscode.window.showTextDocument(doc);
      await doc.save();
      await vscode.commands.executeCommand('pickety.refresh');
      await new Promise(resolve => setTimeout(resolve, 5000));

      let diagnostics = vscode.languages.getDiagnostics(testFileUri);
      let picketyDiag = diagnostics.find(d => d.source === 'pickety');
      assert.ok(picketyDiag, 'Diagnostic should be present initially');

      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await editor.edit(editBuilder => {
          const fullRange = new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(doc.getText().length)
          );
          editBuilder.replace(fullRange, validContent);
        });
        await doc.save();
      } else {
        await vscode.workspace.fs.writeFile(testFileUri, Buffer.from(validContent));
      }

      await new Promise(resolve => setTimeout(resolve, 3000));

      diagnostics = vscode.languages.getDiagnostics(testFileUri);
      picketyDiag = diagnostics.find(d => d.source === 'pickety');
      assert.ok(!picketyDiag, 'Diagnostic should be cleared after fixing the code');

    } finally {
      try {
        await vscode.workspace.fs.delete(testFileUri);
      } catch (_e) { }
    }
  }).timeout(15000);

  test('Extension handles missing config without crashing', async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      assert.fail('No workspace folder open');
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const configPath = path.join(rootPath, 'pickety.json');
    const configUri = vscode.Uri.file(configPath);
    const testPath = path.join(rootPath, 'src', 'core', 'missing_config_test.ts');
    const testUri = vscode.Uri.file(testPath);

    const originalConfig = await vscode.workspace.fs.readFile(configUri);

    try {
      await vscode.workspace.fs.delete(configUri);
      await new Promise(resolve => setTimeout(resolve, 2000));

      await vscode.workspace.fs.writeFile(testUri, Buffer.from('import { PicketyStatusBar } from "../vscode/statusBar";\n'));
      await new Promise(resolve => setTimeout(resolve, 2000));

      const diagnostics = vscode.languages.getDiagnostics(testUri);
      const picketyDiag = diagnostics.find(d => d.source === 'pickety');
      assert.ok(!picketyDiag, 'Should not generate diagnostics when config is missing');

    } finally {
      await vscode.workspace.fs.writeFile(configUri, originalConfig);
      try {
        await vscode.workspace.fs.delete(testUri);
      } catch (_e) { }
    }
  }).timeout(15000);

  test('Extension handles malformed config gracefully', async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      assert.fail('No workspace folder open');
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const configPath = path.join(rootPath, 'pickety.json');
    const configUri = vscode.Uri.file(configPath);
    const testPath = path.join(rootPath, 'src', 'core', 'malformed_config_test.ts');
    const testUri = vscode.Uri.file(testPath);

    const originalConfig = await vscode.workspace.fs.readFile(configUri);

    try {
      await vscode.workspace.fs.writeFile(configUri, Buffer.from('{ invalid syntax ]'));
      await new Promise(resolve => setTimeout(resolve, 2000));

      await vscode.workspace.fs.writeFile(testUri, Buffer.from('import { PicketyStatusBar } from "../vscode/statusBar";\n'));
      await new Promise(resolve => setTimeout(resolve, 2000));

      const testDiagnostics = vscode.languages.getDiagnostics(testUri);
      const picketyTestDiag = testDiagnostics.find(d => d.source === 'pickety');
      assert.ok(!picketyTestDiag, 'Should not enforce boundary rules when config is malformed');

    } finally {
      await vscode.workspace.fs.writeFile(configUri, originalConfig);
      try {
        await vscode.workspace.fs.delete(testUri);
      } catch (_e) { }
    }
  }).timeout(15000);
});
