// @rafters/astro-meta/robots -- robots.txt + content-signals
//
// Declarative robots.txt with a curated, categorized AI-crawler matrix.
// Emits the Cloudflare Content Signals Policy (the production-deployed form;
// directive and header are both `Content-Signal:`, singular) and can optionally
// emit the draft IETF AIPREF `Content-Usage:` vocabulary behind the
// `vocabulary` switch. Neither is a finished RFC: the robots EXCLUSION protocol
// (RFC 9309) is, and group merging / precedence here follow it.
//
// Three things are configurable per consumer: which vocabulary to speak, what
// to emit (robots.txt directive, the Cloudflare _headers entry, or both), and
// how hard to enforce (declarative signals only, signal-scoped Disallow, or a
// blunt block-all). RFC 9309 correctness (single group per user-agent, the
// global Sitemap line, path-case preservation) is unconditional, not a setting.

// --- Vocabularies and enforcement ------------------------------------------

/**
 * Which content-preference vocabulary to emit.
 * - "content-signal": Cloudflare Content Signals Policy. The only form in
 *   production today; directive and HTTP header are both `Content-Signal:`.
 * - "content-usage": draft IETF AIPREF (`Content-Usage:`, tokens train-ai /
 *   search, values y/n). Working-group track, NOT an RFC; shape may change.
 */
export type ContentSignalVocabulary = "content-signal" | "content-usage";

/**
 * How strongly to back the declared signals with hard `Disallow` rules.
 * - "declarative": emit the signals only; write no Disallow blocks. Default.
 *   Changes no crawler's access on upgrade.
 * - "block-training": Disallow the crawlers each restrictive signal governs --
 *   `ai-train=no` blocks model-training crawlers, the training opt-out control
 *   tokens (Google-Extended, Applebot-Extended), and the unsplittable Amazonbot;
 *   `ai-input=no` additionally blocks AI retrieval/RAG crawlers. Pure web-search
 *   and link-preview crawlers are never blocked here.
 * - "block-all": if any AI signal is "no", Disallow every crawler in the AI
 *   matrix (training, control, and retrieval); link-preview stays allowed. The
 *   Cloudflare-style blunt instrument.
 */
export type ContentSignalEnforcement = "declarative" | "block-training" | "block-all";

// --- Core robots types ------------------------------------------------------

export interface RobotsRule {
  userAgent: string;
  allow?: readonly string[];
  disallow?: readonly string[];
  /** Seconds; emitted as `Crawl-delay: N`. */
  crawlDelay?: number;
}

export interface ContentSignalsPolicy {
  /** Visibility in (non-AI) search results. */
  search?: "yes" | "no";
  /** Permission to use the page as AI input (RAG, summarization, grounding). */
  aiInput?: "yes" | "no";
  /** Permission to use the page in AI model training. */
  aiTrain?: "yes" | "no";
}

export interface ContentSignalsConfig {
  /** The declared preferences. */
  policy: ContentSignalsPolicy;
  /** Vocabulary to speak. Default "content-signal" (Cloudflare). */
  vocabulary?: ContentSignalVocabulary;
  /** What to emit. Both default true. */
  emit?: {
    /** The `Content-Signal:`/`Content-Usage:` line inside robots.txt. */
    directive?: boolean;
    /** The Cloudflare Pages `_headers` entry applying the policy site-wide. */
    header?: boolean;
  };
  /** Prepend the canonical legal preamble comment block. Default true. */
  preamble?: boolean;
  /** How hard to enforce the signals with Disallow rules. Default "declarative". */
  enforce?: ContentSignalEnforcement;
  /**
   * Per-user-agent overrides applied on top of the computed matrix decision:
   * `"disallow"` forces a block, `"allow"` forces it open. Keys are exact UA
   * tokens.
   */
  crawlers?: Readonly<Record<string, "allow" | "disallow">>;
}

export interface RobotsConfig {
  rules: readonly RobotsRule[];
  /** Absolute URL of the sitemap, emitted once as a global `Sitemap:` line. */
  sitemap?: string;
  /** Content-signals policy, vocabulary, emission, and enforcement. */
  contentSignals?: ContentSignalsConfig;
}

// --- Curated crawler matrix -------------------------------------------------

/**
 * Why a crawler is governed by a given signal. Categorization follows operator
 * documentation (OpenAI, Anthropic, Google, Apple, Perplexity, Meta) as of
 * 2026-06; the exhaustive community list lives at ai.robots.txt and should be
 * consulted for tokens beyond this high-signal set.
 */
