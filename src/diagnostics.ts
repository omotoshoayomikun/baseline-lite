// src/diagnostics.ts
import * as vscode from 'vscode';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { baselineIndex, baselineLabel, jsIndex } from './baseline';
import { getConfig } from './config';
import { Finding } from './ui';

type Presentation = 'diagnostic' | 'decorations' | 'both';

function toSeverity(s: ReturnType<typeof getConfig>['severityForLimited']): vscode.DiagnosticSeverity | null {
  switch (s) {
    case 'warning': return vscode.DiagnosticSeverity.Warning;
    case 'information': return vscode.DiagnosticSeverity.Information;
    case 'hint': return vscode.DiagnosticSeverity.Hint;
    case 'none': return null;
  }
}

/** Entry point used by extension.ts */
export function refreshBaseline(
  doc: vscode.TextDocument,
  diagCollection: vscode.DiagnosticCollection,
  presentation: Presentation
) {
  const findings = scanForFindings(doc);

  // Diagnostics path (Problems panel)
  if (presentation === 'diagnostic' || presentation === 'both') {
    const diags: vscode.Diagnostic[] = [];
   // inside refreshBaseline(...):
for (const f of findings) {
  if (f.status === 'high') continue;

  const msg = `${f.label}: ${baselineLabel(f.status)}`;
  const sev = f.status === false
    ? toSeverity(getConfig().severityForLimited) ?? vscode.DiagnosticSeverity.Hint
    : vscode.DiagnosticSeverity.Warning;

  if (sev !== null) {
    const d = new vscode.Diagnostic(f.range, msg, sev);
    d.source = 'Baseline';                            // ← Problems panel shows “Baseline”
    // if we have an MDN URL for the key, attach it:
    const info = baselineIndex.get(f.key);
    if (info?.mdnUrl) {
      d.code = { value: 'MDN', target: vscode.Uri.parse(info.mdnUrl) }; // ← clickable “MDN”
    }
    diags.push(d);
  }
}
    diagCollection.set(doc.uri, diags);
  } else {
    diagCollection.set(doc.uri, []);
  }

  // Decorations are rendered by extension.ts (needs the TextEditor instance)
  return findings;
}

/** Produce neutral findings (used for diagnostics or for custom UI) */
export function scanForFindings(doc: vscode.TextDocument): Finding[] {
  const lang = doc.languageId;
  const findings: Finding[] = [];

  if (lang === 'css') scanCSS(doc, findings);
  else if (lang === 'html') scanHTML(doc, findings);
  else if (
    lang === 'javascript' || lang === 'typescript' ||
    lang === 'javascriptreact' || lang === 'typescriptreact'
  ) scanJS(doc, findings);

  return findings;
}

/* ---------------- CSS ---------------- */
function scanCSS(doc: vscode.TextDocument, out: Finding[]) {
  const text = doc.getText();
  let inComment = false, braceDepth = 0;
  const lines = text.split(/\r?\n/);

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('/*')) inComment = true;
    if (inComment) { if (trimmed.includes('*/')) inComment = false; continue; }

    for (const ch of line) { if (ch === '{') braceDepth++; if (ch === '}') braceDepth--; }
    if (braceDepth < 0) braceDepth = 0;

    // @rule
    if (trimmed.startsWith('@')) {
      const m = /^@([-a-z0-9]+)/i.exec(trimmed);
      if (m) pushKey(`@${m[1]}`, lineNum, line.indexOf('@'), m[1].length + 1);
      continue;
    }

    // pseudo in selectors
    if (braceDepth === 0 && trimmed.includes(':')) {
      const pseudoRegex = /::?([A-Za-z0-9_-]+)/g;
      let match: RegExpExecArray | null;
      while ((match = pseudoRegex.exec(line)) !== null) {
        const tok = match[0].startsWith('::') ? `::${match[1]}` : `:${match[1]}`;
        pushKey(tok, lineNum, match.index, match[0].length);
      }
    }

    // declarations
    if (braceDepth > 0 && line.includes(':')) {
      const declMatch = /^\s*([-\w]+)\s*:\s*([^;]+);?$/.exec(line);
      if (declMatch) {
        const prop = declMatch[1].toLowerCase();
        const valuePart = declMatch[2].trim();
        pushKey(prop, lineNum, line.indexOf(prop), prop.length);
        for (const tok of valuePart.split(/[\s,()]+/).filter(Boolean)) {
          const val = tok.toLowerCase();
          const combo = `${prop}::${val}`;
          const idx = line.indexOf(tok, line.indexOf(':'));
          if (idx !== -1) pushKey(combo, lineNum, idx, tok.length, `${prop}: ${val}`);
        }
      }
    }
  }

  function pushKey(key: string, lineNum: number, startCol: number, len: number, niceLabel?: string) {
    const info = baselineIndex.get(key);
    if (!info || info.baseline === 'high') return;
    out.push({
      range: new vscode.Range(lineNum, startCol, lineNum, startCol + len),
      status: info.baseline,
      label: niceLabel || info.featureName || key,
      key
    });
  }
}

