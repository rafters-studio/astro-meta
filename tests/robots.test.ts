import { describe, it, expect } from "vitest";
import {
  aiCrawlers,
  computeCrawlerDisallows,
  findUnknownAgents,
  renderContentSignalsHeader,
  renderContentSignalsHeadersFile,
  renderRobots,
} from "../src/robots.js";
import type { RobotsConfig } from "../src/robots.js";

describe("renderRobots", () => {
  it("renders a single rule with allow + disallow", () => {
    const out = renderRobots({
      rules: [{ userAgent: "*", allow: ["/"], disallow: ["/private"] }],
    });
    expect(out).toBe("User-agent: *\nAllow: /\nDisallow: /private\n");
  });

  it("renders multiple rules separated by blank lines", () => {
    const out = renderRobots({
      rules: [
        { userAgent: "GPTBot", disallow: ["/"] },
        { userAgent: "ClaudeBot", allow: ["/"] },
      ],
    });
    expect(out).toBe("User-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nAllow: /\n");
  });

  it("renders crawl-delay when set", () => {
    const out = renderRobots({
      rules: [{ userAgent: "Bytespider", allow: ["/"], crawlDelay: 10 }],
    });
    expect(out).toContain("Crawl-delay: 10");
  });

  it("appends Sitemap line when sitemap is set", () => {
    const out = renderRobots({
      rules: [{ userAgent: "*", allow: ["/"] }],
      sitemap: "https://example.com/sitemap.xml",
    });
    expect(out).toContain("Sitemap: https://example.com/sitemap.xml");
    expect(out.endsWith("\n")).toBe(true);
  });

  it("emits sitemap-only output when rules are empty", () => {
    const out = renderRobots({ rules: [], sitemap: "https://example.com/sitemap.xml" });
    expect(out).toBe("Sitemap: https://example.com/sitemap.xml\n");
  });

  it("throws when a rule has an empty userAgent", () => {
    expect(() => renderRobots({ rules: [{ userAgent: "" }] })).toThrow(/non-empty/);
  });

  it("throws when crawlDelay is negative", () => {
    expect(() =>
      renderRobots({
        rules: [{ userAgent: "GPTBot", crawlDelay: -1 }],
      }),
    ).toThrow(/>= 0/);
  });
});

describe("renderContentSignalsHeader", () => {
  it("renders all three signals", () => {
    expect(renderContentSignalsHeader({ search: "yes", aiInput: "yes", aiTrain: "no" })).toBe(
      "search=yes, ai-input=yes, ai-train=no",
    );
  });

  it("omits unset fields", () => {
    expect(renderContentSignalsHeader({ search: "yes" })).toBe("search=yes");
    expect(renderContentSignalsHeader({ aiTrain: "no" })).toBe("ai-train=no");
  });

  it("returns the empty string when no fields are set", () => {
    expect(renderContentSignalsHeader({})).toBe("");
  });
});

describe("renderContentSignalsHeadersFile", () => {
  it("emits a /* route entry with the policy (singular Content-Signal header)", () => {
    const out = renderContentSignalsHeadersFile({ search: "yes", aiTrain: "no" });
    expect(out).toBe("/*\n  Content-Signal: search=yes, ai-train=no\n");
  });

  it("returns the empty string when policy is empty", () => {
    expect(renderContentSignalsHeadersFile({})).toBe("");
  });
});

describe("findUnknownAgents", () => {
  it("returns empty when every rule names a curated crawler or wildcard", () => {
    const config: RobotsConfig = {
      rules: [{ userAgent: "*" }, { userAgent: "GPTBot" }, { userAgent: "ClaudeBot" }],
    };
    expect(findUnknownAgents(config)).toEqual([]);
  });

  it("returns the unknown agents preserving first-occurrence order", () => {
    const config: RobotsConfig = {
      rules: [
        { userAgent: "*" },
        { userAgent: "GptBot" }, // wrong case
        { userAgent: "PerplexityBot" },
        { userAgent: "Foobot" },
      ],
    };
    expect(findUnknownAgents(config)).toEqual(["GptBot", "Foobot"]);
  });

  it("includes every curated crawler in the known set", () => {
    for (const agent of aiCrawlers) {
      const config: RobotsConfig = { rules: [{ userAgent: agent }] };
      expect(findUnknownAgents(config)).toEqual([]);
    }
  });
});

