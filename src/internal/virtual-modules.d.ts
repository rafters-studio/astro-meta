// Type declarations for virtual modules materialized at consumer build time
// by the integration's Vite plugin. Their actual content is generated from
// AstroMetaOptions at config:setup; here we declare the shape so tsc resolves.

declare module "virtual:astro-meta/config" {
  export const config: unknown;
}
