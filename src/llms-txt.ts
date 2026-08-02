// @rafters/astro-meta/llms-txt — llms.txt + llms-full.txt emission
//
// llms.txt is a top-level index of titled URLs grouped by section. llms-full.txt
// is the concatenated markdown of selected entries. Both are emitted on
// build:done. The integration mirrors the robots.txt wildcard disallow into the
// llms-txt disallow so the two artifacts cannot drift.

import type { MetaContext } from "./index.js";
import { isAbsoluteUrl } from "./internal/render-site-meta.js";
import { sourceCollectError } from "./internal/source-error.js";

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
  /**
   * What to do when an entry body fails the markdown sniff (component-cased
   * JSX tags, top-level import/export statements).
   * "warn": report it, emit anyway. "error": throw at build:done, naming every
   * failing entry. "drop": report it and omit the body; the entry stays in the
   * llms.txt index. Default: "warn" in 0.x, revisit for 1.0.
   */
  onNonMarkdownBody?: "warn" | "error" | "drop";
}

/** An entry whose body failed the markdown sniff. */
export interface NonMarkdownBody {
  title: string;
  /** Absolute URL, so the failing page is findable in one step. */
  url: string;
  /** What tripped the sniff, quoting the offending construct. */
  reason: string;
}

/**
 * Bodies are scanned only this far. A body past the bound is almost certainly
 * real content rather than a component shell, and an unbounded scan on a
 * pathological input is a build-time hazard the sniff is not worth.
 */
const SNIFF_SCAN_LIMIT = 64_000;

/**
 * Blank out fenced code blocks and inline code spans, preserving line count so
 * reported positions stay meaningful. JSX inside a code fence is documentation,
 * not a defect, and it is by far the likeliest false positive: every page that
 * documents a component shows its tag. An unterminated fence masks to the end
 * of the body, which is the conservative direction (miss, do not false-flag).
 */
function maskCode(body: string): string {
  const lines = body.split("\n");
  let fence: string | undefined;
  return lines
    .map((line) => {
      const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
      if (fence === undefined && fenceMatch?.[1] !== undefined) {
        fence = fenceMatch[1][0];
        return "";
      }
      if (fence !== undefined) {
        if (fenceMatch?.[1] !== undefined && fenceMatch[1][0] === fence) fence = undefined;
        return "";
      }
      return line.replace(/`[^`]*`/g, " ");
    })
    .join("\n");
}

const COMPONENT_TAG = /^\s*<([A-Z][A-Za-z0-9]*)(?=[\s/>])/;
const MODULE_SYNTAX = /^\s*(import|export)\s/;

/**
 * Heuristic, not a parser. Inline HTML (`<img>`, `<div>`) is legal markdown and
 * must pass; only component-cased tags at the start of a line and top-level
 * module syntax are flags. The line anchor matters: prose mentioning a
 * component mid-sentence is not a defect, and code spans are masked above.
 */
function sniffNonMarkdownBody(body: string): string | undefined {
  const masked = maskCode(body.slice(0, SNIFF_SCAN_LIMIT));
  for (const line of masked.split("\n")) {
    const tag = COMPONENT_TAG.exec(line);
    if (tag) return `component tag <${tag[1]}>`;
    const mod = MODULE_SYNTAX.exec(line);
    if (mod) return `module syntax: ${mod[1]}`;
  }
  return undefined;
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

function renderFull(entries: readonly ResolvedEntry[], omitBodies: ReadonlySet<string>): string {
  const blocks = entries
    .filter((e) => e.body !== undefined && e.body.length > 0 && !omitBodies.has(e.absoluteUrl))
    .map((e) => `## ${e.title}\nurl: ${e.absoluteUrl}\n\n${e.body ?? ""}`);
  return blocks.length === 0 ? "" : `${blocks.join("\n\n---\n\n")}\n`;
}

export async function buildLlmsTxt(
  opts: LlmsTxtBuildOptions,
  ctx: MetaContext,
): Promise<{ index: string; full?: string; nonMarkdownBodies: NonMarkdownBody[] }> {
  const collected = await Promise.all(
    opts.sources.map(async (source) => {
      try {
        return { source, entries: await source.collect(ctx) };
      } catch (cause) {
        throw sourceCollectError("llms-txt", source.key, cause);
      }
    }),
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

  const nonMarkdownBodies: NonMarkdownBody[] = [];
  for (const entry of allowed) {
    if (entry.body === undefined || entry.body.length === 0) continue;
    const reason = sniffNonMarkdownBody(entry.body);
    if (reason !== undefined) {
      nonMarkdownBodies.push({ title: entry.title, url: entry.absoluteUrl, reason });
    }
  }
  const mode = opts.onNonMarkdownBody ?? "warn";
  if (mode === "error" && nonMarkdownBodies.length > 0) {
    // Every failing entry, not just the first: one build round-trip to see the
    // full damage.
    const detail = nonMarkdownBodies
      .map((e) => `  - ${e.title} (${e.url}): ${e.reason}`)
      .join("\n");
    throw new Error(
      `@rafters/astro-meta/llms-txt: ${nonMarkdownBodies.length} entr${
        nonMarkdownBodies.length === 1 ? "y" : "ies"
      } failed the markdown body contract:\n${detail}`,
    );
  }

  if (opts.full === false) return { index, nonMarkdownBodies };
  const omitBodies = new Set(mode === "drop" ? nonMarkdownBodies.map((e) => e.url) : []);
  const full = renderFull(allowed, omitBodies);
  return full.length > 0 ? { index, full, nonMarkdownBodies } : { index, nonMarkdownBodies };
}
