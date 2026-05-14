import { describe, it, expect } from "vitest";
import { renderSiteMeta, injectIntoHead, isAbsoluteUrl } from "../src/internal/render-site-meta.js";

describe("renderSiteMeta", () => {
  it("emits canonical, og, twitter card tags for a minimal site", () => {
    const out = renderSiteMeta({ url: "https://example.com", name: "Example" }, "/about");
    expect(out).toContain('<link rel="canonical" href="https://example.com/about">');
    expect(out).toContain('<meta property="og:url" content="https://example.com/about">');
    expect(out).toContain('<meta property="og:site_name" content="Example">');
    expect(out).toContain('<meta property="og:type" content="website">');
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(out).toContain('<meta name="generator" content="@rafters/astro-meta">');
  });

  it("includes description tags when set", () => {
    const out = renderSiteMeta(
      { url: "https://example.com", name: "Example", description: "A site" },
      "/",
    );
    expect(out).toContain('<meta name="description" content="A site">');
    expect(out).toContain('<meta property="og:description" content="A site">');
  });

  it("includes og:locale when set", () => {
    const out = renderSiteMeta(
      { url: "https://example.com", name: "Example", locale: "en-US" },
      "/",
    );
    expect(out).toContain('<meta property="og:locale" content="en-US">');
  });

  it("escapes HTML special chars in attribute values", () => {
    const out = renderSiteMeta(
      { url: "https://example.com", name: 'Site "Quotes" & <Brackets>' },
      "/",
    );
    expect(out).toContain("&quot;Quotes&quot;");
    expect(out).toContain("&amp;");
    expect(out).toContain("&lt;Brackets&gt;");
    expect(out).not.toContain('"Quotes"');
  });

  it("handles route without leading slash", () => {
    const out = renderSiteMeta({ url: "https://example.com", name: "Example" }, "about");
    expect(out).toContain('<link rel="canonical" href="https://example.com/about">');
  });
});

describe("injectIntoHead", () => {
  it("inserts content before </head>", () => {
    const html = "<html><head><title>X</title></head><body></body></html>";
    const out = injectIntoHead(html, '<meta name="x">');
    expect(out).toContain('<title>X</title>  <meta name="x">\n</head>');
  });

  it("returns html unchanged when no </head> present", () => {
    const html = "<div>no head</div>";
    expect(injectIntoHead(html, '<meta name="x">')).toBe(html);
  });
});

describe("isAbsoluteUrl", () => {
  it.each([
    ["https://example.com", true],
    ["http://example.com", true],
    ["https://example.com/path", true],
    ["/path", false],
    ["example.com", false],
    ["ftp://example.com", false],
    ["", false],
  ])("isAbsoluteUrl(%j) === %s", (input, expected) => {
    expect(isAbsoluteUrl(input)).toBe(expected);
  });
});
