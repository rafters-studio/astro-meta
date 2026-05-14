// @rafters/astro-meta/astro — Astro integration
//
// Build-time emission of the per-route artifacts that live at well-known URLs
// on the site root:
//   - robots.txt
//   - sitemap.xml (+ sitemap-index when chunked)
//   - llms.txt and llms-full.txt
//   - _headers (Cloudflare Pages Content-Signals)
//   - og/<slug>.png per matching OG module
//   - _geo-audit.json with the readability report
//
// Head-tag emission is consumer-owned via the Astro components shipped from
// @rafters/astro-meta/components. The integration never reads or mutates
// generated HTML; build:done writes files only.

import { glob, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, posix as posixPath } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration, AstroIntegrationLogger } from "astro";
import type { SiteIdentity } from "./index.js";
import type { LlmsTxtSource } from "./llms-txt.js";
import { buildLlmsTxt } from "./llms-txt.js";
import type { RobotsConfig } from "./robots.js";
import { findUnknownAgents, renderContentSignalsHeadersFile, renderRobots } from "./robots.js";
import type { SitemapSource } from "./sitemap.js";
import { buildSitemapFiles, collectEntries, renderSitemap } from "./sitemap.js";
import type { OgModule } from "./og.js";
import { ogSlugForRoute, renderOg } from "./og.js";
import type { AuditRule } from "./audit.js";
import { defaultRules, parseRoute, runAudit } from "./audit.js";
import { isAbsoluteUrl } from "./internal/render-site-meta.js";

export interface AstroMetaOptions {
  site: SiteIdentity;
  robots?: RobotsConfig;
  sitemap?: { sources: readonly SitemapSource[]; chunkSize?: number };
  llmsTxt?: { sources: readonly LlmsTxtSource[]; full?: boolean };
  og?: { modules: readonly OgModule[] };
  audit?: { rules?: readonly AuditRule[]; threshold?: number; failBuild?: boolean };
}

export function astroMeta(opts: AstroMetaOptions): AstroIntegration {
  return {
    name: "@rafters/astro-meta",
    hooks: {
      "astro:config:setup": ({ logger }) => {
        if (!isAbsoluteUrl(opts.site.url)) {
          throw new Error(
            `@rafters/astro-meta: site.url must be an absolute http(s) URL (got: ${opts.site.url})`,
          );
        }
        warnIfEmpty(opts, logger);
        warnOnUnknownCrawlers(opts, logger);
      },

      "astro:build:done": async ({ dir, logger }) => {
        const buildLogger = logger.fork("astro-meta");
        const outDir = fileURLToPath(dir);
        await mkdir(outDir, { recursive: true });

        const robotsBody = renderRobotsForOpts(opts);
        await writeFile(join(outDir, "robots.txt"), robotsBody, "utf-8");

        const sitemapFiles = await buildSitemapForOpts(opts, buildLogger);
        await Promise.all(
          sitemapFiles.map((file) => writeFile(join(outDir, file.path), file.content, "utf-8")),
        );

        const llmsFiles = await buildLlmsTxtForOpts(opts);
        await Promise.all(
          llmsFiles.map((file) => writeFile(join(outDir, file.path), file.content, "utf-8")),
        );

        const written = [
          "robots.txt",
          ...sitemapFiles.map((f) => f.path),
          ...llmsFiles.map((f) => f.path),
        ];

        const headersBody = renderHeadersFile(opts);
        if (headersBody.length > 0) {
          await writeFile(join(outDir, "_headers"), headersBody, "utf-8");
          written.push("_headers");
        }

        const ogCount = await renderOgPngs(opts, outDir, buildLogger);
        if (ogCount > 0) {
          written.push(`og(${ogCount} image(s))`);
        }

        const auditReport = await runAuditForOpts(opts, outDir, buildLogger);
        if (auditReport) {
          await writeFile(
            join(outDir, "_geo-audit.json"),
            JSON.stringify(auditReport, null, 2),
            "utf-8",
          );
          written.push("_geo-audit.json");
          if (opts.audit?.failBuild && opts.audit.threshold !== undefined) {
            const failing = auditReport.routes.filter(
              (r) => r.score < (opts.audit?.threshold ?? 0),
            );
            if (failing.length > 0) {
              throw new Error(
                `@rafters/astro-meta/audit: ${failing.length} route(s) scored below threshold ${opts.audit.threshold}: ${failing.map((f) => `${f.route}=${f.score}`).join(", ")}`,
              );
            }
          }
        }

        buildLogger.info(`wrote ${written.join(", ")}`);
      },
    },
  };
}

