import * as vscode from 'vscode';
import { baselineIndex, baselineLabel, jsIndex } from './baseline';

const NOISY_GENERIC_ATTRS = new Set([
  'class','id','type','name','value','style','for','href','src','rel','title','alt'
]);

export const hoverProvider: vscode.HoverProvider = {
  provideHover(document, position) {
    const line = document.lineAt(position.line).text;

    // HTML context (keep your improved logic)
    const tagCtx = /<\s*([a-z0-9-]+)([^>]*)>/i.exec(line);
    if (tagCtx) {
      const tag = tagCtx[1].toLowerCase();
      const attrs = tagCtx[2] || "";

      // Attribute + value parsing
      const attrRegex = /(\b[\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/=`]+))/g;
      let a: RegExpExecArray | null;
      let bestKey: string | undefined;
      let bestRange: vscode.Range | undefined;

      while ((a = attrRegex.exec(attrs)) !== null) {
        const raw = a[0];
        const attr = a[1].toLowerCase();
        const val = (a[2] || a[3] || a[4] || '').toLowerCase();

        // value key
        if (val) {
          const key = `${tag}@${attr}::${val}`;
          if (baselineIndex.has(key)) {
            const idxInLine = line.indexOf(raw);
            const valCol = idxInLine + raw.indexOf(val);
            const r = new vscode.Range(position.line, valCol, position.line, valCol + val.length);
            if (r.contains(position)) { bestKey = key; bestRange = r; break; }
          }
        }

        // element attr key
        const attrKey = `${tag}@${attr}`;
        if (baselineIndex.has(attrKey)) {
          const idx = line.indexOf(raw);
          const nameEnd = idx + (raw.split('=')[0] ?? attr).length;
          const r = new vscode.Range(position.line, idx, position.line, nameEnd);
          if (!bestKey && r.contains(position)) { bestKey = attrKey; bestRange = r; }
        }

        // global attr (not noisy)
        if (!bestKey && !NOISY_GENERIC_ATTRS.has(attr) && baselineIndex.has(attr)) {
          const idx = line.indexOf(raw);
          const nameEnd = idx + (raw.split('=')[0] ?? attr).length;
          const r = new vscode.Range(position.line, idx, position.line, nameEnd);
          if (r.contains(position)) { bestKey = attr; bestRange = r; }
        }
      }

      if (bestKey && bestRange) return hoverForKey(baselineIndex.get(bestKey)!, bestRange);
    }

    // CSS fallback (token variants)
    const tokenRange = document.getWordRangeAtPosition(position, /[@:]?[:\w-]+/);
    if (tokenRange) {
      const token = document.getText(tokenRange);
      const variants = [
        token.toLowerCase(),
        token,
        token.startsWith(':') ? token : `:${token}`,
        token.startsWith('::') ? token : `::${token}`,
        token.startsWith('@') ? token : `@${token}`
      ];
      for (const k of variants) {
        const info = baselineIndex.get(k);
        if (info) return hoverForKey(info, tokenRange);
      }
    }

    // JS Web API hover: look left and right to form a simple member path
    const jsRange = document.getWordRangeAtPosition(position, /[\w$]+/);
    if (!jsRange) return;

    // Capture a dotted sequence around the cursor line (quick heuristic)
    const jsLine = line;
    const dotSeqRegex = /([A-Za-z_$][\w$]*)(\.[A-Za-z_$][\w$]*)+/g;
    let m: RegExpExecArray | null;
    let pickKey: string | undefined;
    let pickRange: vscode.Range | undefined;

    while ((m = dotSeqRegex.exec(jsLine)) !== null) {
      const seq = m[0]; // e.g., navigator.clipboard.readText
      const startCol = m.index;
      const endCol = startCol + seq.length;
      const r = new vscode.Range(position.line, startCol, position.line, endCol);
      if (!r.contains(position)) continue;

      // Try runtime key first
      if (jsIndex.has(seq)) { pickKey = seq; pickRange = r; break; }

      // Try capitalized root
      const parts = seq.split('.');
      const cap = parts[0][0].toUpperCase() + parts[0].slice(1);
      const specKey = [cap].concat(parts.slice(1)).join('.');
      if (jsIndex.has(specKey)) { pickKey = specKey; pickRange = r; break; }
    }

    // Constructors near cursor (single word, capitalized), but only if in jsIndex
    if (!pickKey && jsRange) {
      const name = document.getText(jsRange);
      if (/^[A-Z]/.test(name) && jsIndex.has(name)) {
        pickKey = name; pickRange = jsRange;
      }
    }

    if (pickKey && pickRange) return hoverForKey(jsIndex.get(pickKey)!, pickRange);
    return;
  }
};

function hoverForKey(info: any, range: vscode.Range) {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${info.featureName}** — *Baseline: ${baselineLabel(info.baseline)}*`);
  if (info.description) md.appendMarkdown(`\n\n${info.description}`);
  if (info.mdnUrl) md.appendMarkdown(`\n\n[MDN Reference](${info.mdnUrl})`);
  md.isTrusted = true;
  return new vscode.Hover(md, range);
}
