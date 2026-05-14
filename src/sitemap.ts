// @rafters/astro-meta/sitemap — sitemap.xml + sitemap-index
//
// Sitemap emission with lastmod, changefreq, priority, and hreflang
// alternates. Splits into a sitemap-index when entry count crosses the
// 50,000-URL per-file threshold defined by sitemaps.org.

import type { MetaContext } from "./index.js";

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

export function renderSitemap(_entries: readonly SitemapEntry[]): string {
  throw new Error("not implemented");
}

export function renderSitemapIndex(_sitemapUrls: readonly string[]): string {
  throw new Error("not implemented");
}
