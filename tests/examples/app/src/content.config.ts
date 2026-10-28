// A content collection, so the fixture build emits pages that no filesystem
// collector could find: they exist only after getStaticPaths runs.

import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const notes = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/notes" }),
  schema: z.object({ title: z.string(), modified: z.string().optional() }),
});

export const collections = { notes };
