// Type declarations for the virtual module materialized at consumer build
// time by the integration's Vite plugin. The module carries the configured
// SiteIdentity (all primitives, JSON-safe) so .astro components can default
// their `site` prop without consumers having to pass it from every layout.
//
// The serializer in src/astro.ts produces the body via JSON.stringify(opts.site).
// If SiteIdentity ever grows non-JSON-safe fields, the serializer must change
// in lockstep.

declare module "virtual:astro-meta/site" {
  import type { SiteIdentity } from "../index.js";
  export const site: SiteIdentity;
}
