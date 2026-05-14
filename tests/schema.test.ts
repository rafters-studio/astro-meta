import { describe, it, expect } from "vitest";
import { collectSchemas, mergeGraph, renderJsonLd, renderSchemaScript } from "../src/schema.js";
import type { SchemaModule } from "../src/schema.js";

const ctx = { site: { url: "https://example.com", name: "Example" }, page: { route: "/" } };

describe("renderJsonLd", () => {
  it("renders a single object with @context prepended", () => {
    const out = renderJsonLd({ "@type": "Organization", name: "Example" });
    expect(out).toBe('{"@context":"https://schema.org","@type":"Organization","name":"Example"}');
  });

  it("renders an array as @graph", () => {
    const out = renderJsonLd([
      { "@type": "Organization", name: "Org" },
      { "@type": "Person", name: "Sean" },
    ]);
    const parsed = JSON.parse(out);
    expect(parsed["@context"]).toBe("https://schema.org");
    expect(parsed["@graph"]).toHaveLength(2);
    expect(parsed["@graph"][0]).toEqual({ "@type": "Organization", name: "Org" });
  });

  it("escapes < > and & so </script> cannot break out of an inline script tag", () => {
    const out = renderJsonLd({
      "@type": "Article",
      headline: "</script><img src=x onerror=alert(1)>",
      description: "ampersands & angle <brackets>",
    });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<img");
    expect(out).not.toMatch(/[<>&]/);
    const parsed = JSON.parse(out);
    expect(parsed.headline).toBe("</script><img src=x onerror=alert(1)>");
    expect(parsed.description).toBe("ampersands & angle <brackets>");
  });

  it("escapes U+2028 and U+2029 so JS parsers don't see line terminators", () => {
    const ls = String.fromCharCode(0x2028);
    const ps = String.fromCharCode(0x2029);
    const out = renderJsonLd({ "@type": "Article", headline: `line${ls}sep${ps}done` });
    expect(out).not.toContain(ls);
    expect(out).not.toContain(ps);
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
    const parsed = JSON.parse(out);
    expect(parsed.headline).toBe(`line${ls}sep${ps}done`);
  });
});

describe("mergeGraph", () => {
  it("merges objects sharing an @id, last write wins", () => {
    const out = mergeGraph([
      { "@type": "Person", "@id": "#sean", name: "Sean" },
      { "@type": "Person", "@id": "#sean", knowsAbout: ["astro"] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      "@type": "Person",
      "@id": "#sean",
      name: "Sean",
      knowsAbout: ["astro"],
    });
  });

  it("keeps anonymous objects in order alongside id'd ones", () => {
    const out = mergeGraph([
      { "@type": "Article", headline: "A1" },
      { "@type": "Organization", "@id": "#org", name: "Org" },
      { "@type": "Article", headline: "A2" },
    ]);
    expect(out).toHaveLength(3);
  });

  it("composes with renderJsonLd to produce a clean @graph block (no spurious @type)", () => {
    const merged = mergeGraph([
      { "@type": "Organization", "@id": "#org", name: "Org" },
      { "@type": "WebSite", url: "https://example.com" },
    ]);
    const out = renderJsonLd(merged);
    const parsed = JSON.parse(out);
    expect(parsed["@context"]).toBe("https://schema.org");
    expect(parsed["@graph"]).toHaveLength(2);
    expect(parsed["@type"]).toBeUndefined();
  });
});

describe("collectSchemas", () => {
  it("collects from multiple modules, normalizing arrays and async returns", async () => {
    const m1: SchemaModule = {
      key: ["org"],
      schema: () => ({ "@type": "Organization", name: "Org" }),
    };
    const m2: SchemaModule = {
      key: ["site"],
      schema: () => Promise.resolve([{ "@type": "WebSite", url: "https://example.com" }]),
    };
    const out = await collectSchemas([m1, m2], ctx);
    expect(out).toHaveLength(2);
    expect(out[0]?.["@type"]).toBe("Organization");
    expect(out[1]?.["@type"]).toBe("WebSite");
  });

  it("supports modules returning an empty array (route-scoped opt out)", async () => {
    const m: SchemaModule = {
      key: ["article"],
      schema: ({ ctx: { page } }) =>
        page?.route?.startsWith("/blog/") ? { "@type": "Article" } : [],
    };
    const onHome = await collectSchemas([m], ctx);
    expect(onHome).toHaveLength(0);
    const onBlog = await collectSchemas([m], {
      site: ctx.site,
      page: { route: "/blog/post" },
    });
    expect(onBlog).toHaveLength(1);
  });

  it("throws when a module emits an object without @type", async () => {
    const m: SchemaModule = {
      key: ["broken"],
      schema: () => ({ "@type": "" }),
    };
    await expect(collectSchemas([m], ctx)).rejects.toThrow(/string @type/);
  });
});

describe("renderSchemaScript", () => {
  it("returns the empty string for empty input", () => {
    expect(renderSchemaScript([])).toBe("");
  });

  it("renders a single-object script tag", () => {
    const out = renderSchemaScript([{ "@type": "Organization", name: "Org" }]);
    expect(out).toContain('<script type="application/ld+json">');
    expect(out).toContain('"@type":"Organization"');
    expect(out).toContain("</script>");
  });

  it("renders multiple objects under @graph", () => {
    const out = renderSchemaScript([
      { "@type": "Organization", name: "Org" },
      { "@type": "Person", name: "Sean" },
    ]);
    expect(out).toContain('"@graph"');
    expect(out).toContain('"Organization"');
    expect(out).toContain('"Person"');
  });
});
