import { features } from 'web-features';
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

/* ---------------- helpers ---------------- */

function mdnUrlFromSlug(slug?: string) {
  if (!slug) return;
  return `https://developer.mozilla.org/docs/${slug.replace(/^en-US\//, '')}`;
}

/** If a feature lacks mdn.url/slug, derive a best-effort URL from a BCD key */
function mdnUrlFallbackFromBCDKey(bcdKey: string): string | undefined {
  const parts = bcdKey.split('.');
  if (parts[0] === 'css') {
    if (parts[1] === 'properties' && parts[2]) {
      return `https://developer.mozilla.org/docs/Web/CSS/${parts[2]}`;
    } else if (parts[1] === 'selectors' && parts[2]) {
      return `https://developer.mozilla.org/docs/Web/CSS/${parts[2]}`;
    } else if (parts[1] === 'at-rules' && parts[2]) {
      return `https://developer.mozilla.org/docs/Web/CSS/@${parts[2]}`;
    }
  } else if (parts[0] === 'html') {
    if (parts[1] === 'elements' && parts[2]) {
      return `https://developer.mozilla.org/docs/Web/HTML/Element/${parts[2]}`;
    } else if (parts[1] === 'global_attributes' && parts[2]) {
      return `https://developer.mozilla.org/docs/Web/HTML/Global_attributes/${parts[2]}`;
    }
  } else if (parts[0] === 'api' && parts[1]) {
    // e.g. api.Navigator.clipboard → Web/API/Navigator
    const iface = parts[1];
    return `https://developer.mozilla.org/docs/Web/API/${iface}`;
  }
  return undefined;
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
    const sel = parts[2].toLowerCase();
    baselineIndex.set(`:${sel}`, info);
    baselineIndex.set(`::${sel}`, info);
  } else if (parts[1] === 'at-rules' && parts[2]) {
    baselineIndex.set(`@${parts[2].toLowerCase()}`, info);
  }

  // Also seed by slug-like segment if this is a simple CSS property page
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

/* ---------------- main index build ---------------- */

export function initBaselineIndex() {
  baselineIndex.clear();
  jsIndex.clear();

  // web-features v3: features is an object keyed by featureId
  for (const [featureId, entry] of Object.entries(features as any)) {
    // guard: we only care about entries that actually represent Baseline-track features
    const e = entry as { name?: string; mdn?: { url?: string; slug?: string }; description?: string; compat_features?: string[]; status?: { baseline?: BaselineStatus }; baseline?: BaselineStatus };

    const baseline =
      e.status?.baseline ??
      e.baseline; // tolerate both shapes

    if (baseline !== 'high' && baseline !== 'low' && baseline !== false) continue;

    const featureName: string = e.name || featureId;
    const mdnUrl: string | undefined =
      e.mdn?.url || mdnUrlFromSlug(e.mdn?.slug);

    const description: string | undefined = e.description || undefined;

    const compatKeys: string[] = Array.isArray(e.compat_features)
      ? e.compat_features
      : [];

    // Reuse the same info object for all keys tied to this feature
    const info: BaselineFeatureInfo = {
      featureId,
      featureName,
      baseline,
      mdnUrl,
      description
    };

    // Map all compat_features to our indices
    for (const bcdKey of compatKeys) {
      // If we didn't have an mdnUrl, try a fallback per-key (first one wins)
      if (!info.mdnUrl) {
        info.mdnUrl = mdnUrlFallbackFromBCDKey(bcdKey) || info.mdnUrl;
      }

      if (bcdKey.startsWith('css.')) addCssKeys(bcdKey, info);
      else if (bcdKey.startsWith('html.')) addHtmlKeys(bcdKey, info);
      else if (bcdKey.startsWith('api.')) addApiKeys(bcdKey, info);
    }
  }

  // Optional: Core CSS overrides (from your config) — mark as widely available
  // without using BCD. We also fabricate an MDN URL assuming standard CSS page.
  const { coreProperties } = getConfig();
  for (const prop of coreProperties) {
    const existing = baselineIndex.get(prop);
    if (!existing || existing.baseline !== 'high') {
      baselineIndex.set(prop, {
        featureId: `css.properties.${prop}`,
        featureName: prop,
        baseline: 'high',
        mdnUrl: `https://developer.mozilla.org/docs/Web/CSS/${prop}`,
        description: existing?.description
      });
    }
  }
}
