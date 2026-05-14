import { defineConfig } from "astro/config";
import { astroMeta } from "@rafters/astro-meta/astro";
import { defineSite } from "@rafters/astro-meta";

export default defineConfig({
  site: "https://example.com",
  integrations: [
    astroMeta({
      site: defineSite({
        url: "https://example.com",
        name: "astro-meta example",
        description: "Minimum runtime + example app",
        locale: "en-US",
      }),
    }),
  ],
});
