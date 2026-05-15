# Contributing to @rafters/astro-meta

Issues and PRs welcome.

## Setup

```bash
pnpm install
```

## Test surfaces

- `pnpm test` -- unit tests (`tests/**/*.test.ts`)
- `pnpm test:spec` -- behavior tests (`tests/**/*.spec.ts`) via Vitest Browser Mode with Playwright
- `pnpm test:all` -- both

Use `.test.ts` for pure logic (rendering, schema shape, audit scoring, type-level checks). Use `.spec.ts` for behavior in a real browser (audit DOM parsing, OG render comparisons).

## Quality gates

- `pnpm typecheck` -- `tsc --noEmit`
- `pnpm lint` -- `oxlint`
- `pnpm format:check` -- `oxfmt --check`

`lefthook` runs the relevant subset on `pre-commit` and the full `pnpm test:all` on `pre-push`.

## Releasing

```bash
# bump version in package.json and write a CHANGELOG entry for the new version
git commit -am "release vX.Y.Z"
git push
# after the release commit lands on main:
git tag vX.Y.Z
git push origin vX.Y.Z
```

The tag triggers `.github/workflows/release.yml`, which builds and runs `npm publish --access=public --provenance`.

No long-lived `NPM_TOKEN` exists in this repo. Releases are minted per-publish via GitHub Actions OIDC. Provenance attestations ship on every release.

## Scope

### What belongs in this package

- The emission contract for xEO artifacts on top of Astro 6
- Per-surface module shapes: schema (JSON-LD), llms-txt, robots, sitemap, OG, audit
- The Astro integration that wires registered modules into the build pipeline
- The curated AI-crawler matrix and Content-Signals policy emission

### What does NOT belong

- Data loaders, mutations, cache, revalidation -- compose with [@rafters/astro-data](https://github.com/rafters-studio/astro-data)
- Content authoring UI -- compose with [kelex](https://github.com/rafters-studio/kelex) for schema-generated forms
- Local-first sync -- compose with [smugglr](https://smugglr.dev)
- Specific framework opinions beyond Astro

The package is a contract. Keep it small.
