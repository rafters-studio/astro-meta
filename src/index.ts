// @rafters/astro-meta — public API
//
// The xEO emission plane for Astro 6. Per-surface module shapes for JSON-LD,
// llms.txt, robots.txt, sitemap, OG images, and build-time GEO readability
// scoring. The integration at ./astro wires registered modules into Astro's
// build pipeline.
//
// Everything exported here is part of the public surface and subject to semver.
// Anything under ./internal/ is implementation detail.

// ─── Site identity ─────────────────────────────────────────────────────────

export interface SiteIdentity {
  /** Canonical site origin without trailing slash. */
  url: string;
  /** Site title; used as the H1 in llms.txt and the default OG site name. */
  name: string;
  /** Site description; used in llms.txt's blockquote and OG/meta defaults. */
  description?: string;
  /** BCP-47 default locale tag. */
  locale?: string;
}

// ─── Per-page context passed to every emitter ──────────────────────────────

export interface PageContext {
  /** Route path including leading slash, e.g. '/blog/post-slug'. */
  route: string;
  /** Page title for head defaults. */
  title?: string;
  /** Page description for head defaults. */
  description?: string;
  /** Last-modified timestamp for sitemap and llms-full caching. */
  lastmod?: Date;
  /** BCP-47 locale; falls back to SiteIdentity.locale. */
  locale?: string;
  /** Content collection name when sourced from a collection. */
  collection?: string;
  /** Surface-specific payload (frontmatter, derived data, etc). */
  data?: unknown;
}

export interface MetaContext {
  site: SiteIdentity;
  /** Absent for site-level emissions (robots, sitemap-index, root llms.txt). */
  page?: PageContext;
}

// ─── Surfaces ──────────────────────────────────────────────────────────────

export type EmissionSurface = "head" | "robots" | "sitemap" | "llms-txt" | "og-image" | "audit";

// ─── Configuration helper ──────────────────────────────────────────────────

/** Identity-typed helper for declaring a site config. */
export function defineSite(identity: SiteIdentity): SiteIdentity {
  return identity;
}

// ─── Re-exports for consumer convenience ───────────────────────────────────

export { z } from "astro/zod";
