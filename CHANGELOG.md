# @rafters/astro-meta

## 0.4.0

Consumer-reported correctness across three surfaces, plus the first CI that actually exercises Astro. Every item here was found dogfooding the package on the rafters-studio sites rather than by reading the code.

The headline for anyone upgrading: `peerDependencies.astro` widens to `^6.0.0 || ^7.0.0`. Astro 7 was already the current major and this package formally excluded it, which nothing in CI would have caught, because the entire suite tests pure functions that never import `astro`.

- `llmsTxt.onNonMarkdownBody` enforces the markdown contract that `LlmsTxtEntry.body` always documented. A consumer feeding page source instead of rendered content publishes component tags to every crawler, and the build said nothing: smugglr.dev's homepage entry was literally `<SiteHeader /> <VoiceHero /> <MrsBlock />`, zero content, shipped to everyone reading the artifact. Bodies are now sniffed per entry and routed through `"warn"` (default, report and emit anyway), `"error"` (throw at `build:done` naming every failing entry rather than the first), or `"drop"` (omit the body, keep the entry in the index). `buildLlmsTxt` returns `nonMarkdownBodies` alongside `index` and `full`. The sniff is a heuristic that masks fenced code blocks and inline code spans first, because a page documenting a component is the likeliest false positive and JSX inside a fence is documentation, not a defect.
- `SitemapSource.collect()` now accepts site-relative URLs, matching `LlmsTxtSource`. The two present the same authoring surface and did not accept the same inputs: llms-txt resolved `/path/`, sitemap threw at `build:done`, so the same map function worked for one and failed for the other. Both resolve through one helper now, since storing the rule twice is how they drifted apart. Sitemap deduplication happens after resolution, so `/a` and its own absolute form collapse to one entry instead of emitting a duplicate. Additive: absolute URLs behave exactly as before.
- Source `collect()` failures are legible. `astro:content` is unreachable from a source module, because source modules are imported by `astro.config.*`, which Node's ESM loader evaluates outside Vite's module graph. This is not a hook-timing problem: measured at `config:setup`, `build:setup`, `build:generated`, and `build:done`, all four fail identically. That case is now rewritten into a message naming the cause and the working alternative instead of Node's raw `Received protocol 'astro:'`; every other failure keeps its own message with the source key prefixed. The README's source example is replaced with the filesystem pattern that actually works.
- `SiteMetaOptions` and `SiteMeta`'s props accept explicit `undefined` on every optional field. Astro's own strict tsconfig enables `exactOptionalPropertyTypes`, under which `title?: string` accepts an absent property but rejects an explicitly undefined one, so a layout forwarding its own optional prop -- the pattern this README documents in its quickstart -- did not compile. Found by running `astro check` on the example app for the first time.
- CI builds the example app against Astro 6 and 7 and asserts the emitted artifacts have the right content, not merely that the build exits zero. A source pipeline that silently stopped running still writes a well-formed, empty `<urlset>`. A floating `latest` leg runs non-blocking so the next major surfaces early.

## 0.3.0

Content-signals correctness and enforcement. Found dogfooding the package across the rafters-studio sites: the emitted policy was a soft hint with two real bugs, and a single malformed page could silently drop the sitemap. There is no finished standard here (Cloudflare's Content Signals draft has expired; the IETF AIPREF drafts are not yet RFCs), so this release implements the production-deployed Cloudflare `Content-Signal` form correctly, labels it honestly, and makes enforcement a configured choice rather than an opinion.

Breaking: `RobotsConfig.contentSignals` is now a `ContentSignalsConfig` object (`{ policy, vocabulary?, emit?, preamble?, enforce?, crawlers? }`) rather than a bare policy. A bare policy moves under `contentSignals.policy`.

- The content-signal directive is now emitted inside robots.txt (in the wildcard group), not only in the Cloudflare `_headers` file, and the header field is the spec-correct singular `Content-Signal:` rather than the prior non-conformant plural `Content-Signals:`. An optional canonical preamble (the "condition of accessing this website" block with the EU Directive 2019/790 Article 4 reservation) is emitted by default.
- The curated AI-crawler matrix is now categorized (training, training-control, ai-input, unsplittable, link-preview) and drives a configurable `enforce` setting: `"declarative"` (default, signals only, no behavior change on upgrade), `"block-training"` (Disallow the crawlers each restrictive signal governs, with retrieval and link-preview crawlers left allowed), and `"block-all"` (the blunt Cloudflare-style instrument). Per-crawler overrides via `contentSignals.crawlers`.
- A `vocabulary` switch selects the Cloudflare `Content-Signal` form (default) or the draft IETF AIPREF `Content-Usage` form behind an explicit "unstable" label.
- robots.txt rendering now merges rules per user-agent per RFC 9309 (no duplicate `User-agent: *` groups), preserves path case, and validates against newline injection in agent and path values.
- Sitemap files now split on the 50MB uncompressed byte limit as well as the 50,000-URL limit (`sitemap.maxBytes` / `sitemap.maxUrls`), measuring rendered UTF-8 size. The prior `sitemap.chunkSize` option remains supported as an alias for `maxUrls`, so existing configs do not break.
- The `build:done` hook now builds every artifact body before writing any file, so a throwing sitemap or llms source aborts atomically instead of leaving robots.txt written with no sitemap.xml.
- `isAbsoluteUrl` validates through the URL parser instead of a permissive regex.

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
