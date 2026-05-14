// Type declarations for the virtual module materialized at consumer build
// time by the integration's Vite plugin.
//
// Only JSON-serializable options can cross the JSON.stringify boundary that
// produces the module body. Function-bearing options (SchemaModule.schema,
// LlmsTxtSource.collect, OgModule.template, AuditRule.check) are consumed
// by integration code at astro:config:setup / astro:build:done, not in the
// middleware that imports this module. If the middleware ever needs a new
// surface, the serializer in src/astro.ts and this declaration must move
// in lockstep.

declare module "virtual:astro-meta/config" {
  import type { SiteIdentity } from "../index.js";
  export const config: { site: SiteIdentity };
}
