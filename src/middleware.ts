// @rafters/astro-meta — Astro middleware
//
// Loaded by the integration via addMiddleware. Reads the virtual config module
// produced by the integration's Vite plugin and injects site-level head meta
// into every HTML response.

import type { MiddlewareHandler } from "astro";
import { config } from "virtual:astro-meta/config";
import { injectIntoHead, renderSiteMeta } from "./internal/render-site-meta.js";
import type { AstroMetaOptions } from "./astro.js";

const opts = config as AstroMetaOptions;

export const onRequest: MiddlewareHandler = async (context, next) => {
  const response = await next();
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const meta = renderSiteMeta(opts.site, context.url.pathname);
  const injected = injectIntoHead(html, meta);

  const headers = new Headers(response.headers);
  headers.set("content-length", String(new TextEncoder().encode(injected).byteLength));

  return new Response(injected, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
