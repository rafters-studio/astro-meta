// Site-level head tag rendering. Pure: takes a SiteIdentity + route, returns
// the HTML string to inject into <head>. Tested independently of the Astro
// middleware that calls it.

import type { SiteIdentity } from "../index.js";

const escapeAttr = (v: string): string =>
  v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Per-page overrides for the site-level head. Every field is optional; an empty
 * object reproduces the site-default behavior (og:type website, no image, title
 * and description from the SiteIdentity).
 */
export interface SiteMetaOptions {
  /** Per-page title; falls back to site.name. */
  title?: string;
  /** Per-page description; falls back to site.description. */
  description?: string;
  /** Open Graph object type. Default "website"; "article" enables article:* tags. */
  ogType?: "website" | "article";
  /** ISO 8601 publish time; emitted as article:published_time when ogType is "article". */
  publishedTime?: string;
  /** ISO 8601 modified time; emitted as article:modified_time when ogType is "article". */
  modifiedTime?: string;
  /** Social share image; absolute, or site-relative and resolved against site.url. */
  image?: string;
}

/** Resolve a possibly site-relative image to an absolute URL against the site origin. */
function resolveImage(site: SiteIdentity, image: string): string {
  if (isAbsoluteUrl(image)) return image;
  return `${site.url}${image.startsWith("/") ? image : `/${image}`}`;
}

export function renderSiteMeta(
  site: SiteIdentity,
  route: string,
  opts: SiteMetaOptions = {},
): string {
  const pageUrl = `${site.url}${route.startsWith("/") ? route : `/${route}`}`;
  const ogType = opts.ogType ?? "website";
  const title = opts.title ?? site.name;
  const description = opts.description ?? site.description;
  const tags = [
    '<meta name="generator" content="@rafters/astro-meta">',
    `<link rel="canonical" href="${escapeAttr(pageUrl)}">`,
    `<meta property="og:site_name" content="${escapeAttr(site.name)}">`,
    `<meta property="og:title" content="${escapeAttr(title)}">`,
    `<meta property="og:url" content="${escapeAttr(pageUrl)}">`,
    `<meta property="og:type" content="${ogType}">`,
    '<meta name="twitter:card" content="summary_large_image">',
  ];
  if (description) {
    tags.push(`<meta name="description" content="${escapeAttr(description)}">`);
    tags.push(`<meta property="og:description" content="${escapeAttr(description)}">`);
  }
  if (opts.image) {
    const imageUrl = resolveImage(site, opts.image);
    tags.push(`<meta property="og:image" content="${escapeAttr(imageUrl)}">`);
    tags.push(`<meta name="twitter:image" content="${escapeAttr(imageUrl)}">`);
  }
  if (ogType === "article") {
    if (opts.publishedTime) {
      tags.push(
        `<meta property="article:published_time" content="${escapeAttr(opts.publishedTime)}">`,
      );
    }
    if (opts.modifiedTime) {
      tags.push(
        `<meta property="article:modified_time" content="${escapeAttr(opts.modifiedTime)}">`,
      );
    }
  }
  if (site.locale) {
    tags.push(`<meta property="og:locale" content="${escapeAttr(site.locale)}">`);
  }
  return tags.join("\n  ");
}

export function injectIntoHead(html: string, injection: string): string {
  const closingHead = "</head>";
  const idx = html.indexOf(closingHead);
  if (idx === -1) return html;
  return `${html.slice(0, idx)}  ${injection}\n${html.slice(idx)}`;
}

export function isAbsoluteUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}
