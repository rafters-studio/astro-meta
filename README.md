# @rafters/astro-meta

Build-time artifacts for crawlers and LLMs. Astro 6 edition.

Astro 6 ships pages, server islands, and Actions. It does not ship a coherent emission contract for the artifacts every site deploying in 2026 is expected to produce: JSON-LD, `llms.txt`, `robots.txt` with a maintained AI-crawler matrix, sitemap with hreflang, per-page OG images, and a build-time check that the resulting HTML is actually legible to a crawler. This package is that contract.

Not a plugin bundle. One subpath per artifact, opt into what the site actually needs.

The integration at `/astro` wires them together.

## Status.

Pre-release. Designed against Astro 6.1.9+. Not yet published to npm. Trusted publishing via GitHub Actions OIDC; every release ships npm provenance attestations. If you see a version of this package on npm without provenance, do not install it.

The integration runs only at `astro:config:setup` (validation + warnings) and `astro:build:done` (file emissions). No request-time middleware. SSG and SSR consumers behave identically.

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

Declare a shared site identity and import it in both the config and the layout:

```ts
// src/site.ts
import { defineSite } from "@rafters/astro-meta";

export const site = defineSite({
  url: "https://example.com",
  name: "Example",
  description: "Example marketing site",
  locale: "en-US",
});
```

Register the integration in `astro.config.mjs`:

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import { astroMeta } from "@rafters/astro-meta/astro";
import { site } from "./src/site.js";

export default defineConfig({
  site: "https://example.com",
  integrations: [
    astroMeta({
      site,
      robots: {
        rules: [{ userAgent: "*", allow: ["/"] }],
        contentSignals: { search: "yes", aiInput: "yes", aiTrain: "no" },
      },
    }),
  ],
});
```

The `site` option is the only required field. `robots`, `sitemap`, `llmsTxt`, `og`, and `audit` are independent opt-ins; configure only the surfaces this site actually emits.

Compose head tags in a layout using the three components the package ships:

```astro
---
// src/layouts/Base.astro
import SiteMeta from "@rafters/astro-meta/components/SiteMeta.astro";
import SchemaScript from "@rafters/astro-meta/components/SchemaScript.astro";
import OgImage from "@rafters/astro-meta/components/OgImage.astro";
import { mergeGraph } from "@rafters/astro-meta/schema";
import { defineEntities } from "@rafters/astro-meta/entities";
import { site } from "../site.js";

export interface Props {
  pageTitle?: string;
  pageDescription?: string;
}

const { pageTitle, pageDescription } = Astro.props;

const entities = defineEntities({
  organization: { "@id": `${site.url}#org`, name: site.name, url: site.url },
});

const orgGraph = await entities.schema({ ctx: { site } });
const graph = mergeGraph([
  ...(Array.isArray(orgGraph) ? orgGraph : [orgGraph]),
  {
    "@type": "WebSite",
    "@id": `${site.url}#website`,
    url: site.url,
    name: site.name,
    description: site.description ?? "",
    publisher: { "@id": `${site.url}#org` },
  },
]);
---
<head>
  <SiteMeta site={site} title={pageTitle} description={pageDescription} />
  <SchemaScript graph={graph} />
  <OgImage site={site} />
