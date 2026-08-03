// Assert the built artifacts have the CONTENT they are supposed to have.
//
// This is the discriminating check in the Astro version matrix. The unit suite
// tests pure functions that never import astro, so it passes identically on
// every Astro major and proves nothing about integration compatibility. What
// can actually break across majors is the integration's contact with Astro's
// hook API: whether astro:config:setup still hands us the same shape, whether
// astro:build:done still reports the output directory, whether the virtual
// module still injects.
//
// Existence checks would not catch a regression there. A broken source pipeline
// still writes robots.txt and still writes a well-formed but EMPTY <urlset>.
// So every assertion below looks at content that only appears if the pipeline
// actually ran end to end.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const DIST = join(import.meta.dirname, "dist");

const failures = [];

async function check(file, label, predicate) {
  let text;
  try {
    text = await readFile(join(DIST, file), "utf8");
  } catch (error) {
    failures.push(`${file}: unreadable (${error.code ?? error.message})`);
    return;
  }
  if (!predicate(text)) failures.push(`${file}: ${label}`);
}

await check("robots.txt", "missing the Sitemap: line", (t) => t.includes("Sitemap: https://"));
await check("robots.txt", "missing the Content-Signal directive", (t) =>
  t.includes("Content-Signal:"),
);

// The empty-urlset trap: a sitemap with no sources still renders valid XML.
await check("sitemap.xml", "contains no <loc>, so no source produced entries", (t) =>
  t.includes("<loc>https://example.com/</loc>"),
);
await check("sitemap.xml", "lost per-entry metadata (changefreq/priority)", (t) =>
  t.includes("<changefreq>weekly</changefreq>"),
);

await check("llms.txt", "missing the site header", (t) => t.includes("# astro-meta example"));
await check("llms.txt", "missing the section grouping", (t) => t.includes("## Pages"));
await check("llms.txt", "missing a resolved absolute entry URL", (t) =>
  t.includes("(https://example.com/about/)"),
);

// llms-full.txt is emitted only when entries carry bodies, and the config runs
// onNonMarkdownBody: "error", so reaching this point at all means the contract
// check passed on real content.
await check("llms-full.txt", "missing the entry body", (t) => t.includes("This body is markdown"));

await check("_headers", "missing the Content-Signal header", (t) => t.includes("Content-Signal:"));

// Head composition is the consumer-side half: SiteMeta and SchemaScript render
// into the page rather than being written as files, so a break there is
// invisible to every file assertion above.
await check("index.html", "missing canonical link", (t) => t.includes('rel="canonical"'));
await check("index.html", "missing OG tags", (t) => t.includes('property="og:title"'));
await check("index.html", "missing JSON-LD", (t) => t.includes('type="application/ld+json"'));

if (failures.length > 0) {
  console.error(`artifact verification failed (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`artifact verification passed on astro ${process.env.ASTRO_VERSION ?? "(default)"}`);
