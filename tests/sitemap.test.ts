import { describe, it, expect } from "vitest";
import {
  buildSitemapFiles,
  collectEntries,
  renderSitemap,
  renderSitemapIndex,
  SITEMAP_URL_LIMIT,
} from "../src/sitemap.js";
import type { SitemapEntry, SitemapSource } from "../src/sitemap.js";

const site = { url: "https://example.com", name: "Example" };

describe("renderSitemap", () => {
  it("renders empty urlset when entries is empty", () => {
    const out = renderSitemap([]);
    expect(out).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(out).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(out).toContain("</urlset>");
  });

  it("renders a single entry with loc", () => {
    const out = renderSitemap([{ url: "https://example.com/" }]);
    expect(out).toContain("<loc>https://example.com/</loc>");
  });

  it("includes lastmod as ISO datetime", () => {
    const out = renderSitemap([
      { url: "https://example.com/", lastmod: new Date("2026-05-14T00:00:00.000Z") },
    ]);
    expect(out).toContain("<lastmod>2026-05-14T00:00:00.000Z</lastmod>");
  });

  it("includes changefreq and priority", () => {
    const out = renderSitemap([
      { url: "https://example.com/", changefreq: "daily", priority: 0.8 },
    ]);
    expect(out).toContain("<changefreq>daily</changefreq>");
    expect(out).toContain("<priority>0.8</priority>");
  });

  it("clamps priority above 1.0 and below 0.0 in the rendered output", () => {
    const high = renderSitemap([{ url: "https://example.com/a", priority: 1.5 }]);
    const low = renderSitemap([{ url: "https://example.com/b", priority: -0.5 }]);
    expect(high).toContain("<priority>1.0</priority>");
    expect(low).toContain("<priority>0.0</priority>");
  });

  it("emits xhtml:link alternates with xhtml namespace declaration", () => {
    const out = renderSitemap([
      {
        url: "https://example.com/",
        alternates: {
          en: "https://example.com/",
          fr: "https://example.com/fr/",
        },
      },
    ]);
    expect(out).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(out).toContain(
      '<xhtml:link rel="alternate" hreflang="en" href="https://example.com/"/>',
    );
    expect(out).toContain(
      '<xhtml:link rel="alternate" hreflang="fr" href="https://example.com/fr/"/>',
    );
  });

  it("omits xhtml namespace when no entry has alternates", () => {
    const out = renderSitemap([{ url: "https://example.com/" }]);
    expect(out).not.toContain("xmlns:xhtml");
  });

  it("escapes XML special characters in URLs", () => {
    const out = renderSitemap([{ url: "https://example.com/?q=a&b=c<d>" }]);
    expect(out).toContain("&amp;b=c&lt;d&gt;");
    expect(out).not.toContain("?q=a&b");
  });
});

describe("renderSitemapIndex", () => {
  it("renders a sitemapindex with sitemap entries", () => {
    const out = renderSitemapIndex([
      "https://example.com/sitemap-0.xml",
      "https://example.com/sitemap-1.xml",
    ]);
    expect(out).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(out).toContain("<loc>https://example.com/sitemap-0.xml</loc>");
    expect(out).toContain("<loc>https://example.com/sitemap-1.xml</loc>");
  });

  it("renders empty sitemapindex when given no urls", () => {
    const out = renderSitemapIndex([]);
    expect(out).toContain("<sitemapindex");
    expect(out).toContain("</sitemapindex>");
  });
});

describe("collectEntries", () => {
  const ctx = { site };

  it("collects entries from multiple sources and sorts by URL", async () => {
    const s1: SitemapSource = {
      key: ["a"],
      collect: () => [{ url: "https://example.com/b" }, { url: "https://example.com/a" }],
    };
    const s2: SitemapSource = {
      key: ["b"],
      collect: () => [{ url: "https://example.com/c" }],
    };
    const result = await collectEntries({ sources: [s1, s2], ctx });
    expect(result.map((e) => e.url)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c",
    ]);
  });

  it("dedups by URL, last write wins, and warns", async () => {
    const warnings: string[] = [];
    const s1: SitemapSource = {
      key: ["first"],
      collect: () => [{ url: "https://example.com/x", priority: 0.5 }],
    };
    const s2: SitemapSource = {
      key: ["second"],
      collect: () => [{ url: "https://example.com/x", priority: 0.9 }],
    };
    const result = await collectEntries({
      sources: [s1, s2],
      ctx,
      logger: { warn: (m) => warnings.push(m) },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.priority).toBe(0.9);
    expect(warnings.some((m) => m.includes("duplicate"))).toBe(true);
  });

  it("throws when an entry url is not absolute", async () => {
    const source: SitemapSource = {
      key: ["bad"],
      collect: () => [{ url: "/relative" }],
    };
    await expect(collectEntries({ sources: [source], ctx })).rejects.toThrow(/absolute/);
  });

  it("warns when priority is outside [0, 1]", async () => {
    const warnings: string[] = [];
    const source: SitemapSource = {
      key: ["p"],
      collect: () => [{ url: "https://example.com/", priority: 2 }],
    };
    await collectEntries({
      sources: [source],
      ctx,
      logger: { warn: (m) => warnings.push(m) },
    });
    expect(warnings.some((m) => m.includes("priority"))).toBe(true);
  });
});

const mkEntries = (n: number): SitemapEntry[] =>
  Array.from({ length: n }, (_, i) => ({ url: `https://example.com/p${i}` }));

describe("buildSitemapFiles", () => {
  it("returns a single sitemap.xml when entries fit within chunkSize", () => {
    const files = buildSitemapFiles(mkEntries(3), "https://example.com");
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe("sitemap.xml");
    expect(files[0]?.content).toContain("<urlset");
  });

  it("splits into chunks plus an index when count exceeds chunkSize", () => {
    const files = buildSitemapFiles(mkEntries(5), "https://example.com", 2);
    expect(files.map((f) => f.path)).toEqual([
      "sitemap-0.xml",
      "sitemap-1.xml",
      "sitemap-2.xml",
      "sitemap.xml",
    ]);
    const index = files.at(-1);
    expect(index?.content).toContain("<sitemapindex");
    expect(index?.content).toContain("https://example.com/sitemap-0.xml");
    expect(index?.content).toContain("https://example.com/sitemap-2.xml");
  });

  it("throws on non-positive chunkSize", () => {
    expect(() => buildSitemapFiles(mkEntries(1), "https://example.com", 0)).toThrow(/> 0/);
    expect(() => buildSitemapFiles(mkEntries(1), "https://example.com", -1)).toThrow(/> 0/);
  });

  it("exposes the sitemaps.org URL limit", () => {
    expect(SITEMAP_URL_LIMIT).toBe(50_000);
  });
});