</head>
```

The integration writes file artifacts at `build:done`. Head tags are the layout's responsibility, composed with `SiteMeta`, `SchemaScript`, and `OgImage`. That is the whole shape.

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

## Concepts.

### Surfaces.

Five file-emission surfaces, three head-composition components, two type/helper subpaths, the root entry, and the integration:

| Surface    | Subpath                            | What it emits                                                                                                                                                                                    |
| ---------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entry      | `@rafters/astro-meta`              | `SiteIdentity`, `PageContext`, `MetaContext`, `defineSite`, `z`                                                                                                                                  |
| Components | `@rafters/astro-meta/components/*` | `SiteMeta.astro`, `SchemaScript.astro`, `OgImage.astro`; drop into a layout `<head>` for canonical, OG, Twitter card, and JSON-LD tags                                                           |
| Schema     | `@rafters/astro-meta/schema`       | JSON-LD primitives (`renderJsonLd`, `mergeGraph`) plus `SchemaScript` for layout composition; no HTML mutation                                                                                   |
| Entities   | `@rafters/astro-meta/entities`     | Organization + Person with sameAs, knowsAbout, founder, employee; validates sameAs URLs (https required, must parse); enforces @id uniqueness; warns on employee/worksFor reciprocity mismatches |
| llms.txt   | `@rafters/astro-meta/llms-txt`     | `/llms.txt` and `/llms-full.txt`; auto-mirrors robots wildcard disallow so the two artifacts cannot drift                                                                                        |
| Robots     | `@rafters/astro-meta/robots`       | `robots.txt` with curated AI-crawler matrix + Cloudflare `_headers` Content-Signals                                                                                                              |
| Sitemap    | `@rafters/astro-meta/sitemap`      | `sitemap.xml` + `sitemap-index` chunked at the 50,000-URL protocol cap, with hreflang alternates                                                                                                 |
| OG         | `@rafters/astro-meta/og`           | Per-route PNG via satori + @resvg/resvg-js (optional peers, dynamic-imported); 1200x630 default                                                                                                  |
| Audit      | `@rafters/astro-meta/audit`        | Build-time GEO readability score per route via linkedom DOM parse; optional CI threshold gate                                                                                                    |
| Astro      | `@rafters/astro-meta/astro`        | `astroMeta(opts)`: the integration entry point that wires all file-emission surfaces                                                                                                             |

The integration writes file artifacts only. It never reads or mutates generated HTML. Head tags are consumer-owned; the three components are the composition surface.

### Modules.

The file-emission surfaces take typed inputs in the integration options. `sitemap.sources`, `llmsTxt.sources`, and `og.modules` each take an array of typed objects with a hierarchical `key` and a derivation function from context to the emitted artifact. `audit.rules` takes an array of typed rule objects with a per-route check function. The four arrays are the integration's only registration surface.

Schema composition is consumer-side in the layout using `mergeGraph` and `<SchemaScript>`; the integration accepts no `schema` option because the script tag belongs in the layout, not in post-build output.

### Hierarchical keys.

Module keys are arrays. The build pipeline composes by prefix:

```
['docs']                    all docs llms-txt entries
['docs', 'api']             API reference section
['docs', 'api', 'get-org']  per-page override
```

The same convention governs sitemap segmentation, llms.txt sections, and audit scoping. It matches the `@rafters/astro-data` key convention so the two packages compose cleanly inside the same site.

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

### `@rafters/astro-data`: loaders and actions.

[`@rafters/astro-data`](https://github.com/rafters-studio/astro-data) is the read/write/cache/revalidate contract for runtime data: loaders, actions, hierarchical cache, revalidation. astro-meta is the build-time emission contract. A single content collection can feed both: the same entry that hydrates an island via `astro-data` is the entry the layout passes to `mergeGraph` and `<SchemaScript>` to emit the JSON-LD. The two packages share the hierarchical key convention so module organization stays consistent across the build and runtime sides.

### Independence.

The two packages are independent. astro-meta does not require astro-data; the reverse is also true.

## Public surface.

See [`src/index.ts`](./src/index.ts) and each subpath module file for the full contract. Anything not exported there is internal and not subject to semver.

### Subpath exports.

| Entry                                               | Contents                                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `@rafters/astro-meta`                               | `SiteIdentity`, `PageContext`, `MetaContext`, `defineSite`, `z`                                      |
| `@rafters/astro-meta/astro`                         | `astroMeta(opts)`: the Astro integration entry point                                                 |
| `@rafters/astro-meta/components/SiteMeta.astro`     | Props: `site`, optional `route?`, `title?`, `description?`; emits canonical + OG core + Twitter card |
| `@rafters/astro-meta/components/SchemaScript.astro` | Props: `graph: JsonLdObject \| JsonLdObject[]`; emits one `<script type="application/ld+json">`      |
| `@rafters/astro-meta/components/OgImage.astro`      | Props: `site`, optional `route?`, `width?`, `height?`, `alt?`; emits `og:image` meta tags            |
| `@rafters/astro-meta/schema`                        | `JsonLdObject`, `renderJsonLd`, `mergeGraph`, `SchemaModule`, `collectSchemas`                       |
| `@rafters/astro-meta/entities`                      | `defineEntities`, `OrganizationEntity`, `PersonEntity`                                               |
| `@rafters/astro-meta/llms-txt`                      | `LlmsTxtEntry`, `LlmsTxtSource`, `buildLlmsTxt`                                                      |
| `@rafters/astro-meta/robots`                        | `RobotsConfig`, `ContentSignalsPolicy`, `aiCrawlers`, renderers                                      |
| `@rafters/astro-meta/sitemap`                       | `SitemapEntry`, `SitemapSource`, `renderSitemap`, `renderSitemapIndex`                               |
| `@rafters/astro-meta/og`                            | `OgModule`, `SatoriElement`, `renderOg`                                                              |
| `@rafters/astro-meta/audit`                         | `AuditRule`, `AuditRouteReport`, `AuditReport`, `runAudit`                                           |

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
