
// src/hovers.ts
import * as vscode from 'vscode';
import { baselineIndex, baselineLabel } from './baseline';
import { features } from 'web-features';

export const hoverProvider: vscode.HoverProvider = {
  provideHover(document, position, token) {
    const range = document.getWordRangeAtPosition(position, /[@:]?[:\w-]+/);
    if (!range) return undefined;
    const word = document.getText(range);

    let info = baselineIndex.get(word);
    if (!info && word.includes(':')) {
      const line = document.lineAt(position.line).text;
      const declMatch = /^\s*([\-\w]+)\s*:\s*([^;]+);?$/.exec(line);
      if (declMatch) {
        const propName = declMatch[1];
        const tokens = declMatch[2].trim().split(/[\s,()]+/);
        for (const token of tokens) {
          if (token === word) {
            info = baselineIndex.get(`${propName}::${token}`);
            break;
          }
        }
      }
    }
    if (!info) return undefined;

    const statusText = baselineLabel(info.baseline);
    const description = info.description ? info.description : '';
    const mdnLink = info.mdnUrl ? `[MDN Reference](${info.mdnUrl})` : '';

    const feat = (features as any)[info.featureId];
    const lowDate = feat?.status?.baseline_low_date;
    const highDate = feat?.status?.baseline_high_date;

    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${info.featureName || word}** — *Baseline: ${statusText}*`);
    if (info.baseline === 'low' && lowDate) md.appendMarkdown(` (added to Baseline on ${lowDate})`);
    if (info.baseline === 'high' && highDate) md.appendMarkdown(` (widely supported since ${highDate})`);
    md.appendMarkdown(`*\n\n`);
    if (description) md.appendMarkdown(`${description}\n\n`);
    if (mdnLink) md.appendMarkdown(`${mdnLink}\n`);
    md.isTrusted = true;
    return new vscode.Hover(md, range);
  }
};
