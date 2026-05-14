# @rafters/astro-meta example app

Minimum Astro 6 app showing the integration in use.

## Run

```bash
pnpm install
pnpm --filter @rafters/astro-meta-example-app build
```

After `astro build`, the output at `dist/` contains:

- `dist/robots.txt` -- emitted on `astro:build:done`
- `dist/sitemap.xml` -- emitted on `astro:build:done`
- `dist/index.html` and `dist/about/index.html` -- each with site-level meta injected into `<head>`

View the HTML source of any route to see the injected canonical, OG, and Twitter card tags.

## Configure

The integration registration lives in [`astro.config.mjs`](./astro.config.mjs). Only the `site` option is required; every other surface (schema, llms-txt, robots rules, sitemap, og, audit) is opt-in via its own option.
