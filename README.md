# @rafters/astro-meta

Build-time artifacts for crawlers and LLMs. Astro 6 edition.

Astro 6 ships pages, server islands, and Actions. It does not ship a coherent emission contract for the artifacts every site deploying in 2025 is expected to produce: JSON-LD, `llms.txt`, `robots.txt` with a maintained AI-crawler matrix, sitemap with hreflang, per-page OG images, and a build-time check that the resulting HTML is actually legible to a crawler. This package is that contract.

Not a plugin bundle. One subpath per artifact, opt into what the site actually needs.

The integration at `/astro` wires them together.

## Status.

Pre-release. Designed against Astro 6.1.9+. Not yet published to npm. Trusted publishing via GitHub Actions OIDC; every release ships npm provenance attestations. If you see a version of this package on npm without provenance, do not install it.

> v0.1 limitation: schema modules (the `/schema` subpath) work in SSG builds. Function references do not cross the Vite middleware boundary cleanly in server-rendered builds. The other seven subpaths have no SSG/SSR restriction.

## Install.

```bash
pnpm add @rafters/astro-meta
```

Astro re-exports its pinned Zod as `astro/zod`. Import `z` from there for module input schemas; no separate Zod install required.

Optional peers, surface-scoped:

```bash
pnpm add schema-dts              # typed Schema.org helpers, /schema subpath
pnpm add satori @resvg/resvg-js  # OG image rendering, /og subpath
pnpm add linkedom                # build-time DOM parse, /audit subpath
```

Install only what the site uses. `satori` and `@resvg/resvg-js` are dynamic-imported; they are never bundled unless the `/og` subpath is active.

## Quickstart.

Configure the site identity and opt into surfaces in `astro.config.mjs`:

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import { astroMeta } from "@rafters/astro-meta/astro";
import { defineSite } from "@rafters/astro-meta";
import * as articleSchema from "./src/meta/article-schema";
import * as docsLlms from "./src/meta/docs-llms";

export default defineConfig({
  integrations: [
    astroMeta({
      site: defineSite({
        url: "https://example.com",
        name: "Example",
        description: "Example marketing site",
      }),
      schema: { modules: [articleSchema] },
      llmsTxt: { sources: [docsLlms], full: true },
      robots: {
        rules: [{ userAgent: "*", allow: ["/"] }],
        sitemap: "https://example.com/sitemap.xml",
        contentSignals: { search: "yes", aiInput: "yes", aiTrain: "no" },
      },
    }),
  ],
});
```

Declare a schema module:

```ts
// src/meta/article-schema.ts
import { z } from "astro/zod";
import type { MetaContext } from "@rafters/astro-meta";
import type { JsonLdObject } from "@rafters/astro-meta/schema";

export const key = ["article"] as const;
export const schemaInput = z.object({
  title: z.string(),
  author: z.string(),
  datePublished: z.string(),
});

export function schema({
  input,
  ctx,
}: {
  input: z.infer<typeof schemaInput>;
  ctx: MetaContext;
}): JsonLdObject {
  return {
    "@type": "Article",
    headline: input.title,
    author: { "@type": "Person", name: input.author },
    datePublished: input.datePublished,
    url: ctx.site.url + (ctx.page?.route ?? ""),
  };
}
```

Declare an llms.txt source:

```ts
// src/meta/docs-llms.ts
import { getCollection } from "astro:content";
import type { LlmsTxtSource } from "@rafters/astro-meta/llms-txt";

export const key = ["docs"] as const;

