// Shared URL resolution for source-collected entries.
//
// llms-txt and sitemap present the same authoring surface: a source with a
// hierarchical key and a collect() returning entries carrying a url. They must
// therefore accept the same url shapes, or the same map function works for one
// and throws for the other (#44). One rule, one implementation: storing it
// twice is how the two drifted apart in the first place.

import { isAbsoluteUrl } from "./render-site-meta.js";

/**
 * Resolve a source entry URL against the site origin. Absolute URLs pass
 * through untouched so a source can point at an external host; site-relative
 * paths are joined to site.url with a leading slash supplied if missing.
 *
 * @param surface Module name for the error message, e.g. "sitemap".
 */
export function resolveSourceUrl(url: string, siteUrl: string, surface: string): string {
  if (url.length === 0) {
    throw new Error(`@rafters/astro-meta/${surface}: entry.url must be non-empty`);
  }
  if (isAbsoluteUrl(url)) return url;
  return `${siteUrl}${url.startsWith("/") ? url : `/${url}`}`;
}