/* ---------------- HTML ---------------- */
function scanHTML(doc: vscode.TextDocument, out: Finding[]) {
  const text = doc.getText();
  const tagRegex = /<\s*([a-z0-9-]+)([^>]*)>/gi;
  let m: RegExpExecArray | null;

  const NOISY_GENERIC_ATTRS = new Set([
    'class','id','type','name','value','style','for','href','src','rel','title','alt'
  ]);

  while ((m = tagRegex.exec(text)) !== null) {
    const tag = m[1].toLowerCase();
    const attrsChunk = m[2] || "";

    // Attributes
    const attrRegex = /(\b[a-zA-Z_:][-a-zA-Z0-9_:.]*)(\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/=`]+)))?/g;
    let a: RegExpExecArray | null;
    while ((a = attrRegex.exec(attrsChunk)) !== null) {
      const raw = a[0];
      const attr = a[1].toLowerCase();
      const value = (a[3] || a[4] || a[5] || '').toLowerCase();

      const attrAbsStart = m.index + m[0].indexOf(raw);
      const attrNameEnd = attrAbsStart + (raw.split('=')[0] ?? attr).length;

      let picked: { key: string; start: number; end: number } | undefined;

      if (value) {
        const key = `${tag}@${attr}::${value}`;
        if (baselineIndex.has(key)) {
          const valPos = attrAbsStart + raw.indexOf(value);
          picked = { key, start: valPos, end: valPos + value.length };
        }
      }
      if (!picked) {
        const key = `${tag}@${attr}`;
        if (baselineIndex.has(key)) {
          picked = { key, start: attrAbsStart, end: attrNameEnd };
        }
      }
      if (!picked && !NOISY_GENERIC_ATTRS.has(attr)) {
        if (baselineIndex.has(attr)) {
          picked = { key: attr, start: attrAbsStart, end: attrNameEnd };
        }
      }

      if (picked) {
        const info = baselineIndex.get(picked.key)!;
        if (info.baseline === 'high') continue;
        out.push({
          range: new vscode.Range(
            doc.positionAt(picked.start),
            doc.positionAt(picked.end)
          ),
          status: info.baseline,
          label: info.featureName || picked.key,
          key: picked.key
        });
      }
    }
  }
}

/* ---------------- JS/TS ---------------- */
function scanJS(doc: vscode.TextDocument, out: Finding[]) {
  const src = doc.getText();
  let ast: any;
  try {
    ast = (acorn as any).parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  } catch {
    return;
  }

  const ROOTS = new Set(['window','document','navigator','location','history','screen','performance']);

  function add(key: string, node: any, label?: string) {
    const info = jsIndex.get(key);
    if (!info || info.baseline === 'high') return;
    out.push({
      range: new vscode.Range(
        new vscode.Position(node.loc.start.line - 1, node.loc.start.column),
        new vscode.Position(node.loc.end.line - 1, node.loc.end.column)
      ),
      status: info.baseline,
      label: label || info.featureName || key,
      key
    });
  }

  function memberPath(node: any): string[] | null {
    const parts: string[] = [];
    let cur = node;
    while (cur && cur.type === 'MemberExpression') {
      const prop = cur.property.type === 'Identifier' ? cur.property.name : (cur.property.value ?? '');
      parts.unshift(prop);
      if (cur.object.type === 'Identifier') {
        parts.unshift(cur.object.name);
        break;
      } else {
        cur = cur.object;
      }
    }
    return parts.length ? parts : null;
  }

  (walk as any).simple(ast, {
    MemberExpression(node: any) {
      const parts = memberPath(node);
      if (!parts || parts.length < 2) return;
      const root = parts[0];
      if (!ROOTS.has(root)) return;

      const runtimeKey = parts.join('.');
      if (jsIndex.has(runtimeKey)) { add(runtimeKey, node); return; }

      const capRoot = root[0].toUpperCase() + root.slice(1);
      const specKey = [capRoot].concat(parts.slice(1)).join('.');
      if (jsIndex.has(specKey)) add(specKey, node);
    },
    NewExpression(node: any) {
      if (node.callee?.type === 'Identifier') {
        const name = node.callee.name;
        if (/^[A-Z]/.test(name) && jsIndex.has(name)) add(name, node);
      }
    }
  });
}
