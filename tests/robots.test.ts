import { describe, it, expect } from "vitest";
import {
  aiCrawlers,
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
  it("emits a /* route entry with the policy", () => {
    const out = renderContentSignalsHeadersFile({ search: "yes", aiTrain: "no" });
    expect(out).toBe("/*\n  Content-Signals: search=yes, ai-train=no\n");
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