type MinimalLogger = Pick<AstroIntegrationLogger, "warn">;

function warnIfEmpty(opts: AstroMetaOptions, logger: MinimalLogger): void {
  const empty = [
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

function routeFromHtmlPath(htmlPath: string): string {
  const stripped = posixPath.normalize(`/${htmlPath}`).replace(/index\.html$/, "");
  return stripped.length === 0 ? "/" : stripped;
}

interface DistRoute {
  rel: string;
  route: string;
}

async function discoverDistRoutes(outDir: string): Promise<DistRoute[]> {
  const routes: DistRoute[] = [];
  for await (const rel of glob("**/*.html", { cwd: outDir })) {
    routes.push({ rel, route: routeFromHtmlPath(rel) });
  }
  return routes;
}

/**
 * Walk dist/**\/*.html read-only to discover routes, run the first matching
 * OG module per route, write the PNG to dist/og/<slug>.png. The integration
 * never modifies the HTML; consumers reference the generated URL from their
 * layout via @rafters/astro-meta/components/OgImage.astro.
 */
async function renderOgPngs(
  opts: AstroMetaOptions,
  outDir: string,
  logger: MinimalLogger,
): Promise<number> {
  if (!opts.og || opts.og.modules.length === 0) return 0;
  const routes = await discoverDistRoutes(outDir);
  const ogDir = join(outDir, "og");
  await mkdir(ogDir, { recursive: true });
  let written = 0;
  await Promise.all(
    routes.map(async ({ route }) => {
      const matchingModules =
        opts.og?.modules.filter((m) => (m.match ? m.match(route) : true)) ?? [];
      if (matchingModules.length === 0) return;
      const firstModule = matchingModules[0];
      if (!firstModule) return;
      if (matchingModules.length > 1) {
        const keys = matchingModules.map((m) => `[${m.key.join(", ")}]`).join(", ");
        logger.warn(
          `og: multiple modules matched route ${route} (${keys}); the first wins. Order modules from most-specific to least-specific in the modules array.`,
        );
      }
      const png = await renderOg(firstModule, { site: opts.site, page: { route } });
      const slug = ogSlugForRoute(route);
      const pngPath = join(ogDir, `${slug}.png`);
      await mkdir(join(ogDir, posixPath.dirname(slug)), { recursive: true });
      await writeFile(pngPath, png);
      written += 1;
    }),
  );
  return written;
}

async function runAuditForOpts(
  opts: AstroMetaOptions,
  outDir: string,
  logger: MinimalLogger,
): Promise<ReturnType<typeof runAudit> | null> {
  if (!opts.audit) return null;
  const distRoutes = await discoverDistRoutes(outDir);
  if (distRoutes.length === 0) return null;
  const parsedRoutes = await Promise.all(
    distRoutes.map(async ({ rel, route }) => {
      const html = await readFile(join(outDir, rel), "utf-8");
      return parseRoute(route, html);
    }),
  );
  const rules = opts.audit.rules ?? defaultRules;
  const report = runAudit(parsedRoutes, rules);
  for (const r of report.routes) {
    if (r.score < 50) logger.warn(`audit: ${r.route} scored ${r.score}/100`);
  }
  return report;
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
