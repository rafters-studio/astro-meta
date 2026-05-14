// @rafters/astro-meta/og — Open Graph image generation
//
// Satori-based per-page PNG. The module declares its JSX-shaped template;
// the integration runs satori + resvg on build:done to produce one image per
// route. Satori is an optional peer dependency; consumers that don't import
// from this subpath pay nothing.

import type { z } from "astro/zod";
import type { MetaContext } from "./index.js";

/**
 * Satori-compatible element. The full JSX type lives in the satori peer dep;
 * v0.1 uses an opaque structural type to avoid forcing the dep at scaffold.
 */
export type SatoriElement = { type: string; props: Record<string, unknown> };

export interface OgModule<T = unknown> {
  key: readonly string[];
  ogInput?: z.ZodType<T>;
  /** Image width in pixels. Default: 1200. */
  width?: number;
  /** Image height in pixels. Default: 630. */
  height?: number;
  /** Per-page template evaluated against validated input + context. */
  template: (args: { input: T; ctx: MetaContext }) => SatoriElement;
  /** Font registrations passed to satori. Opaque until the peer dep is wired. */
  fonts?: readonly unknown[];
}

/** Render a single OG module to PNG bytes for the given context. */
export function renderOg(_module: OgModule, _ctx: MetaContext): Promise<Uint8Array> {
  throw new Error("not implemented");
}
