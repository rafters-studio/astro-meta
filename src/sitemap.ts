// @rafters/astro-meta/sitemap — sitemap.xml + sitemap-index
//
// Sitemap emission with lastmod, changefreq, priority, and hreflang
// alternates. Splits into a sitemap-index when entry count crosses the
// per-file URL cap defined by sitemaps.org (50,000).

import type { MetaContext } from "./index.js";
import { isAbsoluteUrl } from "./internal/render-site-meta.js";

export type ChangeFrequency =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export interface SitemapEntry {
  url: string;
  lastmod?: Date;
  changefreq?: ChangeFrequency;
  /** 0.0 to 1.0; sitemap protocol's relative priority hint. */
  priority?: number;
  /** Locale -> URL map; emitted as xhtml:link rel=alternate hreflang. */
  alternates?: Readonly<Record<string, string>>;
}

export interface SitemapSource {
  key: readonly string[];
  collect: (ctx: MetaContext) => Promise<readonly SitemapEntry[]> | readonly SitemapEntry[];
}

/** Per-file URL cap from the sitemaps.org protocol. */
export const SITEMAP_URL_LIMIT = 50_000;

const escapeXml = (v: string): string =>
  v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function clampPriority(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function formatPriority(value: number): string {
  return clampPriority(value).toFixed(1);
}

function renderUrlEntry(entry: SitemapEntry): string {
  const children: string[] = [`    <loc>${escapeXml(entry.url)}</loc>`];
  if (entry.lastmod !== undefined) {
    children.push(`    <lastmod>${entry.lastmod.toISOString()}</lastmod>`);
  }
  if (entry.changefreq !== undefined) {
    children.push(`    <changefreq>${entry.changefreq}</changefreq>`);
  }
  if (entry.priority !== undefined) {
    children.push(`    <priority>${formatPriority(entry.priority)}</priority>`);
  }
  if (entry.alternates) {
    for (const [locale, href] of Object.entries(entry.alternates)) {
      children.push(
        `    <xhtml:link rel="alternate" hreflang="${escapeXml(locale)}" href="${escapeXml(href)}"/>`,
      );
    }
  }
  return `  <url>\n${children.join("\n")}\n  </url>`;
}

export function renderSitemap(entries: readonly SitemapEntry[]): string {
  const hasAlternates = entries.some((e) => e.alternates !== undefined);
  const xmlns = hasAlternates
    ? 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:xhtml="http://www.w3.org/1999/xhtml"'
    : 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
  const body = entries.map(renderUrlEntry).join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset ${xmlns}>\n` +
    `${body}${body.length > 0 ? "\n" : ""}` +
    `</urlset>\n`
  );
}

export function renderSitemapIndex(sitemapUrls: readonly string[]): string {
  const body = sitemapUrls
    .map((url) => `  <sitemap>\n    <loc>${escapeXml(url)}</loc>\n  </sitemap>`)
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${body}${body.length > 0 ? "\n" : ""}` +
    `</sitemapindex>\n`
  );
}

export interface CollectOptions {
  sources: readonly SitemapSource[];
  ctx: MetaContext;
  logger?: { warn: (msg: string) => void };
}

/**
 * Run every configured source, validate per-entry, dedup by URL (last write
 * wins, warn on collision), sort by URL for determinism. Throws on non-
 * absolute URLs. Clamps out-of-range priority with a warning.
 */
export async function collectEntries(opts: CollectOptions): Promise<SitemapEntry[]> {
  const collected = await Promise.all(
    opts.sources.map(async (source) => ({ source, entries: await source.collect(opts.ctx) })),
  );
  const seen = new Map<string, SitemapEntry>();
  for (const { source, entries } of collected) {
    for (const entry of entries) {
      if (!isAbsoluteUrl(entry.url)) {
        throw new Error(
          `@rafters/astro-meta/sitemap: entry.url must be absolute (got "${entry.url}" from source [${source.key.join(", ")}])`,
        );
      }
      if (entry.priority !== undefined && (entry.priority < 0 || entry.priority > 1)) {
        opts.logger?.warn(
          `entry priority ${entry.priority} for ${entry.url} is outside [0, 1]; clamped`,
        );
      }
      if (seen.has(entry.url)) {
        opts.logger?.warn(`duplicate sitemap entry ${entry.url}; last write wins`);
      }
      seen.set(entry.url, entry);
    }
  }
  return [...seen.values()].toSorted((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
}

export interface SitemapFile {
  path: string;
  content: string;
}

/**
 * Split entries across one or more sitemap files plus an index when count
 * exceeds chunkSize. Returns the files to write relative to dist/.
 *
 * Up to chunkSize entries: ["sitemap.xml"].
 * More than chunkSize: ["sitemap-0.xml", "sitemap-1.xml", ..., "sitemap.xml" (the index)].
 */
export function buildSitemapFiles(
  entries: readonly SitemapEntry[],
  siteUrl: string,
  chunkSize: number = SITEMAP_URL_LIMIT,
): SitemapFile[] {
  if (chunkSize <= 0) {
    throw new Error(`@rafters/astro-meta/sitemap: chunkSize must be > 0 (got ${chunkSize})`);
  }
  if (entries.length <= chunkSize) {
    return [{ path: "sitemap.xml", content: renderSitemap(entries) }];
  }
  const files: SitemapFile[] = [];
  const chunks: SitemapEntry[][] = [];
  for (let i = 0; i < entries.length; i += chunkSize) {
    chunks.push(entries.slice(i, i + chunkSize));
  }
  const chunkUrls: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const path = `sitemap-${i}.xml`;
    const chunk = chunks[i];
    if (chunk === undefined) continue;
    files.push({ path, content: renderSitemap(chunk) });
    chunkUrls.push(`${siteUrl}/${path}`);
  }
  files.push({ path: "sitemap.xml", content: renderSitemapIndex(chunkUrls) });
  return files;
}
