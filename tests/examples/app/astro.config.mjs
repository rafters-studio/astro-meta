import { defineConfig } from "astro/config";
import { astroMeta } from "@rafters/astro-meta/astro";
import { site } from "./src/site.js";

export default defineConfig({
  site: "https://example.com",
  integrations: [astroMeta({ site })],
});
