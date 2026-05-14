// @rafters/astro-meta/og — Open Graph image generation
//
// Satori + resvg-js produce one PNG per (module, route) match at build:done.
// Both peers are optional; consumers that don't import this subpath pay
// nothing. v0.1 supports route filtering via OgModule.match; per-page input
// validation and cache-by-hash arrive in v0.2.

import type { MetaContext } from "./index.js";

/**
 * Satori-compatible element. Structurally compatible with React.ReactElement
 * for satori's purposes. Consumers can return JSX directly when their build
 * supports it, or a plain object literal of this shape.
 */
export interface SatoriElement {
  type: string;
  props: {
    style?: Record<string, unknown>;
    children?: SatoriElement | SatoriElement[] | string | number | (SatoriElement | string)[];
    [key: string]: unknown;
  };
}

export interface OgFont {
  name: string;
  data: Buffer | ArrayBuffer | Uint8Array;
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  style?: "normal" | "italic";
}

/**
 * v0.1 contract: one OG image per route. The integration scans `modules` in
 * array order and emits a PNG for the first module whose `match` returns
 * true (or has no `match`). Subsequent matches are dropped; a build-time
 * warning names the colliding module keys.
 *
 * Define more-specific modules earlier in the array. Set `match` on the
 * specific modules and leave the fallback without one.
 */
export interface OgModule {
  key: readonly string[];
  /** Image width in pixels. Default: 1200. */
  width?: number;
  /** Image height in pixels. Default: 630. */
  height?: number;
  /** Returns true to emit a PNG for this route. Default: emit for every HTML route. */
  match?: (route: string) => boolean;
  /** Per-route template evaluated against context. */
  template: (args: { ctx: MetaContext }) => SatoriElement;
  /** Font registrations passed to satori. Required for any text rendering. */
  fonts?: readonly OgFont[];
}

interface SatoriModule {
  default: (
    element: unknown,
    options: { width: number; height: number; fonts: readonly OgFont[] },
  ) => Promise<string>;
}

interface ResvgModule {
  Resvg: new (
    svg: string,
    options?: { fitTo?: { mode: "width" | "height"; value: number } },
  ) => { render(): { asPng(): Uint8Array } };
}

async function loadSatori(): Promise<SatoriModule | null> {
  try {
    return (await import("satori")) as unknown as SatoriModule;
  } catch {
    return null;
  }
}

async function loadResvg(): Promise<ResvgModule | null> {
  try {
    return (await import("@resvg/resvg-js")) as unknown as ResvgModule;
  } catch {
    return null;
  }
}

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 630;

/** Render a single OG module to PNG bytes for the given context. */
export async function renderOg(module: OgModule, ctx: MetaContext): Promise<Uint8Array> {
  const [satoriMod, resvgMod] = await Promise.all([loadSatori(), loadResvg()]);
  if (!satoriMod || !resvgMod) {
    throw new Error(
      "@rafters/astro-meta/og: satori and @resvg/resvg-js are required peer dependencies; install both to use the og subpath",
    );
  }
  const element = module.template({ ctx });
  const fonts = module.fonts ?? [];
  const svg = await satoriMod.default(element, {
    width: module.width ?? DEFAULT_WIDTH,
    height: module.height ?? DEFAULT_HEIGHT,
    fonts,
  });
  const resvg = new resvgMod.Resvg(svg);
  return resvg.render().asPng();
}

/** Slug a route for use as a filename: "/" -> "index", "/about" -> "about", "/blog/post-1" -> "blog/post-1". */
export function ogSlugForRoute(route: string): string {
  const trimmed = route.replace(/^\/+|\/+$/g, "");
  return trimmed.length === 0 ? "index" : trimmed;
}
