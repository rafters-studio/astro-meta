// @rafters/astro-meta/schema — typed JSON-LD authoring
//
// Schema.org modules declared per content shape. The integration renders
// each module to a <script type="application/ld+json"> block in <head>.
// v0.2 will type the schema against schema-dts; v0.1 takes a structural
// type and trusts the author.

import type { z } from "astro/zod";
import type { MetaContext } from "./index.js";

export type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | JsonLdValue[]
  | { [key: string]: JsonLdValue };

export type JsonLdObject = { "@type": string; [key: string]: JsonLdValue };

export interface SchemaModule<T = unknown> {
  key: readonly string[];
  schemaInput?: z.ZodType<T>;
  /** Pure derivation from validated input + context to one or more Schema.org objects. */
  schema: (args: { input: T; ctx: MetaContext }) => JsonLdObject | JsonLdObject[];
}

/** Render a Schema.org object (or array) to a JSON-LD script tag's inner JSON. */
export function renderJsonLd(_value: JsonLdObject | JsonLdObject[]): string {
  throw new Error("not implemented");
}

/** Combine multiple Schema.org objects into a single @graph block with shared @id linking. */
export function mergeGraph(_objects: readonly JsonLdObject[]): JsonLdObject {
  throw new Error("not implemented");
}