describe("renderRobots content-signal directive", () => {
  const policy = { search: "yes", aiInput: "yes", aiTrain: "no" } as const;

  it("injects the singular Content-Signal directive into the wildcard group", () => {
    const out = renderRobots({
      rules: [{ userAgent: "*", allow: ["/"] }],
      contentSignals: { policy, preamble: false },
    });
    expect(out).toContain(
      "User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=no\nAllow: /",
    );
  });

  it("prepends the canonical preamble with the EU Directive reservation by default", () => {
    const out = renderRobots({
      rules: [{ userAgent: "*", allow: ["/"] }],
      contentSignals: { policy },
    });
    expect(out.startsWith("# As a condition of accessing this website")).toBe(true);
    expect(out).toContain("ARTICLE 4 OF THE EUROPEAN UNION DIRECTIVE 2019/790");
  });

  it("omits the directive when emit.directive is false", () => {
    const out = renderRobots({
      rules: [{ userAgent: "*", allow: ["/"] }],
      contentSignals: { policy, emit: { directive: false }, preamble: false },
    });
    expect(out).not.toContain("Content-Signal:");
  });

  it("synthesizes a wildcard group when the consumer declared none", () => {
    const out = renderRobots({ rules: [], contentSignals: { policy, preamble: false } });
    expect(out).toContain(
      "User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=no\nAllow: /",
    );
  });

  it("speaks the IETF content-usage vocabulary when selected", () => {
    const out = renderRobots({
      rules: [{ userAgent: "*", allow: ["/"] }],
      contentSignals: { policy, vocabulary: "content-usage", preamble: false },
    });
    expect(out).toContain("Content-Usage: train-ai=n, search=y");
    expect(out).not.toContain("Content-Signal:");
  });
});

describe("renderRobots enforcement", () => {
  const policy = { search: "yes", aiInput: "yes", aiTrain: "no" } as const;

  it("declarative (default) writes no Disallow blocks", () => {
    const out = renderRobots({
      rules: [{ userAgent: "*", allow: ["/"] }],
      contentSignals: { policy, preamble: false },
    });
    expect(out).not.toContain("Disallow:");
  });

  it("block-training disallows trainers, control tokens, and Amazonbot but not retrieval bots", () => {
    const out = renderRobots({
      rules: [{ userAgent: "*", allow: ["/"] }],
      contentSignals: { policy, enforce: "block-training", preamble: false },
    });
    expect(out).toContain("User-agent: GPTBot\nDisallow: /");
    expect(out).toContain("User-agent: ClaudeBot\nDisallow: /");
    expect(out).toContain("User-agent: Google-Extended\nDisallow: /");
    expect(out).toContain("User-agent: Amazonbot\nDisallow: /");
    // ai-input=yes, so retrieval and search bots stay allowed
    expect(out).not.toContain("User-agent: PerplexityBot\nDisallow: /");
    expect(out).not.toContain("User-agent: Claude-SearchBot\nDisallow: /");
    // link-preview never blocked
    expect(out).not.toContain("User-agent: facebookexternalhit\nDisallow: /");
  });

  it("block-training also disallows retrieval bots when ai-input=no", () => {
    const out = renderRobots({
      rules: [{ userAgent: "*", allow: ["/"] }],
      contentSignals: {
        policy: { search: "yes", aiInput: "no", aiTrain: "no" },
        enforce: "block-training",
        preamble: false,
      },
    });
    expect(out).toContain("User-agent: PerplexityBot\nDisallow: /");
    expect(out).toContain("User-agent: Claude-SearchBot\nDisallow: /");
  });

  it("block-all disallows every AI crawler except link-preview", () => {
    const out = renderRobots({
      rules: [{ userAgent: "*", allow: ["/"] }],
      contentSignals: { policy, enforce: "block-all", preamble: false },
    });
    expect(out).toContain("User-agent: PerplexityBot\nDisallow: /");
    expect(out).toContain("User-agent: GPTBot\nDisallow: /");
    expect(out).not.toContain("User-agent: facebookexternalhit\nDisallow: /");
  });

  it("honors per-crawler overrides on top of the computed decision", () => {
    const out = renderRobots({
      rules: [{ userAgent: "*", allow: ["/"] }],
      contentSignals: {
        policy,
        enforce: "block-training",
        crawlers: { GPTBot: "allow", PerplexityBot: "disallow" },
        preamble: false,
      },
    });
    expect(out).not.toContain("User-agent: GPTBot\nDisallow: /");
    expect(out).toContain("User-agent: PerplexityBot\nDisallow: /");
  });
});

describe("renderRobots RFC 9309 group merging", () => {
  it("consolidates duplicate user-agent groups into one", () => {
    const out = renderRobots({
      rules: [
        { userAgent: "*", allow: ["/"] },
        { userAgent: "*", disallow: ["/admin"] },
      ],
    });
    expect(out).toBe("User-agent: *\nAllow: /\nDisallow: /admin\n");
  });

  it("merges case-insensitively but preserves first-seen casing and path case", () => {
    const out = renderRobots({
      rules: [
        { userAgent: "GPTBot", disallow: ["/Private"] },
        { userAgent: "gptbot", disallow: ["/Other"] },
      ],
    });
    expect(out).toBe("User-agent: GPTBot\nDisallow: /Private\nDisallow: /Other\n");
  });
});

describe("computeCrawlerDisallows", () => {
  it("returns nothing under declarative enforcement", () => {
    expect(computeCrawlerDisallows({ aiTrain: "no" }, "declarative")).toEqual([]);
  });

  it("returns matrix-ordered training rules under block-training", () => {
    const rules = computeCrawlerDisallows({ aiTrain: "no" }, "block-training");
    const tokens = rules.map((r) => r.userAgent);
    expect(tokens).toContain("GPTBot");
    expect(tokens).toContain("Applebot-Extended");
    expect(tokens).not.toContain("PerplexityBot");
    expect(tokens.indexOf("GPTBot")).toBeLessThan(tokens.indexOf("ClaudeBot"));
  });
});
