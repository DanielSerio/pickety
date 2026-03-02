# Issue

While testing pickety in other applications, I found that the application is not working as expected. First, 'on save' does not seem to rerun picket check. Second, the reporting of the results is not very clear/noisey.

## Problems

1. On save does not seem to rerun picket check
2. 'info' level violations are being picked up the same as errors and warnings.
3. When we only have warnings, the status bar should be yellow, not red.
4. Use colored icons instead of full color backgrounds for the status bar.

## Solutions

### 1. On save does not rerun picket check

**Root cause:** The `fileWatcher` in `registerEventListeners()` ([src/services/documentValidator.ts:166](src/services/documentValidator.ts#L166)) only handles `onDidCreate` and `onDidDelete`. File changes from external editors or tools are not picked up because there is no `onDidChange` handler.

**Fix:** Add an `onDidChange` handler to the `fileWatcher` that finds the matching open document and re-runs analysis:

```typescript
fileWatcher.onDidChange(async (uri) => {
  const doc = vscode.workspace.textDocuments.find(
    (d) => normalizePath(d.uri.fsPath) === normalizePath(uri.fsPath)
  );
  if (doc) {
    this.analysisService.updateFile(doc.uri.fsPath, doc.getText(), this.analysisService.getWorkspaceContext());
    this.analyzeDocument(doc);
    this.codeLensProvider?.refresh();
  }
});
```

---

### 2. `info` level violations are being picked up the same as errors and warnings

**Root cause:** In `PicketyStatusBar.update()` ([src/vscode/statusBar.ts:23](src/vscode/statusBar.ts#L23)), all pickety diagnostics are counted together regardless of severity, including `vscode.DiagnosticSeverity.Information` items.

**Fix:** Exclude `Information` severity from the violation count:

```typescript
diagnosticCollection.forEach((_uri, diagnostics) => {
  violationCount += diagnostics.filter(
    (d) => d.source === "pickety" && d.severity !== vscode.DiagnosticSeverity.Information
  ).length;
});
```

---

### 3. When we only have warnings, the status bar should be yellow, not red

**Root cause:** `PicketyStatusBar.update()` ([src/vscode/statusBar.ts:30](src/vscode/statusBar.ts#L30)) always uses `statusBarItem.errorBackground` when `violationCount > 0`, regardless of whether all violations are warnings.

**Fix:** Count errors and warnings separately, then choose the appropriate background color:

```typescript
let errorCount = 0;
let warningCount = 0;
diagnosticCollection.forEach((_uri, diagnostics) => {
  diagnostics.filter((d) => d.source === "pickety").forEach((d) => {
    if (d.severity === vscode.DiagnosticSeverity.Error) errorCount++;
    else if (d.severity === vscode.DiagnosticSeverity.Warning) warningCount++;
  });
});
const violationCount = errorCount + warningCount;
const bgColor = errorCount > 0 ? "statusBarItem.errorBackground" : "statusBarItem.warningBackground";
```

---

### 4. Use colored icons instead of full color backgrounds for the status bar

**Root cause:** Setting `item.backgroundColor` colors the entire status bar item, which is visually heavy. The intent is just to signal severity through the icon color.

**Fix:** Remove `backgroundColor` and use `item.color` with a `ThemeColor` to tint only the icon and text. Combine with problems 2 and 3 for a unified rewrite of the violation branch:

```typescript
// Errors present → red icon
this.item.color = new vscode.ThemeColor("statusBarItem.errorForeground");
this.item.backgroundColor = undefined;

// Warnings only → yellow icon
this.item.color = new vscode.ThemeColor("statusBarItem.warningForeground");
this.item.backgroundColor = undefined;

// No violations → default color
this.item.color = undefined;
this.item.backgroundColor = undefined;
```
