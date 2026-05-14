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
import { buildLlmsTxt } from "./llms-txt.js";
import type { RobotsConfig } from "./robots.js";
import { findUnknownAgents, renderContentSignalsHeadersFile, renderRobots } from "./robots.js";
import type { SitemapSource } from "./sitemap.js";
import { buildSitemapFiles, collectEntries, renderSitemap } from "./sitemap.js";
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
        warnOnUnknownCrawlers(opts, logger);

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

        const robotsBody = renderRobotsForOpts(opts);
        await writeFile(`${outDir}robots.txt`, robotsBody, "utf-8");

        const sitemapFiles = await buildSitemapForOpts(opts, logger);
        await Promise.all(
          sitemapFiles.map((file) => writeFile(`${outDir}${file.path}`, file.content, "utf-8")),
        );

        const llmsFiles = await buildLlmsTxtForOpts(opts);
        await Promise.all(
          llmsFiles.map((file) => writeFile(`${outDir}${file.path}`, file.content, "utf-8")),
        );

        const written = [
          "robots.txt",
          ...sitemapFiles.map((f) => f.path),
          ...llmsFiles.map((f) => f.path),
        ];

        const headersBody = renderHeadersFile(opts);
        if (headersBody.length > 0) {
          await writeFile(`${outDir}_headers`, headersBody, "utf-8");
          written.push("_headers");
        }

        logger.info(`wrote ${written.join(", ")}`);
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

function warnOnUnknownCrawlers(opts: AstroMetaOptions, logger: MinimalLogger): void {
  if (!opts.robots) return;
  const unknown = findUnknownAgents(opts.robots);
  for (const agent of unknown) {
    logger.warn(
      `robots rule names user-agent "${agent}" not in the curated AI-crawler matrix; check for typos`,
    );
  }
}

function renderRobotsForOpts(opts: AstroMetaOptions): string {
  if (opts.robots) {
    const config: RobotsConfig = {
      rules: opts.robots.rules,
      sitemap: opts.robots.sitemap ?? `${opts.site.url}/sitemap.xml`,
      ...(opts.robots.contentSignals ? { contentSignals: opts.robots.contentSignals } : {}),
    };
    return renderRobots(config);
  }
  return renderRobots({
    rules: [{ userAgent: "*", allow: ["/"] }],
    sitemap: `${opts.site.url}/sitemap.xml`,
  });
}

function renderHeadersFile(opts: AstroMetaOptions): string {
  if (!opts.robots?.contentSignals) return "";
  return renderContentSignalsHeadersFile(opts.robots.contentSignals);
}

async function buildLlmsTxtForOpts(
  opts: AstroMetaOptions,
): Promise<{ path: string; content: string }[]> {
  if (!opts.llmsTxt || opts.llmsTxt.sources.length === 0) return [];
  const wildcard = opts.robots?.rules.find((r) => r.userAgent === "*");
  const result = await buildLlmsTxt(
    {
      sources: opts.llmsTxt.sources,
      disallow: wildcard?.disallow,
      header: { title: opts.site.name, description: opts.site.description },
      full: opts.llmsTxt.full,
    },
    { site: opts.site },
  );
  const files: { path: string; content: string }[] = [{ path: "llms.txt", content: result.index }];
  if (result.full !== undefined) {
    files.push({ path: "llms-full.txt", content: result.full });
  }
  return files;
}

async function buildSitemapForOpts(
  opts: AstroMetaOptions,
  logger: MinimalLogger,
): Promise<{ path: string; content: string }[]> {
  if (!opts.sitemap || opts.sitemap.sources.length === 0) {
    return [{ path: "sitemap.xml", content: renderSitemap([]) }];
  }
  const entries = await collectEntries({
    sources: opts.sitemap.sources,
    ctx: { site: opts.site },
    logger,
  });
  return buildSitemapFiles(entries, opts.site.url, opts.sitemap.chunkSize);
}
