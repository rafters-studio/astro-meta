// Site-level head tag rendering. Pure: takes a SiteIdentity + route, returns
// the HTML string to inject into <head>. Tested independently of the Astro
// middleware that calls it.

import type { SiteIdentity } from "../index.js";

const escapeAttr = (v: string): string =>
  v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderSiteMeta(site: SiteIdentity, route: string): string {
  const pageUrl = `${site.url}${route.startsWith("/") ? route : `/${route}`}`;
  const tags = [
    '<meta name="generator" content="@rafters/astro-meta">',
    `<link rel="canonical" href="${escapeAttr(pageUrl)}">`,
    `<meta property="og:site_name" content="${escapeAttr(site.name)}">`,
    `<meta property="og:title" content="${escapeAttr(site.name)}">`,
    `<meta property="og:url" content="${escapeAttr(pageUrl)}">`,
    '<meta property="og:type" content="website">',
    '<meta name="twitter:card" content="summary_large_image">',
  ];
  if (site.description) {
    tags.push(`<meta name="description" content="${escapeAttr(site.description)}">`);
    tags.push(`<meta property="og:description" content="${escapeAttr(site.description)}">`);
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

const ABSOLUTE_URL_RE = /^https?:\/\/[^/\s]+/;

export function isAbsoluteUrl(value: string): boolean {
  return ABSOLUTE_URL_RE.test(value);
}
