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

const KNOWN_AGENTS: ReadonlySet<string> = new Set<string>([...aiCrawlers, "*"]);

/**
 * Return any configured user-agent names that are neither in the curated AI
 * crawler matrix nor the `*` wildcard. Used to warn on likely typos.
 */
export function findUnknownAgents(config: RobotsConfig): readonly string[] {
  const seen = new Set<string>();
  for (const rule of config.rules) {
    if (!KNOWN_AGENTS.has(rule.userAgent)) seen.add(rule.userAgent);
  }
  return [...seen];
}

export function renderRobots(config: RobotsConfig): string {
  const blocks: string[] = [];
  for (const rule of config.rules) {
    if (rule.userAgent.length === 0) {
      throw new Error("@rafters/astro-meta/robots: rule.userAgent must be non-empty");
    }
    if (rule.crawlDelay !== undefined && rule.crawlDelay < 0) {
      throw new Error(
        `@rafters/astro-meta/robots: rule.crawlDelay must be >= 0 (got: ${rule.crawlDelay} for ${rule.userAgent})`,
      );
    }
    const lines: string[] = [`User-agent: ${rule.userAgent}`];
    for (const path of rule.allow ?? []) lines.push(`Allow: ${path}`);
    for (const path of rule.disallow ?? []) lines.push(`Disallow: ${path}`);
    if (rule.crawlDelay !== undefined) lines.push(`Crawl-delay: ${rule.crawlDelay}`);
    blocks.push(lines.join("\n"));
  }
  let body = blocks.join("\n\n");
  if (config.sitemap !== undefined) {
    body += `${blocks.length > 0 ? "\n\n" : ""}Sitemap: ${config.sitemap}`;
  }
  return `${body}\n`;
}

export function renderContentSignalsHeader(policy: ContentSignalsPolicy): string {
  const parts: string[] = [];
  if (policy.search !== undefined) parts.push(`search=${policy.search}`);
  if (policy.aiInput !== undefined) parts.push(`ai-input=${policy.aiInput}`);
  if (policy.aiTrain !== undefined) parts.push(`ai-train=${policy.aiTrain}`);
  return parts.join(", ");
}

/**
 * Render the Cloudflare Pages _headers entry applying the policy to every
 * route. Returns the empty string when no policy fields are set.
 */
export function renderContentSignalsHeadersFile(policy: ContentSignalsPolicy): string {
  const value = renderContentSignalsHeader(policy);
  if (value.length === 0) return "";
  return `/*\n  Content-Signals: ${value}\n`;
}
