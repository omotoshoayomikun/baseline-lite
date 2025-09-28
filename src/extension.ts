// src/extension.ts
import * as vscode from 'vscode';
import { initBaselineIndex } from './baseline';
import { refreshBaseline } from './diagnostics';
import { hoverProvider } from './hovers';
import { renderDecorations, disposeUI } from './ui';

export function activate(context: vscode.ExtensionContext) {
  initBaselineIndex();

  const collection = vscode.languages.createDiagnosticCollection('baselineLite');
  context.subscriptions.push(collection);

  function run(doc?: vscode.TextDocument) {
    const active = doc ?? vscode.window.activeTextEditor?.document;
    if (!active) return;

    const presentation = (vscode.workspace.getConfiguration('baselineLite').get('presentation') as 'diagnostic'|'decorations'|'both') ?? 'diagnostic';
    // Produce diagnostics and get findings
    const findings = refreshBaseline(active, collection, presentation);

    // Render decorations if requested
    const editor = vscode.window.activeTextEditor;
    if (presentation === 'decorations' || presentation === 'both') {
      if (editor && editor.document.uri.toString() === active.uri.toString()) {
        renderDecorations(editor, findings);
      }
    } else if (editor) {
      // Clear decorations if switched back to diagnostics-only
      renderDecorations(editor, []);
    }
  }

  if (vscode.window.activeTextEditor) run(vscode.window.activeTextEditor.document);

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(d => run(d)),
    vscode.workspace.onDidChangeTextDocument(e => run(e.document)),
    vscode.window.onDidChangeActiveTextEditor(ed => { if (ed) run(ed.document); }),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('baselineLite')) run(); }),
    vscode.languages.registerHoverProvider({ language: 'css' }, hoverProvider),
    vscode.languages.registerHoverProvider({ language: 'html' }, hoverProvider),
    vscode.languages.registerHoverProvider({ language: 'javascript' }, hoverProvider),
    vscode.languages.registerHoverProvider({ language: 'typescript' }, hoverProvider),
    vscode.languages.registerHoverProvider({ language: 'javascriptreact' }, hoverProvider),
    vscode.languages.registerHoverProvider({ language: 'typescriptreact' }, hoverProvider),
  );

}

export function deactivate() { disposeUI(); }
