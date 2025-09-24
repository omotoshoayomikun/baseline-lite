// src/baseline.ts
import { features } from 'web-features';
import * as mdnData from '@mdn/browser-compat-data';

export type BaselineStatus = 'high' | 'low' | false;

export interface BaselineFeatureInfo {
  featureId: string;
  featureName: string;
  baseline: BaselineStatus;
  mdnUrl?: string;
  description?: string;
}

export const baselineIndex: Map<string, BaselineFeatureInfo> = new Map();

export function baselineLabel(status: BaselineStatus): string {
  switch (status) {
    case 'high': return 'Widely available';
    case 'low':  return 'Newly available';
    case false:  return 'Limited availability';
  }
}

/** Narrow only to real features (skip "moved"/"split" metadata objects) */
function isFeatureEntry(entry: any): entry is {
  kind: 'feature';
  name?: string;
  description?: string;
  status: { baseline: BaselineStatus; baseline_low_date?: string; baseline_high_date?: string };
  compat_features?: string[];
} {
  return entry && entry.kind === 'feature' && entry.status && 'baseline' in entry.status;
}

/** Build the lookup index from web-features + MDN BCD */
export function initBaselineIndex() {
  baselineIndex.clear();

  // features is an object map: id -> entry (feature | moved | split)
  for (const [featureId, entry] of Object.entries(features as any)) {
    if (!isFeatureEntry(entry)) continue; // <— this avoids the TS errors
    const status = entry.status.baseline as BaselineStatus;
    const featureName: string = entry.name || featureId;
    const compatKeys: string[] = Array.isArray(entry.compat_features) ? entry.compat_features : [];

    for (const bcdKey of compatKeys) {
      if (!bcdKey.startsWith('css.')) continue; // this extension focuses on CSS
      const parts = bcdKey.split('.'); // e.g. css.properties.text-wrap
      if (parts.length < 3) continue;
      const category = parts[1];   // 'properties' | 'selectors' | 'at-rules' | ...
      const name = parts[2];

      let key: string | null = null;
      if (category === 'properties') {
        if (parts.length === 3) {
          key = name; // property
        } else if (parts.length === 4) {
          key = `${name}::${parts[3]}`; // property::value
        }
      } else if (category === 'selectors') {
        key = `:${name}`; // :has, ::placeholder
      } else if (category === 'at-rules') {
        key = `@${name}`; // @container, @scope, etc.
      }

      if (!key) continue;

      // Resolve MDN URL via BCD
      let mdnUrl: string | undefined;
      try {
        let node: any = mdnData;
        for (const part of bcdKey.split('.')) node = node?.[part];
        mdnUrl = node?.__compat?.mdn_url;
      } catch { mdnUrl = undefined; }

      baselineIndex.set(key, {
        featureId,
        featureName,
        baseline: status,
        mdnUrl,
        description: entry.description || undefined,
      });

      // Also seed a CSS page-derived property if MDN URL indicates Web/CSS/<prop>
      if (!mdnUrl?.includes('/docs/Web/CSS/')) continue;
      const segments = mdnUrl.split('/docs/Web/CSS/');
      if (segments.length === 2) {
        const slugProp = segments[1];
        // Avoid compound pages like "CSS_Grid_Layout/Subgrid"
        if (slugProp && !slugProp.includes('/')) {
          const propKey = slugProp.toLowerCase();
          if (!baselineIndex.has(propKey)) {
            baselineIndex.set(propKey, {
              featureId,
              featureName,
              baseline: status,
              mdnUrl,
              description: entry.description || undefined,
            });
          }
        }
      }
    }
  }
}
