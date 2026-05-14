// @rafters/astro-meta/llms-txt — llms.txt + llms-full.txt emission
//
// llms.txt is a top-level index of titled URLs grouped by section. llms-full.txt
// is the concatenated markdown of selected entries. Both are emitted on
// build:done. The integration mirrors the robots.txt wildcard disallow into the
// llms-txt disallow so the two artifacts cannot drift.

import type { MetaContext } from "./index.js";
import { isAbsoluteUrl } from "./internal/render-site-meta.js";

export interface LlmsTxtEntry {
  title: string;
  /** Absolute URL or site-relative path. Relative paths are resolved against site.url. */
  url: string;
  /** One-line summary used in the llms.txt index. */
  summary?: string;
  /** Markdown body, required to appear in llms-full.txt. */
  body?: string;
  /** Section heading in llms.txt; entries with the same section group together. */
  section?: string;
}

export interface LlmsTxtSource {
  key: readonly string[];
  collect: (ctx: MetaContext) => Promise<readonly LlmsTxtEntry[]> | readonly LlmsTxtEntry[];
}

export interface LlmsTxtBuildOptions {
  sources: readonly LlmsTxtSource[];
  /** Path-prefix array applied to the URL pathname; matching entries are dropped. */
  disallow?: readonly string[];
  /** Site-level header; renders as H1 + blockquote at the top of llms.txt. */
  header?: { title: string; description?: string };
  /** Whether to emit llms-full.txt. Default: true. */
  full?: boolean;
}

interface ResolvedEntry extends LlmsTxtEntry {
  absoluteUrl: string;
  pathname: string;
}

function resolveEntry(entry: LlmsTxtEntry, siteUrl: string): ResolvedEntry {
  if (entry.url.length === 0) {
    throw new Error(`@rafters/astro-meta/llms-txt: entry.url must be non-empty`);
  }
  const absoluteUrl = isAbsoluteUrl(entry.url)
    ? entry.url
    : `${siteUrl}${entry.url.startsWith("/") ? entry.url : `/${entry.url}`}`;
  const pathname = new URL(absoluteUrl).pathname;
  return { ...entry, absoluteUrl, pathname };
}

function matchesAnyPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname.startsWith(prefix));
}

function renderIndex(
  byBucket: Map<string, ResolvedEntry[]>,
  header?: LlmsTxtBuildOptions["header"],
): string {
  const sections: string[] = [];
  if (header !== undefined) {
    const h1 = `# ${header.title}`;
    sections.push(header.description ? `${h1}\n\n> ${header.description}` : h1);
  }
  for (const [section, entries] of byBucket) {
    const heading = section.length > 0 ? `## ${section}` : "";
    const lines = entries.map((e) => {
      const base = `- [${e.title}](${e.absoluteUrl})`;
      return e.summary ? `${base}: ${e.summary}` : base;
    });
    sections.push(heading.length > 0 ? `${heading}\n${lines.join("\n")}` : lines.join("\n"));
  }
  return `${sections.join("\n\n")}\n`;
}

function renderFull(entries: readonly ResolvedEntry[]): string {
  const blocks = entries
    .filter((e) => e.body !== undefined && e.body.length > 0)
    .map((e) => `## ${e.title}\nurl: ${e.absoluteUrl}\n\n${e.body ?? ""}`);
  return blocks.length === 0 ? "" : `${blocks.join("\n\n---\n\n")}\n`;
}

export async function buildLlmsTxt(
  opts: LlmsTxtBuildOptions,
  ctx: MetaContext,
): Promise<{ index: string; full?: string }> {
  const collected = await Promise.all(
    opts.sources.map(async (source) => ({ source, entries: await source.collect(ctx) })),
  );
  const resolved: ResolvedEntry[] = [];
  for (const { entries } of collected) {
    for (const entry of entries) {
      resolved.push(resolveEntry(entry, ctx.site.url));
    }
  }
  const disallow = opts.disallow ?? [];
  const allowed =
    disallow.length === 0
      ? resolved
      : resolved.filter((e) => !matchesAnyPrefix(e.pathname, disallow));
  const byBucket = new Map<string, ResolvedEntry[]>();
  for (const entry of allowed) {
    const key = entry.section ?? "";
    const existing = byBucket.get(key);
    if (existing) existing.push(entry);
    else byBucket.set(key, [entry]);
  }
  const index = renderIndex(byBucket, opts.header);
  if (opts.full === false) return { index };
  const full = renderFull(allowed);
  return full.length > 0 ? { index, full } : { index };
}
