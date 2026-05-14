import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { astroMeta } from "../src/astro.js";
import { defineSite } from "../src/index.js";

type AnyHooks = Record<string, (args: Record<string, unknown>) => unknown>;

function getHook(integ: ReturnType<typeof astroMeta>, name: string) {
  const hooks = integ.hooks as unknown as AnyHooks;
  const hook = hooks[name];
  if (!hook) throw new Error(`hook ${name} not registered`);
  return hook;
}

function fakeConfigSetupArgs() {
  return {
    addMiddleware: () => {},
    updateConfig: () => {},
    command: "build" as const,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      fork: () => fakeConfigSetupArgs().logger,
      label: "",
      options: {},
    },
  };
}

function fakeBuildDoneArgs(distDir: string) {
  return {
    dir: new URL(`file://${distDir}/`),
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    routes: [],
    pages: [],
  };
}

describe("astroMeta integration", () => {
  let distDir: string;

  beforeEach(() => {
    distDir = mkdtempSync(join(tmpdir(), "astro-meta-test-"));
  });

  afterEach(() => {
    rmSync(distDir, { recursive: true, force: true });
  });

  it("exposes the expected hooks", () => {
    const integ = astroMeta({
      site: defineSite({ url: "https://example.com", name: "Example" }),
    });
    expect(integ.name).toBe("@rafters/astro-meta");
    const hooks = integ.hooks as unknown as AnyHooks;
    expect(typeof hooks["astro:config:setup"]).toBe("function");
    expect(typeof hooks["astro:build:done"]).toBe("function");
  });

  it("throws at config:setup if site.url is not an absolute URL", () => {
    const integ = astroMeta({
      site: { url: "/relative", name: "Example" },
    });
    expect(() =>
      getHook(
        integ,
        "astro:config:setup",
      )(fakeConfigSetupArgs() as unknown as Record<string, unknown>),
    ).toThrow(/absolute http\(s\) URL/);
  });

  it("config:setup registers the post-order middleware", () => {
    const integ = astroMeta({
      site: defineSite({ url: "https://example.com", name: "Example" }),
    });
    let middlewareEntrypoint: URL | undefined;
    let middlewareOrder: string | undefined;
    const args = {
      addMiddleware: (m: { entrypoint: URL; order: string }) => {
        middlewareEntrypoint = m.entrypoint;
        middlewareOrder = m.order;
      },
      updateConfig: () => {},
      command: "build",
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    };
    getHook(integ, "astro:config:setup")(args as unknown as Record<string, unknown>);
    expect(middlewareEntrypoint).toBeDefined();
    expect(middlewareEntrypoint?.pathname).toMatch(/middleware\.js$/);
    expect(middlewareOrder).toBe("post");
  });

  it("config:setup warns when a surface array is empty", () => {
    const integ = astroMeta({
      site: defineSite({ url: "https://example.com", name: "Example" }),
      schema: { modules: [] },
    });
    const warnings: string[] = [];
    const args = {
      addMiddleware: () => {},
      updateConfig: () => {},
      command: "build",
      logger: {
        info: () => {},
        warn: (msg: string) => warnings.push(msg),
        error: () => {},
        debug: () => {},
      },
    };
    getHook(integ, "astro:config:setup")(args as unknown as Record<string, unknown>);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("schema");
  });

  it("build:done writes robots.txt and sitemap.xml to dist", async () => {
    const integ = astroMeta({
      site: defineSite({
        url: "https://example.com",
        name: "Example",
        description: "An example site",
      }),
    });
    await getHook(
      integ,
      "astro:build:done",
    )(fakeBuildDoneArgs(distDir) as unknown as Record<string, unknown>);
    const robots = readFileSync(join(distDir, "robots.txt"), "utf-8");
    const sitemap = readFileSync(join(distDir, "sitemap.xml"), "utf-8");
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://example.com/sitemap.xml");
    expect(sitemap).toContain('<?xml version="1.0"');
    expect(sitemap).toContain("urlset");
  });

  it("build:done honors robots.sitemap override", async () => {
    const integ = astroMeta({
      site: defineSite({ url: "https://example.com", name: "Example" }),
      robots: {
        rules: [{ userAgent: "*", allow: ["/"] }],
        sitemap: "https://cdn.example.com/sitemap.xml",
      },
    });
    await getHook(
      integ,
      "astro:build:done",
    )(fakeBuildDoneArgs(distDir) as unknown as Record<string, unknown>);
    const robots = readFileSync(join(distDir, "robots.txt"), "utf-8");
    expect(robots).toContain("Sitemap: https://cdn.example.com/sitemap.xml");
  });

  it("build:done emits configured per-bot rules into robots.txt", async () => {
    const integ = astroMeta({
      site: defineSite({ url: "https://example.com", name: "Example" }),
      robots: {
        rules: [
          { userAgent: "GPTBot", disallow: ["/private"] },
          { userAgent: "ClaudeBot", allow: ["/"] },
        ],
      },
    });
    await getHook(
      integ,
      "astro:build:done",
    )(fakeBuildDoneArgs(distDir) as unknown as Record<string, unknown>);
    const robots = readFileSync(join(distDir, "robots.txt"), "utf-8");
    expect(robots).toContain("User-agent: GPTBot");
    expect(robots).toContain("Disallow: /private");
    expect(robots).toContain("User-agent: ClaudeBot");
  });

  it("build:done writes _headers when contentSignals is configured", async () => {
    const integ = astroMeta({
      site: defineSite({ url: "https://example.com", name: "Example" }),
      robots: {
        rules: [{ userAgent: "*", allow: ["/"] }],
        contentSignals: { search: "yes", aiInput: "yes", aiTrain: "no" },
      },
    });
    await getHook(
      integ,
      "astro:build:done",
    )(fakeBuildDoneArgs(distDir) as unknown as Record<string, unknown>);
    expect(existsSync(join(distDir, "_headers"))).toBe(true);
    const headers = readFileSync(join(distDir, "_headers"), "utf-8");
    expect(headers).toContain("/*");
    expect(headers).toContain("Content-Signals: search=yes, ai-input=yes, ai-train=no");
  });

  it("build:done skips _headers when contentSignals is absent", async () => {
    const integ = astroMeta({
      site: defineSite({ url: "https://example.com", name: "Example" }),
    });
    await getHook(
      integ,
      "astro:build:done",
    )(fakeBuildDoneArgs(distDir) as unknown as Record<string, unknown>);
    expect(existsSync(join(distDir, "_headers"))).toBe(false);
  });

  it("build:done writes sitemap entries from configured sources", async () => {
    const integ = astroMeta({
      site: defineSite({ url: "https://example.com", name: "Example" }),
      sitemap: {
        sources: [
          {
            key: ["pages"],
            collect: () => [{ url: "https://example.com/" }, { url: "https://example.com/about" }],
          },
        ],
      },
    });
    await getHook(
      integ,
      "astro:build:done",
    )(fakeBuildDoneArgs(distDir) as unknown as Record<string, unknown>);
    const sitemap = readFileSync(join(distDir, "sitemap.xml"), "utf-8");
    expect(sitemap).toContain("<loc>https://example.com/</loc>");
    expect(sitemap).toContain("<loc>https://example.com/about</loc>");
  });

  it("build:done splits sitemap into chunks plus index when count exceeds chunkSize", async () => {
    const integ = astroMeta({
      site: defineSite({ url: "https://example.com", name: "Example" }),
      sitemap: {
        chunkSize: 2,
        sources: [
          {
            key: ["pages"],
            collect: () => [
              { url: "https://example.com/a" },
              { url: "https://example.com/b" },
              { url: "https://example.com/c" },
              { url: "https://example.com/d" },
              { url: "https://example.com/e" },
            ],
          },
        ],
      },
    });
    await getHook(
      integ,
      "astro:build:done",
    )(fakeBuildDoneArgs(distDir) as unknown as Record<string, unknown>);
    expect(existsSync(join(distDir, "sitemap-0.xml"))).toBe(true);
    expect(existsSync(join(distDir, "sitemap-1.xml"))).toBe(true);
    expect(existsSync(join(distDir, "sitemap-2.xml"))).toBe(true);
    const index = readFileSync(join(distDir, "sitemap.xml"), "utf-8");
    expect(index).toContain("<sitemapindex");
    expect(index).toContain("https://example.com/sitemap-0.xml");
    expect(index).toContain("https://example.com/sitemap-2.xml");
  });

  it("build:done writes llms.txt and llms-full.txt when sources are configured", async () => {
    const integ = astroMeta({
      site: defineSite({
        url: "https://example.com",
        name: "Example",
        description: "An example",
      }),
      llmsTxt: {
        sources: [
          {
            key: ["docs"],
            collect: () => [
              {
                title: "Intro",
                url: "/docs/intro",
                summary: "Welcome",
                body: "Intro body",
                section: "Docs",
              },
            ],
          },
        ],
      },
    });
    await getHook(
      integ,
      "astro:build:done",
    )(fakeBuildDoneArgs(distDir) as unknown as Record<string, unknown>);
    expect(existsSync(join(distDir, "llms.txt"))).toBe(true);
    expect(existsSync(join(distDir, "llms-full.txt"))).toBe(true);
    const index = readFileSync(join(distDir, "llms.txt"), "utf-8");
    const full = readFileSync(join(distDir, "llms-full.txt"), "utf-8");
    expect(index).toContain("# Example");
    expect(index).toContain("> An example");
    expect(index).toContain("## Docs");
    expect(index).toContain("- [Intro](https://example.com/docs/intro): Welcome");
    expect(full).toContain("## Intro");
    expect(full).toContain("Intro body");
  });

  it("build:done mirrors robots wildcard disallow into llms.txt", async () => {
    const integ = astroMeta({
      site: defineSite({ url: "https://example.com", name: "Example" }),
      robots: {
        rules: [{ userAgent: "*", disallow: ["/private"] }],
      },
      llmsTxt: {
        sources: [
          {
            key: ["mixed"],
            collect: () => [
              { title: "Public", url: "/public/x" },
              { title: "Private", url: "/private/y" },
            ],
          },
        ],
      },
    });
    await getHook(
      integ,
      "astro:build:done",
    )(fakeBuildDoneArgs(distDir) as unknown as Record<string, unknown>);
    const index = readFileSync(join(distDir, "llms.txt"), "utf-8");
    expect(index).toContain("Public");
    expect(index).not.toContain("Private");
  });

  it("build:done injects @graph script into emitted HTML files for schema modules", async () => {
    const indexPath = join(distDir, "index.html");
    const aboutDir = join(distDir, "about");
    mkdirSync(aboutDir);
    writeFileSync(
      indexPath,
      "<!doctype html><html><head><title>Home</title></head><body></body></html>",
      "utf-8",
    );
    writeFileSync(
      join(aboutDir, "index.html"),
      "<!doctype html><html><head><title>About</title></head><body></body></html>",
      "utf-8",
    );
    const integ = astroMeta({
      site: defineSite({ url: "https://example.com", name: "Example" }),
      schema: {
        modules: [
          {
            key: ["org"],
            schema: ({ ctx }) => ({
              "@type": "Organization",
              "@id": `${ctx.site.url}#org`,
              name: ctx.site.name,
            }),
          },
          {
            key: ["page"],
            schema: ({ ctx }) =>
              ctx.page?.route === "/about/"
                ? { "@type": "WebPage", url: `${ctx.site.url}${ctx.page.route}` }
                : [],
          },
        ],
      },
    });
    await getHook(
      integ,
      "astro:build:done",
    )(fakeBuildDoneArgs(distDir) as unknown as Record<string, unknown>);
    const home = readFileSync(indexPath, "utf-8");
    const about = readFileSync(join(aboutDir, "index.html"), "utf-8");
    expect(home).toContain('<script type="application/ld+json">');
    expect(home).toContain('"Organization"');
    expect(home).not.toContain('"WebPage"');
    expect(about).toContain('"Organization"');
    expect(about).toContain('"WebPage"');
  });

  it("build:done skips llms.txt when no llmsTxt option is configured", async () => {
    const integ = astroMeta({
      site: defineSite({ url: "https://example.com", name: "Example" }),
    });
    await getHook(
      integ,
      "astro:build:done",
    )(fakeBuildDoneArgs(distDir) as unknown as Record<string, unknown>);
    expect(existsSync(join(distDir, "llms.txt"))).toBe(false);
    expect(existsSync(join(distDir, "llms-full.txt"))).toBe(false);
  });

  it("config:setup warns when a rule names an agent outside the curated matrix", () => {
    const integ = astroMeta({
      site: defineSite({ url: "https://example.com", name: "Example" }),
      robots: {
        rules: [{ userAgent: "GPTBot" }, { userAgent: "MysteryBot" }],
      },
    });
    const warnings: string[] = [];
    const args = {
      addMiddleware: () => {},
      updateConfig: () => {},
      command: "build",
      logger: {
        info: () => {},
        warn: (msg: string) => warnings.push(msg),
        error: () => {},
        debug: () => {},
      },
    };
    getHook(integ, "astro:config:setup")(args as unknown as Record<string, unknown>);
    expect(warnings.some((m) => m.includes("MysteryBot"))).toBe(true);
    expect(warnings.some((m) => m.includes("GPTBot"))).toBe(false);
  });
});
