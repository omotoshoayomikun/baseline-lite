
// src/extension.ts
import * as vscode from 'vscode';
import { initBaselineIndex } from './baseline';
import { refreshBaselineDiagnostics } from './diagnostics';
import { hoverProvider } from './hovers';

export function activate(context: vscode.ExtensionContext) {
  initBaselineIndex();

  const collection = vscode.languages.createDiagnosticCollection('baselineFeatures');
  context.subscriptions.push(collection);

  if (vscode.window.activeTextEditor) {
    refreshBaselineDiagnostics(vscode.window.activeTextEditor.document, collection);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => refreshBaselineDiagnostics(doc, collection)),
    vscode.workspace.onDidChangeTextDocument(e => refreshBaselineDiagnostics(e.document, collection)),
    vscode.languages.registerHoverProvider({ language: 'css', scheme: '*' }, hoverProvider)
  );
}

export function deactivate() {}
