import { features } from 'web-features';
import * as mdnData from '@mdn/browser-compat-data';
import { getConfig } from './config';

export type BaselineStatus = 'high' | 'low' | false;

export interface BaselineFeatureInfo {
  featureId: string;
  featureName: string;
  baseline: BaselineStatus;
  mdnUrl?: string;
  description?: string;
}

/** Unified lookups for CSS/HTML; JS-only APIs go to jsIndex to avoid collisions */
export const baselineIndex: Map<string, BaselineFeatureInfo> = new Map();
/** JS-only keys: dotted API paths (e.g., navigator.clipboard) and constructors (ClipboardItem) */
export const jsIndex: Map<string, BaselineFeatureInfo> = new Map();

export function baselineLabel(status: BaselineStatus): string {
  switch (status) {
    case 'high': return 'Widely available';
    case 'low':  return 'Newly available';
    case false:  return 'Limited availability';
  }
}

function isFeatureEntry(entry: any): entry is {
  kind: 'feature';
  name?: string;
  description?: string;
  status: { baseline: BaselineStatus; baseline_low_date?: string; baseline_high_date?: string };
  compat_features?: string[];
} {
  return entry && entry.kind === 'feature' && entry.status && 'baseline' in entry.status;
}

function mdnUrlFromBCDKey(bcdKey: string): string | undefined {
  try {
    let node: any = mdnData;
    for (const p of bcdKey.split('.')) node = node?.[p];
    return node?.__compat?.mdn_url;
  } catch { return undefined; }
}

/* ---------- HTML keys (tight) ---------- */
function addHtmlKeys(bcdKey: string, info: BaselineFeatureInfo) {
  const parts = bcdKey.split('.');
  if (parts[1] !== 'elements' && parts[1] !== 'global_attributes') return;

  if (parts[1] === 'elements') {
    const tag = parts[2]?.toLowerCase();
    if (!tag) return;

    // Tag-only feature
    if (parts.length === 3) {
      baselineIndex.set(tag, info);
      return;
    }
    // Attribute (no value)
    if (parts.length === 4) {
      const attr = parts[3].toLowerCase();
      baselineIndex.set(`${tag}@${attr}`, info);
      return;
    }
    // Attribute value
    if (parts.length >= 5) {
      const attr = parts[3].toLowerCase();
      const value = parts[4].toLowerCase();
      baselineIndex.set(`${tag}@${attr}::${value}`, info);
      return;
    }
  }

  if (parts[1] === 'global_attributes') {
    const attr = parts[2]?.toLowerCase();
    if (attr) baselineIndex.set(attr, info);
  }
}

/* ---------- CSS keys ---------- */
function addCssKeys(bcdKey: string, info: BaselineFeatureInfo) {
  const parts = bcdKey.split('.');
  if (parts[1] === 'properties' && parts[2]) {
    const prop = parts[2].toLowerCase();
    if (parts.length === 3) baselineIndex.set(prop, info);
    else if (parts.length === 4) baselineIndex.set(`${prop}::${parts[3].toLowerCase()}`, info);
  } else if (parts[1] === 'selectors' && parts[2]) {
    baselineIndex.set(`:${parts[2].toLowerCase()}`, info);
    baselineIndex.set(`::${parts[2].toLowerCase()}`, info);
  } else if (parts[1] === 'at-rules' && parts[2]) {
    baselineIndex.set(`@${parts[2].toLowerCase()}`, info);
  }

  // Seed from MDN CSS URL (single-segment property pages)
  const url = info.mdnUrl;
  if (url?.includes('/docs/Web/CSS/')) {
    const slug = url.split('/docs/Web/CSS/')[1];
    if (slug && !slug.includes('/')) baselineIndex.set(slug.toLowerCase(), info);
  }
}

/* ---------- Web API keys (JS-only index) ---------- */
function addApiKeys(bcdKey: string, info: BaselineFeatureInfo) {
  // bcdKey like: api.Navigator.clipboard / api.ClipboardItem
  const parts = bcdKey.split('.');
  if (parts[0] !== 'api' || parts.length < 2) return;

  const apiPath = parts.slice(1).join('.'); // Navigator.clipboard, ClipboardItem, etc.
  // runtime-style: navigator.clipboard  (lowercased root)
  const first = parts[1];
  if (!first) return;
  const loweredRoot = first[0].toLowerCase() + first.slice(1);
  if (parts.length >= 3) {
    jsIndex.set([loweredRoot].concat(parts.slice(2)).join('.'), info);
  }

  // prototype-style / spec path (Navigator.clipboard)
  if (apiPath.includes('.')) {
    jsIndex.set(apiPath, info);
  }

  // constructor name (only Capitalized)
  if (!apiPath.includes('.') && /^[A-Z]/.test(apiPath)) {
    jsIndex.set(apiPath, info);
  }
}

export function initBaselineIndex() {
  baselineIndex.clear();
  jsIndex.clear();

  for (const [featureId, entry] of Object.entries(features as any)) {
    if (!isFeatureEntry(entry)) continue;
    const status = entry.status.baseline as BaselineStatus;
    const featureName = entry.name || featureId;
    const compatKeys: string[] = Array.isArray(entry.compat_features) ? entry.compat_features : [];

    for (const bcdKey of compatKeys) {
      const info: BaselineFeatureInfo = {
        featureId,
        featureName,
        baseline: status,
        mdnUrl: mdnUrlFromBCDKey(bcdKey),
        description: entry.description || undefined
      };
      if (bcdKey.startsWith('css.')) addCssKeys(bcdKey, info);
      else if (bcdKey.startsWith('html.')) addHtmlKeys(bcdKey, info);
      else if (bcdKey.startsWith('api.')) addApiKeys(bcdKey, info);
    }
  }

  // Core CSS overrides (cursor, etc.)
  const { coreProperties } = getConfig();
  for (const prop of coreProperties) {
    const existing = baselineIndex.get(prop);
    if (!existing || existing.baseline !== 'high') {
      const url = (mdnData as any).css?.properties?.[prop]?.__compat?.mdn_url;
      baselineIndex.set(prop, {
        featureId: `css.properties.${prop}`,
        featureName: prop,
        baseline: 'high',
        mdnUrl: url,
        description: existing?.description
      });
    }
  }
}