export type CrawlerCategory =
  /** Model-training crawler. Governed by ai-train. */
  | "ai-train"
  /** Not a crawler: a training opt-out control token (e.g. Google-Extended).
   *  Governed by ai-train; blocking it has zero search/SEO cost. */
  | "ai-train-control"
  /** Retrieval, RAG, AI-search, or live-assistant fetch. Governed by ai-input. */
  | "ai-input"
  /** One token serves both search and possible training, with no separate
   *  search token to keep (Amazonbot). Blocked under ai-train as the
   *  conservative default. */
  | "ai-unsplittable"
  /** Social-share unfurl. Never blocked by content signals. */
  | "link-preview";

export interface CrawlerInfo {
  readonly token: string;
  readonly category: CrawlerCategory;
  readonly note?: string;
}

/**
 * The curated matrix. Order is the emission order for determinism. Legacy
 * tokens are retained so a consumer migrating an older robots.txt keeps
 * coverage; notes flag advisory-only or superseded tokens.
 */
export const crawlerMatrix: readonly CrawlerInfo[] = [
  { token: "GPTBot", category: "ai-train" },
  { token: "ChatGPT-User", category: "ai-input", note: "user-triggered live fetch" },
  { token: "OAI-SearchBot", category: "ai-input", note: "ChatGPT search index; not training" },
  { token: "ClaudeBot", category: "ai-train" },
  { token: "Claude-User", category: "ai-input", note: "user-triggered live fetch" },
  { token: "Claude-SearchBot", category: "ai-input", note: "Claude search index; not training" },
  {
    token: "Claude-Web",
    category: "ai-train",
    note: "legacy Anthropic token, superseded by ClaudeBot",
  },
  { token: "Anthropic-AI", category: "ai-train", note: "legacy Anthropic token" },
  { token: "PerplexityBot", category: "ai-input", note: "answer-engine index" },
  {
    token: "Perplexity-User",
    category: "ai-input",
    note: "user-triggered; advisory, contested compliance",
  },
  {
    token: "Google-Extended",
    category: "ai-train-control",
    note: "Gemini training opt-out; does NOT affect Googlebot or Search ranking",
  },
  {
    token: "Applebot-Extended",
    category: "ai-train-control",
    note: "Apple training opt-out; does NOT affect Applebot/Siri/Spotlight",
  },
  {
    token: "Bytespider",
    category: "ai-train",
    note: "ByteDance; documented history of ignoring robots.txt",
  },
  {
    token: "CCBot",
    category: "ai-train",
    note: "Common Crawl corpus; de facto training feedstock",
  },
  { token: "cohere-ai", category: "ai-input" },
  { token: "Diffbot", category: "ai-train" },
  { token: "meta-externalagent", category: "ai-train", note: "Meta AI data collection" },
  { token: "meta-externalfetcher", category: "ai-input", note: "user-triggered live fetch" },
  {
    token: "facebookexternalhit",
    category: "link-preview",
    note: "Open Graph unfurl; never blocked by content signals",
  },
  {
    token: "Amazonbot",
    category: "ai-unsplittable",
    note: "one token for Alexa/search and possible training; no separate search token guaranteed",
  },
  { token: "Timpibot", category: "ai-train" },
  { token: "ImagesiftBot", category: "ai-train" },
];

/** Flat list of curated crawler tokens, in matrix order. */
export const aiCrawlers: readonly string[] = crawlerMatrix.map((c) => c.token);

export type AiCrawler = string;

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

// --- Content-signal rendering ----------------------------------------------

/**
 * Render the policy value string for the chosen vocabulary.
 * - content-signal: `search=yes, ai-input=yes, ai-train=no` (Cloudflare).
 * - content-usage: `train-ai=n, search=y` (IETF AIPREF; only train-ai and
 *   search are expressible in the draft vocabulary, so ai-input is dropped).
 */
export function renderContentSignalsHeader(
  policy: ContentSignalsPolicy,
  vocabulary: ContentSignalVocabulary = "content-signal",
): string {
  if (vocabulary === "content-usage") {
    const parts: string[] = [];
    if (policy.aiTrain !== undefined)
      parts.push(`train-ai=${policy.aiTrain === "yes" ? "y" : "n"}`);
    if (policy.search !== undefined) parts.push(`search=${policy.search === "yes" ? "y" : "n"}`);
    return parts.join(", ");
  }
  const parts: string[] = [];
  if (policy.search !== undefined) parts.push(`search=${policy.search}`);
  if (policy.aiInput !== undefined) parts.push(`ai-input=${policy.aiInput}`);
  if (policy.aiTrain !== undefined) parts.push(`ai-train=${policy.aiTrain}`);
  return parts.join(", ");
}

/** The robots.txt / HTTP header field name for a vocabulary. */
function headerName(vocabulary: ContentSignalVocabulary): string {
  return vocabulary === "content-usage" ? "Content-Usage" : "Content-Signal";
}

