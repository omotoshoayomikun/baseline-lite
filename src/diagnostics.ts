
// src/diagnostics.ts
import * as vscode from 'vscode';
import { baselineIndex, baselineLabel, BaselineFeatureInfo } from './baseline';

/** Scan a CSS document and produce diagnostics for Baseline low/false */
export function refreshBaselineDiagnostics(doc: vscode.TextDocument, diagCollection: vscode.DiagnosticCollection): void {
  if (doc.languageId !== 'css') return;
  const diagnostics: vscode.Diagnostic[] = [];
  const text = doc.getText();

  let inComment = false;
  let braceDepth = 0;
  const lines = text.split(/\r?\n/);

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const trimmed = line.trim();
    if (!trimmed) continue;

    // comment blocks
    if (trimmed.startsWith('/*')) inComment = true;
    if (inComment) {
      if (trimmed.includes('*/')) inComment = false;
      continue;
    }

    // Track block depth
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }
    if (braceDepth < 0) braceDepth = 0;

    // @rules
    if (trimmed.startsWith('@')) {
      const atRuleMatch = /^@([-a-z0-9]+)/i.exec(trimmed);
      if (atRuleMatch) {
        const atName = atRuleMatch[1];
        const key = `@${atName}`;
        const info = baselineIndex.get(key);
        if (info && info.baseline !== 'high') {
          const startCol = line.indexOf('@');
          const endCol = startCol + atName.length + 1;
          const range = new vscode.Range(lineNum, startCol, lineNum, endCol);
          const statusText = baselineLabel(info.baseline);
          const message = `${info.featureName || key}: ${statusText} – not fully supported across all major browsers`;
          diagnostics.push(new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning));
        }
      }
      continue;
    }

    // Pseudos in selector context (outside declaration blocks)
    if (braceDepth === 0 && trimmed.includes(':')) {
      const pseudoRegex = /::?([A-Za-z0-9_-]+)/g;
      let match: RegExpExecArray | null;
      while ((match = pseudoRegex.exec(line)) !== null) {
        const pseudoName = match[1];
        const key = `:${pseudoName}`;
        const info = baselineIndex.get(key);
        if (info && info.baseline !== 'high') {
          const matchStr = match[0];
          const startCol = match.index;
          const endCol = startCol + matchStr.length;
          const range = new vscode.Range(lineNum, startCol, lineNum, endCol);
          const statusText = baselineLabel(info.baseline);
          const message = `${info.featureName || matchStr}: ${statusText} – not fully supported across all major browsers`;
          diagnostics.push(new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning));
        }
      }
    }

    // Declarations inside blocks
    if (braceDepth > 0 && line.includes(':')) {
      const declMatch = /^\s*([\-\w]+)\s*:\s*([^;]+);?$/.exec(line);
      if (declMatch) {
        const propName = declMatch[1];
        const valuePart = declMatch[2].trim();
        const propInfo = baselineIndex.get(propName);
        if (propInfo && propInfo.baseline !== 'high') {
          const startCol = line.indexOf(propName);
          const endCol = startCol + propName.length;
          const range = new vscode.Range(lineNum, startCol, lineNum, endCol);
          const statusText = baselineLabel(propInfo.baseline);
          const message = `${propInfo.featureName || propName}: ${statusText} – not fully supported across all major browsers`;
          diagnostics.push(new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning));
        }
        const tokens = valuePart.split(/[\s,()]+/).filter(tok => tok.length > 0);
        for (const token of tokens) {
          const comboKey = `${propName}::${token}`;
          const comboInfo = baselineIndex.get(comboKey);
          if (comboInfo && comboInfo.baseline !== 'high') {
            const valIndex = line.indexOf(token, line.indexOf(':'));
            if (valIndex !== -1) {
              const range = new vscode.Range(lineNum, valIndex, lineNum, valIndex + token.length);
              const statusText = baselineLabel(comboInfo.baseline);
              const message = `${comboInfo.featureName || `${propName}: ${token}`}: ${statusText} – not fully supported across all major browsers`;
              diagnostics.push(new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning));
            }
          }
        }
      }
    }
  }

  diagCollection.set(doc.uri, diagnostics);
}
