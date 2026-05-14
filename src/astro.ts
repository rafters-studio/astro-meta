// @rafters/astro-meta/astro — Astro integration
//
// Wires per-surface modules into Astro's build pipeline:
//   - head injection via middleware (per-route site meta and JSON-LD)
//   - robots.txt emission on build:done
//   - sitemap.xml emission on build:done
//   - llms.txt / llms-full.txt emission on build:done
//   - OG image rendering on build:done (optional, requires satori peer dep)
//   - GEO audit on build:done (optional, threshold-gated)
//
// v0.1 ships the minimum runtime: site-meta middleware + robots/sitemap stubs.
// Subsequent issues fill schema, entity-graph, llms-txt, og, audit.

import { mkdir, writeFile } from "node:fs/promises";
import type { AstroIntegration } from "astro";
import type { SiteIdentity } from "./index.js";
import type { SchemaModule } from "./schema.js";
import type { LlmsTxtSource } from "./llms-txt.js";
import type { RobotsConfig } from "./robots.js";
import type { SitemapSource } from "./sitemap.js";
import type { OgModule } from "./og.js";
import type { AuditRule } from "./audit.js";
import { isAbsoluteUrl } from "./internal/render-site-meta.js";

export interface AstroMetaOptions {
  site: SiteIdentity;
  schema?: { modules: readonly SchemaModule[] };
  robots?: RobotsConfig;
  sitemap?: { sources: readonly SitemapSource[]; chunkSize?: number };
  llmsTxt?: { sources: readonly LlmsTxtSource[]; full?: boolean };
  og?: { modules: readonly OgModule[] };
  audit?: { rules?: readonly AuditRule[]; threshold?: number; failBuild?: boolean };
}

const VIRTUAL_ID = "virtual:astro-meta/config";
const VIRTUAL_RESOLVED = "\0virtual:astro-meta/config";

export function astroMeta(opts: AstroMetaOptions): AstroIntegration {
  return {
    name: "@rafters/astro-meta",
    hooks: {
      "astro:config:setup": ({ addMiddleware, updateConfig, logger }) => {
        if (!isAbsoluteUrl(opts.site.url)) {
          throw new Error(
            `@rafters/astro-meta: site.url must be an absolute http(s) URL (got: ${opts.site.url})`,
          );
        }

        warnIfEmpty(opts, logger);

        const serialized = JSON.stringify(opts);
        updateConfig({
          vite: {
            plugins: [
              {
                name: "@rafters/astro-meta:virtual-config",
                resolveId(id: string) {
                  if (id === VIRTUAL_ID) return VIRTUAL_RESOLVED;
                  return undefined;
                },
                load(id: string) {
                  if (id === VIRTUAL_RESOLVED) {
                    return `export const config = ${serialized};`;
                  }
                  return undefined;
                },
              },
            ],
          },
        });

        addMiddleware({
          entrypoint: new URL("./middleware.js", import.meta.url),
          order: "post",
        });
      },

      "astro:build:done": async ({ dir, logger }) => {
        const outDir = dir.pathname;
        await mkdir(outDir, { recursive: true });

        const robotsBody = renderMinimalRobots(opts);
        await writeFile(`${outDir}robots.txt`, robotsBody, "utf-8");

        const sitemapBody = renderMinimalSitemap();
        await writeFile(`${outDir}sitemap.xml`, sitemapBody, "utf-8");

        logger.info("wrote robots.txt and sitemap.xml");
      },
    },
  };
}

interface MinimalLogger {
  warn: (msg: string) => void;
}

function warnIfEmpty(opts: AstroMetaOptions, logger: MinimalLogger): void {
  const empty = [
    ["schema", opts.schema?.modules],
    ["sitemap", opts.sitemap?.sources],
    ["llmsTxt", opts.llmsTxt?.sources],
    ["og", opts.og?.modules],
  ] as const;
  for (const [key, collection] of empty) {
    if (collection !== undefined && collection.length === 0) {
      logger.warn(`${key} option provided but its module/source array is empty; surface inactive`);
    }
  }
}

function renderMinimalRobots(opts: AstroMetaOptions): string {
  const sitemap = opts.robots?.sitemap ?? `${opts.site.url}/sitemap.xml`;
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`;
}

function renderMinimalSitemap(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    "</urlset>\n"
  );
}
