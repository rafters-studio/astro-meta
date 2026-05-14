// Type declarations for the virtual module materialized at consumer build
// time by the integration's Vite plugin. Function-bearing module options
// (SchemaModule.schema, LlmsTxtSource.collect, etc.) are stripped during
// JSON.stringify; the middleware uses only serializable site identity from
// this module. Function-bearing options are consumed at build:done in the
// integration, not at request time.

declare module "virtual:astro-meta/config" {
  export const config: unknown;
}
