# @rafters/astro-meta

## 0.2.0

Head-component fidelity, so a site that already hand-rolls a good head can adopt the components without losing anything. Found dogfooding the package on runlegion.dev (#45): the generic head could not express article OG type, a social image, or per-page Schema.org nodes, so `SiteMeta` would have regressed an existing head.

- `SiteMeta` gains `ogType` ("website" or "article"), `publishedTime`, `modifiedTime`, and `image`. `og:type` is configurable; article pages emit `article:published_time` and `article:modified_time`; `image` emits `og:image` and `twitter:image` (absolute, or site-relative resolved against `site.url`) independent of the `/og` generation surface. The component now renders through the pure `renderSiteMeta`, so the component and its unit tests share one implementation instead of two parallel ones.
- `/schema` gains typed builders `softwareApplication`, `article` (Article, TechArticle, or BlogPosting), and `breadcrumbList`. They return plain `JsonLdObject`s that compose with `mergeGraph` like `defineEntities`, closing the gap where per-page nodes had to be hand-written as raw objects.

## 0.1.2

Workflow fix. No API changes; `0.1.1` was tagged but did not publish to npm because the release workflow ran on Node 22, and the OIDC + provenance handshake against the npm registry requires Node 24. Bumped both workflows to `24.12` to match the rafters and mail packages. `0.1.2` is the first release that actually ships to npm with provenance.

## 0.1.1

README catchup. No code changes.

- Status section reflects that `0.1.0` is live on npm; lifecycle paragraph mentions `injectTypes` for the virtual module.
- Quickstart Layout example notes that `virtual:astro-meta/site` is typed via Astro's `injectTypes`, so consumer `astro check` resolves the import without a `vite-env.d.ts` declaration or triple-slash directive.
- Supply chain section reconciles the provenance claim with bootstrap reality: `0.1.0` was published manually to claim the package name; `0.1.1` is the first release through trusted publishing with provenance attestation.

## 0.1.0

First public release.

Build-time artifacts for crawlers and LLMs on Astro 6: JSON-LD, llms.txt,
robots, sitemap, OG images, and build-time GEO readability scoring.
Per-surface subpath exports. Composes with `@rafters/astro-data` for runtime
data. `virtual:astro-meta/site` typed module so consumers get strict
typecheck on the configured site shape.

## 0.0.0

Initial scaffold. Build-time artifacts for crawlers and LLMs on Astro 6:
JSON-LD, llms.txt, robots, sitemap, OG images, and build-time GEO readability
scoring. Per-surface subpath exports. Composes with `@rafters/astro-data` for
runtime data.
