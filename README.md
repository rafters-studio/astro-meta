# @rafters/astro-meta

The xEO emission plane for Astro 6.

Astro 6 ships pages, server islands, and Actions. It does not ship a coherent emission contract for the artifacts every modern site is expected to produce: JSON-LD, llms.txt, robots.txt with the current AI-crawler matrix, sitemap with hreflang, per-page OG images, and a build-time check that the resulting HTML is actually readable by a crawler. This package is that contract, layered on Astro 6, with per-surface subpath exports and end-to-end Zod-typed inputs.

Not a framework. Not a monitoring SaaS. A contract for what every page emits so crawlers and LLMs can read it without guessing.

## Status

Pre-release. Designed against Astro 6. Not yet published to npm.

## Install

```bash
pnpm add @rafters/astro-meta
```

Astro re-exports its pinned Zod as `astro/zod`. Import `z` from there for module input schemas; no separate Zod install required.

Optional peers, installed only if the corresponding subpath is used:

```bash
pnpm add schema-dts         # typed Schema.org for /schema
pnpm add satori @resvg/resvg-js  # OG image rendering for /og
```

## Quickstart

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

That's the whole shape. Modules declare what they emit; the integration wires emissions into Astro's build.

## Concepts

### Surfaces

Six emission surfaces, one subpath export each:

| Surface     | Subpath                          | What it emits                                                 |
| ----------- | -------------------------------- | ------------------------------------------------------------- |
| Head        | `@rafters/astro-meta/schema`     | JSON-LD `<script>` tags injected into `<head>`                |
| Robots      | `@rafters/astro-meta/robots`     | `robots.txt` + Cloudflare `_headers` Content-Signals          |
| Sitemap     | `@rafters/astro-meta/sitemap`    | `sitemap.xml` + `sitemap-index` with hreflang                 |
| llms.txt    | `@rafters/astro-meta/llms-txt`   | `/llms.txt` and `/llms-full.txt`                              |
| OG image    | `@rafters/astro-meta/og`         | Per-route PNG via satori + resvg                              |
| Audit       | `@rafters/astro-meta/audit`      | Build-time GEO readability score per route, JSON report       |

Each subpath ships a typed module shape and a renderer. The integration at `/astro` registers and wires them.

### Modules

A module is a typed object with a hierarchical `key`, an optional Zod input schema, and a pure derivation function from validated input + context to the emitted artifact. The shape mirrors the loader/action shape in [`@rafters/astro-data`](https://github.com/rafters-studio/astro-data), kept narrow per surface.

### Hierarchical keys

Module keys are arrays. The build pipeline composes by prefix.

```
['article']                       all article schema modules
['article', 'blog']                blog-specific overrides
['article', 'blog', 'post-slug']   per-post overrides
```

The same shape governs sitemap segmentation, llms.txt sections, and audit scoping. The convention is identical to `@rafters/astro-data` so the two packages compose cleanly inside the same site.

### Cloudflare-specific emissions

`robots.contentSignals` emits a Cloudflare Pages `_headers` entry setting the `Content-Signals` policy header on every route. Other hosts ignore it; Cloudflare picks it up at deploy time.

## Composition

The package is the floor. Sibling packages in the rafters Astro 6 family compose on top.

### `@rafters/astro-data` -- runtime data plane

[`@rafters/astro-data`](https://github.com/rafters-studio/astro-data) is the read/write/cache/revalidate contract for runtime data. astro-meta is the build-time emission contract. A single content shape can feed both: the same Zod schema validates the loader input that hydrates an island and the schema module input that emits the JSON-LD.

### eavesdrop -- observation plane

[eavesdrop](https://github.com/rafters-studio/eavesdrop) is the discourse ingestion engine. Citation tracking, prompt-set monitoring, share-of-voice analytics, and any "did our content actually surface in ChatGPT/Perplexity/Google AI Overview last week" question lives there as a source adapter, not in this package. astro-meta makes the page legible; eavesdrop measures whether legibility translated into visibility.

### Independence

All three planes are independent. Adopt one, two, or all three. astro-meta does not require astro-data or eavesdrop; the reverse is also true.

## Public surface

See [`src/index.ts`](./src/index.ts) and each subpath module file for the full contract. Anything not exported there is internal and not subject to semver.

### Subpath exports

| Entry                            | Contents                                                       |
| -------------------------------- | -------------------------------------------------------------- |
| `@rafters/astro-meta`            | `SiteIdentity`, `PageContext`, `MetaContext`, `defineSite`, `z` |
| `@rafters/astro-meta/astro`      | `astroMeta(opts)` -- the Astro integration entry point         |
| `@rafters/astro-meta/schema`     | `SchemaModule`, `JsonLdObject`, `renderJsonLd`, `mergeGraph`   |
| `@rafters/astro-meta/llms-txt`   | `LlmsTxtEntry`, `LlmsTxtSource`, `buildLlmsTxt`                |
| `@rafters/astro-meta/robots`     | `RobotsConfig`, `ContentSignalsPolicy`, `aiCrawlers`, renderers |
| `@rafters/astro-meta/sitemap`    | `SitemapEntry`, `SitemapSource`, `renderSitemap`, `renderSitemapIndex` |
| `@rafters/astro-meta/og`         | `OgModule`, `SatoriElement`, `renderOg`                        |
| `@rafters/astro-meta/audit`      | `AuditRule`, `AuditRouteReport`, `AuditReport`, `runAudit`     |

## Why not Yoast / RankMath / a generic Astro SEO plugin?

The category sells "tick the SEO box" features as a single bundle. Almost every site needs only a subset: a marketing site wants robots + sitemap + OG; a docs site wants llms.txt + schema + audit; a blog wants all of the above; a Q&A site wants schema with FAQ types and the audit threshold-gated in CI. Bundling these forces a least-common-denominator API.

astro-meta inverts that: one subpath per surface, opt into the ones the site needs. The Astro integration is the meta-package that wires them together.

The package also explicitly addresses the artifacts the WordPress-era plugins do not: llms.txt and llms-full.txt for the new generation of crawlers, Cloudflare Pages Content-Signals header emission for crawler-policy expression, and a build-time GEO readability score that fails the build before a regression ships.

## Supply chain

This package publishes via [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC from GitHub Actions). No long-lived `NPM_TOKEN` exists anywhere. Every release ships with [npm provenance attestations](https://docs.npmjs.com/generating-provenance-statements). The release workflow is in [`.github/workflows/release.yml`](./.github/workflows/release.yml) and is the authoritative source.

If you see a version of this package on npm without provenance, do not install it. Open an issue.

The package has zero runtime dependencies. Peer dependencies (`astro`, optionally `satori`, `schema-dts`) are listed minimally; each is required only if its subpath is imported.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT
