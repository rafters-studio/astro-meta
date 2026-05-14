import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

  it("config:setup registers middleware and a virtual-config Vite plugin", () => {
    const integ = astroMeta({
      site: defineSite({ url: "https://example.com", name: "Example" }),
    });
    let middlewareEntrypoint: URL | undefined;
    let viteConfig: { plugins?: unknown[] } | undefined;
    const args = {
      addMiddleware: (m: { entrypoint: URL; order: string }) => {
        middlewareEntrypoint = m.entrypoint;
      },
      updateConfig: (c: { vite?: { plugins?: unknown[] } }) => {
        viteConfig = c.vite;
      },
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
    expect(viteConfig?.plugins?.length).toBeGreaterThan(0);
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
});
