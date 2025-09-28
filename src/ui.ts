// src/ui.ts
import * as vscode from 'vscode';
import { BaselineStatus, baselineLabel } from './baseline';

export type Finding = {
  range: vscode.Range;
  status: BaselineStatus;   // 'high' | 'low' | false
  label: string;
  key: string;
};

let decLowLine: vscode.TextEditorDecorationType | undefined;
let decLimitedLine: vscode.TextEditorDecorationType | undefined;
let statusItem: vscode.StatusBarItem | undefined;

// Small Baseline-like icon; uses currentColor so it matches the badge color
const BASELINE_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16">
     <path d="M8 1l6.5 3.75v6.5L8 15 1.5 11.25v-6.5L8 1z" fill="none" stroke="currentColor" stroke-width="1.5"/>
     <path d="M4.5 8l2.3 2.3 4.7-4.7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
   </svg>`
);

function ensureDecorationTypes() {
  if (!decLowLine) {
    decLowLine = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 0.8em',
        contentText: '// Baseline: Newly Availability',
        color: new vscode.ThemeColor('editorCodeLens.foreground')
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });
  }
  if (!decLimitedLine) {
    decLimitedLine = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 0.8em',
        contentText: '// Baseline: Limited Availability',
        color: new vscode.ThemeColor('editorCodeLens.foreground')
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });
  }
  if (!statusItem) {
    statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusItem.tooltip = 'Baseline Lite summary';
    statusItem.show();
  }
}

export function disposeUI() {
  decLowLine?.dispose(); decLowLine = undefined;
  decLimitedLine?.dispose(); decLimitedLine = undefined;
  statusItem?.dispose(); statusItem = undefined;
}

export function renderDecorations(editor: vscode.TextEditor, findings: Finding[]) {
  ensureDecorationTypes();

  // group per line by status
  const perLineLow = new Map<number, Finding[]>();
  const perLineLimited = new Map<number, Finding[]>();
  let countLow = 0, countLimited = 0;

  for (const f of findings) {
    const line = f.range.start.line;
    if (f.status === 'low') {
      countLow++;
      (perLineLow.get(line) ?? perLineLow.set(line, []).get(line)!).push(f);
    } else if (f.status === false) {
      countLimited++;
      (perLineLimited.get(line) ?? perLineLimited.set(line, []).get(line)!).push(f);
    }
  }

  const lowOpts: vscode.DecorationOptions[] = [];
  const limitedOpts: vscode.DecorationOptions[] = [];

  const doc = editor.document;
  const maxLine = doc.lineCount - 1;
  const endOf = (line: number) => {
    const end = doc.lineAt(Math.min(Math.max(line, 0), maxLine)).range.end;
    return new vscode.Range(end, end);
  };

  for (const [line, items] of perLineLimited) {
    const bullets = items.map(i => `• ${i.label} — ${baselineLabel(false)}`).join('\n');
    const md = new vscode.MarkdownString(bullets); md.isTrusted = true;
    limitedOpts.push({ range: endOf(line), hoverMessage: md });
  }
  for (const [line, items] of perLineLow) {
    const bullets = items.map(i => `• ${i.label} — ${baselineLabel('low')}`).join('\n');
    const md = new vscode.MarkdownString(bullets); md.isTrusted = true;
    lowOpts.push({ range: endOf(line), hoverMessage: md });
  }

  // Paint Limited first, then Newly → at line end you'll see:  [icon] Baseline: Limited   [icon] Baseline: Newly
  editor.setDecorations(decLimitedLine!, limitedOpts);
  editor.setDecorations(decLowLine!, lowOpts);

  if (statusItem) {
    const parts: string[] = [];
    if (countLimited) parts.push(`${countLimited} limited`);
    if (countLow) parts.push(`${countLow} newly`);
    statusItem.text = parts.length ? `Baseline Lite: ${parts.join(', ')}` : 'Baseline: OK';
  }
}
