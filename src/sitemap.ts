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

/** Per-file byte cap from the sitemaps.org protocol: 50MB, measured uncompressed. */
export const SITEMAP_BYTE_LIMIT = 52_428_800;

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

export interface SitemapChunkOptions {
  /** Max URLs per file. Default 50,000 (sitemaps.org). */
  maxUrls?: number;
  /** Max uncompressed bytes per file. Default 50MB (sitemaps.org). */
  maxBytes?: number;
}

const ENCODER = new TextEncoder();
const utf8Bytes = (s: string): number => ENCODER.encode(s).length;

// Conservative fixed overhead of a urlset file: XML declaration plus the open
// tag carrying BOTH namespaces (the larger, alternates-bearing form) plus the
// close tag. Using the larger header guarantees a packed chunk never exceeds
// maxBytes regardless of whether its entries declare hreflang alternates.
const URLSET_WRAP_BYTES = utf8Bytes(
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n</urlset>\n`,
);

/**
 * Greedily pack entries into chunks bounded by BOTH maxUrls and maxBytes
 * (whichever is hit first), measuring rendered UTF-8 byte size. A single entry
 * larger than maxBytes still occupies its own chunk rather than being dropped.
 */
function packChunks(
  entries: readonly SitemapEntry[],
  maxUrls: number,
  maxBytes: number,
): SitemapEntry[][] {
  const chunks: SitemapEntry[][] = [];
  let current: SitemapEntry[] = [];
  let currentBytes = URLSET_WRAP_BYTES;
  for (const entry of entries) {
    const entryBytes = utf8Bytes(renderUrlEntry(entry)) + 1; // +1 for the joining newline
    const wouldOverflowBytes = current.length > 0 && currentBytes + entryBytes > maxBytes;
    const wouldOverflowUrls = current.length >= maxUrls;
    if (wouldOverflowUrls || wouldOverflowBytes) {
      chunks.push(current);
      current = [];
      currentBytes = URLSET_WRAP_BYTES;
    }
    current.push(entry);
    currentBytes += entryBytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Split entries across one or more sitemap files plus an index when a single
 * file would exceed the per-file URL or byte limit. Returns files relative to
 * dist/.
 *
 * Within limits: ["sitemap.xml"].
 * Over a limit: ["sitemap-0.xml", "sitemap-1.xml", ..., "sitemap.xml" (the index)].
 *
 * The third argument accepts a plain number (legacy: the URL cap) or an options
 * object carrying maxUrls and maxBytes.
 */
export function buildSitemapFiles(
  entries: readonly SitemapEntry[],
  siteUrl: string,
  opts: number | SitemapChunkOptions = {},
): SitemapFile[] {
  const maxUrls = typeof opts === "number" ? opts : (opts.maxUrls ?? SITEMAP_URL_LIMIT);
  const maxBytes =
    typeof opts === "number" ? SITEMAP_BYTE_LIMIT : (opts.maxBytes ?? SITEMAP_BYTE_LIMIT);
  if (maxUrls <= 0) {
    throw new Error(`@rafters/astro-meta/sitemap: maxUrls must be > 0 (got ${maxUrls})`);
  }
  if (maxBytes <= 0) {
    throw new Error(`@rafters/astro-meta/sitemap: maxBytes must be > 0 (got ${maxBytes})`);
  }

  const chunks = packChunks(entries, maxUrls, maxBytes);
  if (chunks.length <= 1) {
    return [{ path: "sitemap.xml", content: renderSitemap(chunks[0] ?? []) }];
  }
  const files: SitemapFile[] = [];
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
