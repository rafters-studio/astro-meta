// @rafters/astro-meta/robots — robots.txt + Content-Signals
//
// Declarative robots.txt with the curated AI-crawler matrix. Per-bot allow
// and disallow rules; path-scoped permissions; optional Cloudflare Pages
// Content-Signals header emission via _headers.

export interface RobotsRule {
  userAgent: string;
  allow?: readonly string[];
  disallow?: readonly string[];
  /** Seconds; emitted as `Crawl-delay: N`. */
  crawlDelay?: number;
}

export interface ContentSignalsPolicy {
  /** Visibility in search results. */
  search?: "yes" | "no";
  /** Permission to use the page as AI input (RAG, summarization). */
  aiInput?: "yes" | "no";
  /** Permission to use the page in AI model training. */
  aiTrain?: "yes" | "no";
}

export interface RobotsConfig {
  rules: readonly RobotsRule[];
  /** Absolute URL of the sitemap, emitted as `Sitemap: <url>`. */
  sitemap?: string;
  /** Cloudflare Pages Content-Signals policy; emitted via _headers. */
  contentSignals?: ContentSignalsPolicy;
}

/**
 * Curated AI-crawler matrix. v0.1 ships a static list; v0.2 may pull from a
 * registry. Order is preservation-only; semantics are configured per consumer.
 */
export const aiCrawlers = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "Anthropic-AI",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "Bytespider",
  "CCBot",
  "cohere-ai",
  "Diffbot",
  "meta-externalagent",
  "Amazonbot",
  "Timpibot",
  "ImagesiftBot",
] as const;

export type AiCrawler = (typeof aiCrawlers)[number];

export function renderRobots(_config: RobotsConfig): string {
  throw new Error("not implemented");
}

export function renderContentSignalsHeader(_policy: ContentSignalsPolicy): string {
  throw new Error("not implemented");
}
