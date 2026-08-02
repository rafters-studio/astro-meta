import { defineConfig } from "astro/config";
import { astroMeta } from "@rafters/astro-meta/astro";
import { defineSite } from "@rafters/astro-meta";
import { pagesLlms, pagesSitemap } from "./src/meta/sources.ts";

export default defineConfig({
  site: "https://example.com",
  integrations: [
    astroMeta({
      site: defineSite({
        url: "https://example.com",
        name: "astro-meta example",
        description: "Component-composition pattern",
        locale: "en-US",
      }),
      robots: {
        rules: [{ userAgent: "*", allow: ["/"] }],
        contentSignals: { policy: { search: "yes", aiInput: "yes", aiTrain: "no" } },
      },
      sitemap: { sources: [pagesSitemap] },
      llmsTxt: { sources: [pagesLlms], onNonMarkdownBody: "error" },
    }),
  ],
});