export async function collect() {
  const entries = await getCollection("docs");
  return entries.map((entry) => ({
    title: entry.data.title,
    url: `/docs/${entry.slug}`,
    summary: entry.data.description,
    body: entry.body,
    section: "Docs",
  }));
}
```

Modules declare what they emit. The integration wires emissions into Astro's build. That is the whole shape.

## Concepts.

### Surfaces.

Seven emission surfaces, one subpath export each, plus the root entry and the integration:

| Surface  | Subpath                        | What it emits                                                                                                                                                                                    |
| -------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entry    | `@rafters/astro-meta`          | `SiteIdentity`, `PageContext`, `MetaContext`, `defineSite`, `z`                                                                                                                                  |
| Schema   | `@rafters/astro-meta/schema`   | JSON-LD `@graph` merged and injected into `<head>` via post-build HTML mutation                                                                                                                  |
| Entities | `@rafters/astro-meta/entities` | Organization + Person with sameAs, knowsAbout, founder, employee; validates sameAs URLs (https required, must parse); enforces @id uniqueness; warns on employee/worksFor reciprocity mismatches |
| llms.txt | `@rafters/astro-meta/llms-txt` | `/llms.txt` and `/llms-full.txt`; auto-mirrors robots wildcard disallow so the two artifacts cannot drift                                                                                        |
| Robots   | `@rafters/astro-meta/robots`   | `robots.txt` with curated AI-crawler matrix + Cloudflare `_headers` Content-Signals                                                                                                              |
| Sitemap  | `@rafters/astro-meta/sitemap`  | `sitemap.xml` + `sitemap-index` chunked at the 50,000-URL protocol cap, with hreflang alternates                                                                                                 |
| OG       | `@rafters/astro-meta/og`       | Per-route PNG via satori + @resvg/resvg-js (optional peers, dynamic-imported); 1200x630 default                                                                                                  |
| Audit    | `@rafters/astro-meta/audit`    | Build-time GEO readability score per route via linkedom DOM parse; optional CI threshold gate                                                                                                    |
| Astro    | `@rafters/astro-meta/astro`    | `astroMeta(opts)`: the integration entry point that registers and wires all surfaces                                                                                                             |

Each subpath ships a typed module shape and a renderer. The integration at `/astro` is the meta-package; it registers surfaces, but the surfaces are independently importable.

### Modules.

A module is a typed object with a hierarchical `key`, an optional Zod input schema, and a pure derivation function from validated input plus context to the emitted artifact. The shape mirrors the loader and action shape in [`@rafters/astro-data`](https://github.com/rafters-studio/astro-data), kept narrow per surface so one Zod schema can feed both packages without translation.

### Hierarchical keys.

Module keys are arrays. The build pipeline composes by prefix:

```
['article']                        all article schema modules
['article', 'blog']                blog-specific overrides
['article', 'blog', 'post-slug']   per-post overrides
```

The same convention governs sitemap segmentation, llms.txt sections, and audit scoping. It is identical to the `@rafters/astro-data` key convention so the two packages compose cleanly inside the same site.

### Cloudflare emissions.

`robots.contentSignals` emits a Cloudflare Pages `_headers` entry setting the `Content-Signals` policy header on every route:

```
Content-Signals: search=yes, ai-input=yes, ai-train=no
```

This is a crawler-policy expression that survives the deploy boundary. Other hosts ignore the `_headers` file; Cloudflare picks it up at deploy time. The configuration lives in `robots`, not in a separate surface, because the `_headers` disallow matrix must stay in sync with `robots.txt`; two separate configs drift.

### The robots crawler matrix.

The `/robots` subpath ships a curated, maintained list: GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, Bytespider, CCBot, and the other major AI training and inference crawlers. Unknown agents passed to the config emit a build warning. Typos in agent names do not silently produce a `robots.txt` that allows everything.

### The audit rubric.

The `/audit` subpath scores each route on five rules summing to 100:

| Rule             | Weight | Condition                                                                          |
| ---------------- | ------ | ---------------------------------------------------------------------------------- |
| Renderability    | 40     | `<body>` has visible text; warn under 200 bytes, fail when empty                   |
| JSON-LD          | 20     | at least one `<script type="application/ld+json">` that parses                     |
| Single H1        | 15     | exactly one `<h1>`; warn on multiple, fail on none                                 |
| Canonical        | 15     | `<link rel="canonical">` with an absolute http(s) href                             |
| Meta description | 10     | `<meta name="description">` present; warn outside the 70-160 character SERP window |

Each rule emits pass, warn, or fail. The CI threshold gate fails the build when the score for any route falls below the configured minimum. Set it to 0 to collect the report without blocking. Set it to 85 to enforce a real floor.

## Composition.

Three sibling packages. Each does one thing.

### `@rafters/astro-data`: loaders and actions.

[`@rafters/astro-data`](https://github.com/rafters-studio/astro-data) is the read/write/cache/revalidate contract for runtime data: loaders, actions, hierarchical cache, revalidation. astro-meta is the build-time emission contract. A single content shape can feed both. The same Zod schema validates the loader input that hydrates an island and the schema module input that emits the JSON-LD for that page. The two packages share the hierarchical key convention intentionally.

### eavesdrop: discourse ingestion and citation tracking.

[eavesdrop](https://github.com/rafters-studio/eavesdrop) is the discourse ingestion and semantic search engine. Citation tracking, "did our content surface in ChatGPT or Perplexity last week," and share-of-voice analytics live there as source adapters. astro-meta makes the page legible. eavesdrop measures whether legibility translated into visibility. The two packages do not call each other.

### Independence.

All three packages are independent. Adopt one, two, or all three. astro-meta does not require astro-data or eavesdrop; the reverse is also true.

## Public surface.

See [`src/index.ts`](./src/index.ts) and each subpath module file for the full contract. Anything not exported there is internal and not subject to semver.

### Subpath exports.

| Entry                          | Contents                                                               |
| ------------------------------ | ---------------------------------------------------------------------- |
| `@rafters/astro-meta`          | `SiteIdentity`, `PageContext`, `MetaContext`, `defineSite`, `z`        |
| `@rafters/astro-meta/astro`    | `astroMeta(opts)`: the Astro integration entry point                   |
| `@rafters/astro-meta/schema`   | `SchemaModule`, `JsonLdObject`, `renderJsonLd`, `mergeGraph`           |
| `@rafters/astro-meta/entities` | `defineEntities`, `OrganizationEntity`, `PersonEntity`                 |
| `@rafters/astro-meta/llms-txt` | `LlmsTxtEntry`, `LlmsTxtSource`, `buildLlmsTxt`                        |
| `@rafters/astro-meta/robots`   | `RobotsConfig`, `ContentSignalsPolicy`, `aiCrawlers`, renderers        |
| `@rafters/astro-meta/sitemap`  | `SitemapEntry`, `SitemapSource`, `renderSitemap`, `renderSitemapIndex` |
| `@rafters/astro-meta/og`       | `OgModule`, `SatoriElement`, `renderOg`                                |
| `@rafters/astro-meta/audit`    | `AuditRule`, `AuditRouteReport`, `AuditReport`, `runAudit`             |

## Why not Yoast.

Yoast, RankMath, and AIOSEO sell "tick the SEO box" as a single bundle. The architecture assumes a CMS: WordPress stores pages, the plugin wraps them. Astro is not a CMS. The bundled-plugin model produces a least-common-denominator API that forces every site to carry surfaces it does not use.

astro-meta inverts the bundling. A marketing site opts into robots, sitemap, and OG. A docs site opts into llms.txt, schema, and audit. A blog opts into all of them. Each surface is independently imported, independently typed, independently testable.

The category also has gaps none of the WordPress-era tools close. Nobody ships a maintained AI-crawler matrix as a typed primitive; most sites copy a robots.txt from a blog post and hope the agent names are still correct. Nobody ships llms.txt generation for marketing sites; Mintlify owns it for docs, nobody owns it for the rest. Nobody ships Cloudflare Pages Content-Signals header emission as a build artifact. Nobody ships a build-hook GEO audit that fails the deploy before a regression reaches production; pagesmith.ai ships a Chrome extension, which is the wrong boundary.

Not a monitoring SaaS. Not a framework. A typed contract at the build boundary that the sites you already know how to write can consume one surface at a time.

## Supply chain.

This package publishes via [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) with OIDC from GitHub Actions. No long-lived `NPM_TOKEN` exists anywhere in the release pipeline. Every release ships with [npm provenance attestations](https://docs.npmjs.com/generating-provenance-statements). The release workflow is in [`.github/workflows/release.yml`](./.github/workflows/release.yml) and is the authoritative source.

If you see a version of this package on npm without provenance, do not install it. Open an issue.

Zero runtime dependencies. Peer dependencies (`astro`, optionally `satori`, `@resvg/resvg-js`, `linkedom`, `schema-dts`) are listed minimally; each is required only if its subpath is imported.

## Contributing.

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License.

MIT
