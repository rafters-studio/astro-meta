// Sources for the example app, which is also the version-matrix fixture.
//
// These exist so the fixture build exercises something. A config carrying only
// `site` emits a robots.txt and an EMPTY <urlset>, so a matrix leg asserting
// those files exist would pass on every Astro version without proving the
// source pipeline ran at all.
//
// Deliberately no astro:content here. Source modules are imported by
// astro.config.*, which Node loads outside Vite's module graph, so the virtual
// module never resolves. See the README.

import type { LlmsTxtSource } from "@rafters/astro-meta/llms-txt";
import type { SitemapSource } from "@rafters/astro-meta/sitemap";

const SITE = "https://example.com";

const PAGES = [
  { path: "/", title: "Home", summary: "The example app home page." },
  { path: "/about/", title: "About", summary: "What this example demonstrates." },
] as const;

// Absolute here, site-relative in the llms-txt source below. That asymmetry is
// the current published behavior on main; #44 makes sitemap accept both. Once
// it lands this can drop the prefix, and the fixture exercising both shapes in
// the meantime is deliberate.
export const pagesSitemap: SitemapSource = {
  key: ["pages"],
  collect: () =>
    PAGES.map((page) => ({
      url: `${SITE}${page.path}`,
      changefreq: "weekly" as const,
      priority: page.path === "/" ? 1 : 0.5,
    })),
};

export const pagesLlms: LlmsTxtSource = {
  key: ["pages"],
  collect: () =>
    PAGES.map((page) => ({
      title: page.title,
      url: page.path,
      summary: page.summary,
      section: "Pages",
      body: `# ${page.title}\n\n${page.summary} This body is markdown, so it survives the llms-full.txt contract check.`,
    })),
};