/**
 * Render the Cloudflare Pages `_headers` entry applying the policy to every
 * route. Returns the empty string when no policy fields are set. The header is
 * singular `Content-Signal:` (or `Content-Usage:`); there is no plural form.
 */
export function renderContentSignalsHeadersFile(
  policy: ContentSignalsPolicy,
  vocabulary: ContentSignalVocabulary = "content-signal",
): string {
  const value = renderContentSignalsHeader(policy, vocabulary);
  if (value.length === 0) return "";
  return `/*\n  ${headerName(vocabulary)}: ${value}\n`;
}

/**
 * The canonical legal preamble. For content-signal this is the Cloudflare
 * Content Signals Policy block, including the EU Directive 2019/790 Article 4
 * reservation of rights. For content-usage it is the AIPREF NOTICE block.
 */
const PREAMBLE: Record<ContentSignalVocabulary, readonly string[]> = {
  "content-signal": [
    "# As a condition of accessing this website, you agree to abide by the following content signals:",
    "# (a)  If a content-signal = yes, you may collect content for the corresponding use.",
    "# (b)  If a content-signal = no, you may not collect content for the corresponding use.",
    "# (c)  If the website operator does not include a content signal for a corresponding use, the website operator neither grants nor restricts permission via content signal with respect to the corresponding use.",
    "#",
    "# The content signals and their meanings are:",
    "#",
    "# search: building a search index and providing search results (e.g., returning hyperlinks and short excerpts from your website's contents).  Search does not include providing AI-generated search summaries.",
    "# ai-input: inputting content into one or more AI models (e.g., retrieval augmented generation, grounding, or other real-time taking of content for generative AI search answers).",
    "# ai-train: training or fine-tuning AI models.",
    "#",
    "# ANY RESTRICTIONS EXPRESSED VIA CONTENT SIGNALS ARE EXPRESS RESERVATIONS OF RIGHTS UNDER ARTICLE 4 OF THE EUROPEAN UNION DIRECTIVE 2019/790 ON COPYRIGHT AND RELATED RIGHTS IN THE DIGITAL SINGLE MARKET.",
  ],
  "content-usage": [
    "# NOTICE: The collection of content and other data on this site through automated",
    "# means is prohibited except (1) as provided by the below Content-Usage directives",
    "# or (2) with express written permission.",
    "#",
    "# The Content-Usage directives use syntax and vocabulary from a proposed IETF",
    "# standard drafted by the AI Preferences (aipref) working group. That draft is not",
    "# yet an RFC and its vocabulary may change.",
  ],
};

// --- Enforcement: signals -> Disallow rules ---------------------------------

/**
 * Compute the per-crawler `Disallow: /` rules implied by the policy under the
 * chosen enforcement level, then apply explicit per-UA overrides. Returns rules
 * in matrix order; override-only tokens are appended in declaration order.
 */
export function computeCrawlerDisallows(
  policy: ContentSignalsPolicy,
  enforce: ContentSignalEnforcement,
  overrides: Readonly<Record<string, "allow" | "disallow">> = {},
): RobotsRule[] {
  const aiTrainNo = policy.aiTrain === "no";
  const aiInputNo = policy.aiInput === "no";
  const blocked = new Set<string>();

  if (enforce !== "declarative") {
    for (const c of crawlerMatrix) {
      let block = false;
      if (enforce === "block-all") {
        block = (aiTrainNo || aiInputNo) && c.category !== "link-preview";
      } else {
        // block-training: each restrictive signal blocks the crawlers it governs.
        switch (c.category) {
          case "ai-train":
          case "ai-train-control":
          case "ai-unsplittable":
            block = aiTrainNo;
            break;
          case "ai-input":
            block = aiInputNo;
            break;
          case "link-preview":
            block = false;
            break;
        }
      }
      if (block) blocked.add(c.token);
    }
  }

  for (const [token, decision] of Object.entries(overrides)) {
    if (decision === "disallow") blocked.add(token);
    else blocked.delete(token);
  }

  const ordered: string[] = crawlerMatrix.filter((c) => blocked.has(c.token)).map((c) => c.token);
  // Append override-only tokens that are not part of the curated matrix; matrix
  // tokens forced on by an override are already captured by the filter above.
  for (const token of Object.keys(overrides)) {
    if (overrides[token] === "disallow" && !aiCrawlers.includes(token)) ordered.push(token);
  }
  return ordered.map((token) => ({ userAgent: token, disallow: ["/"] }));
}

// --- robots.txt rendering ---------------------------------------------------

function assertLineSafe(field: string, value: string): void {
  if (/[\n\r]/.test(value)) {
    throw new Error(
      `@rafters/astro-meta/robots: ${field} must not contain a newline (got: ${JSON.stringify(value)})`,
    );
  }
}

/**
 * Merge rules so each user-agent appears as exactly one group (RFC 9309 2.2.1:
 * rules for the same product token are combined). Matching is case-insensitive;
 * the first-seen casing is preserved. Allow/Disallow paths are concatenated and
 * de-duplicated with case PRESERVED (URL paths are case-sensitive). The first
 * crawlDelay wins.
 */
function mergeRules(rules: readonly RobotsRule[]): RobotsRule[] {
  const byAgent = new Map<
    string,
    { userAgent: string; allow: string[]; disallow: string[]; crawlDelay?: number }
  >();
  for (const rule of rules) {
    if (rule.userAgent.length === 0) {
      throw new Error("@rafters/astro-meta/robots: rule.userAgent must be non-empty");
    }
    assertLineSafe("rule.userAgent", rule.userAgent);
    if (rule.crawlDelay !== undefined && rule.crawlDelay < 0) {
      throw new Error(
        `@rafters/astro-meta/robots: rule.crawlDelay must be >= 0 (got: ${rule.crawlDelay} for ${rule.userAgent})`,
      );
    }
    const key = rule.userAgent.toLowerCase();
    let group = byAgent.get(key);
    if (group === undefined) {
      group = { userAgent: rule.userAgent, allow: [], disallow: [] };
      byAgent.set(key, group);
    }
    for (const path of rule.allow ?? []) {
      assertLineSafe("allow path", path);
      if (!group.allow.includes(path)) group.allow.push(path);
    }
    for (const path of rule.disallow ?? []) {
      assertLineSafe("disallow path", path);
      if (!group.disallow.includes(path)) group.disallow.push(path);
    }
    if (group.crawlDelay === undefined && rule.crawlDelay !== undefined) {
      group.crawlDelay = rule.crawlDelay;
    }
  }
  return [...byAgent.values()].map((g) => {
    const rule: RobotsRule = { userAgent: g.userAgent, allow: g.allow, disallow: g.disallow };
    if (g.crawlDelay !== undefined) rule.crawlDelay = g.crawlDelay;
    return rule;
  });
}

function renderGroup(rule: RobotsRule, signalLine?: string): string {
  const lines: string[] = [`User-agent: ${rule.userAgent}`];
  if (signalLine !== undefined) lines.push(signalLine);
  for (const path of rule.allow ?? []) lines.push(`Allow: ${path}`);
  for (const path of rule.disallow ?? []) lines.push(`Disallow: ${path}`);
  if (rule.crawlDelay !== undefined) lines.push(`Crawl-delay: ${rule.crawlDelay}`);
  return lines.join("\n");
}

/**
 * Render a complete robots.txt. Merges duplicate user-agent groups, injects the
 * content-signal directive into the `*` group (synthesizing one if absent),
 * expands enforcement into per-crawler Disallow groups, prepends the legal
 * preamble, and appends the global Sitemap line.
 */
export function renderRobots(config: RobotsConfig): string {
  const cs = config.contentSignals;
  const vocabulary = cs?.vocabulary ?? "content-signal";
  const enforce = cs?.enforce ?? "declarative";

  const disallowRules = cs ? computeCrawlerDisallows(cs.policy, enforce, cs.crawlers ?? {}) : [];
  const merged = mergeRules([...config.rules, ...disallowRules]);

  const signalLine =
    cs !== undefined && (cs.emit?.directive ?? true)
      ? `${headerName(vocabulary)}: ${renderContentSignalsHeader(cs.policy, vocabulary)}`
      : undefined;
  const emitPreamble = signalLine !== undefined && (cs?.preamble ?? true);

  // The content-signal directive lives in the wildcard group. Synthesize a
  // minimal `User-agent: * / Allow: /` group if the consumer declared none.
  if (signalLine !== undefined && !merged.some((r) => r.userAgent === "*")) {
    merged.unshift({ userAgent: "*", allow: ["/"], disallow: [] });
  }

  const groupBlocks = merged.map((rule) =>
    renderGroup(rule, signalLine !== undefined && rule.userAgent === "*" ? signalLine : undefined),
  );

  const sections: string[] = [];
  if (emitPreamble) sections.push(PREAMBLE[vocabulary].join("\n"));
  if (groupBlocks.length > 0) sections.push(groupBlocks.join("\n\n"));
  if (config.sitemap !== undefined) {
    assertLineSafe("sitemap", config.sitemap);
    sections.push(`Sitemap: ${config.sitemap}`);
  }
  return `${sections.join("\n\n")}\n`;
}
