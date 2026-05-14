import type { SchemaModule } from "@rafters/astro-meta/schema";

export const siteSchema: SchemaModule = {
  key: ["site", "organization"],
  schema: ({ ctx }) => [
    {
      "@type": "Organization",
      "@id": `${ctx.site.url}#org`,
      name: ctx.site.name,
      url: ctx.site.url,
    },
    {
      "@type": "WebSite",
      url: ctx.site.url,
      name: ctx.site.name,
      ...(ctx.site.description ? { description: ctx.site.description } : {}),
    },
  ],
};
