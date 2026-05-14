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

import { glob, mkdir, readFile, writeFile } from "node:fs/promises";
import { posix as posixPath } from "node:path";
import type { AstroIntegration } from "astro";
import type { SiteIdentity } from "./index.js";
import type { SchemaModule } from "./schema.js";
import { collectSchemas, renderSchemaScript } from "./schema.js";
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
import { injectIntoHead, isAbsoluteUrl } from "./internal/render-site-meta.js";

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

        const serialized = JSON.stringify({ site: opts.site });
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

        const schemaCount = await injectSchemasIntoHtml(opts, outDir);
        if (schemaCount > 0) {
          written.push(`schema(${schemaCount} route(s))`);
        }

        const ogCount = await renderAndInjectOg(opts, outDir);
        if (ogCount > 0) {
          written.push(`og(${ogCount} image(s))`);
        }

        const auditReport = await runAuditForOpts(opts, outDir, logger);
        if (auditReport) {
          await writeFile(
            `${outDir}_geo-audit.json`,
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

function routeFromHtmlPath(htmlPath: string): string {
  const stripped = posixPath.normalize(`/${htmlPath}`).replace(/index\.html$/, "");
  return stripped.length === 0 ? "/" : stripped;
}

async function injectSchemasIntoHtml(opts: AstroMetaOptions, outDir: string): Promise<number> {
  if (!opts.schema || opts.schema.modules.length === 0) return 0;
  const htmlFiles: string[] = [];
  for await (const entry of glob("**/*.html", { cwd: outDir })) {
    htmlFiles.push(entry);
  }
  let touched = 0;
  await Promise.all(
    htmlFiles.map(async (rel) => {
      const route = routeFromHtmlPath(rel);
      const ctx = { site: opts.site, page: { route } };
      const objects = await collectSchemas(opts.schema?.modules ?? [], ctx);
      if (objects.length === 0) return;
      const script = renderSchemaScript(objects);
      const filePath = `${outDir}${rel}`;
      const html = await readFile(filePath, "utf-8");
      const injected = injectIntoHead(html, script);
      if (injected !== html) {
        await writeFile(filePath, injected, "utf-8");
        touched += 1;
      }
    }),
  );
  return touched;
}

async function renderAndInjectOg(opts: AstroMetaOptions, outDir: string): Promise<number> {
  if (!opts.og || opts.og.modules.length === 0) return 0;
  const htmlFiles: string[] = [];
  for await (const entry of glob("**/*.html", { cwd: outDir })) {
    htmlFiles.push(entry);
  }
  await mkdir(`${outDir}og`, { recursive: true });
  let written = 0;
  await Promise.all(
    htmlFiles.map(async (rel) => {
      const route = routeFromHtmlPath(rel);
      const matchingModules =
        opts.og?.modules.filter((m) => (m.match ? m.match(route) : true)) ?? [];
      if (matchingModules.length === 0) return;
      const firstModule = matchingModules[0];
      if (!firstModule) return;
      const png = await renderOg(firstModule, { site: opts.site, page: { route } });
      const slug = ogSlugForRoute(route);
      const pngPath = `${outDir}og/${slug}.png`;
      await mkdir(posixPath.dirname(pngPath), { recursive: true });
      await writeFile(pngPath, png);
      written += 1;
      const filePath = `${outDir}${rel}`;
      const html = await readFile(filePath, "utf-8");
      const ogUrl = `${opts.site.url}/og/${slug}.png`;
      const tag = `<meta property="og:image" content="${ogUrl}">`;
      await writeFile(filePath, injectIntoHead(html, tag), "utf-8");
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
  const htmlFiles: string[] = [];
  for await (const entry of glob("**/*.html", { cwd: outDir })) {
    htmlFiles.push(entry);
  }
  if (htmlFiles.length === 0) return null;
  const routes = await Promise.all(
    htmlFiles.map(async (rel) => {
      const route = routeFromHtmlPath(rel);
      const html = await readFile(`${outDir}${rel}`, "utf-8");
      return parseRoute(route, html);
    }),
  );
  const rules = opts.audit.rules ?? defaultRules;
  const report = runAudit(routes, rules);
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
