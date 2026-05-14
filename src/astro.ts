// @rafters/astro-meta/astro — Astro integration
//
// Wires per-surface modules into Astro's build pipeline:
//   - head injection via middleware (per-route JSON-LD + meta)
//   - robots.txt emission on build:done
//   - sitemap.xml emission on build:done
//   - llms.txt and llms-full.txt emission on build:done
//   - OG image rendering on build:done (optional, requires satori peer dep)
//   - GEO audit on build:done (optional, threshold-gated)
//
// The integration is a single entry point; consumers opt into each surface
// by passing the corresponding option.

import type { AstroIntegration } from "astro";
import type { SiteIdentity } from "./index.js";
import type { SchemaModule } from "./schema.js";
import type { LlmsTxtSource } from "./llms-txt.js";
import type { RobotsConfig } from "./robots.js";
import type { SitemapSource } from "./sitemap.js";
import type { OgModule } from "./og.js";
import type { AuditRule } from "./audit.js";

export interface AstroMetaOptions {
  site: SiteIdentity;
  schema?: { modules: readonly SchemaModule[] };
  robots?: RobotsConfig;
  sitemap?: { sources: readonly SitemapSource[]; chunkSize?: number };
  llmsTxt?: { sources: readonly LlmsTxtSource[]; full?: boolean };
  og?: { modules: readonly OgModule[] };
  audit?: { rules?: readonly AuditRule[]; threshold?: number; failBuild?: boolean };
}

/** Create the Astro integration. v0.1 returns a stub; v0.2 wires the hooks. */
export function astroMeta(_opts: AstroMetaOptions): AstroIntegration {
  throw new Error("not implemented");
}
