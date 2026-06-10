// @rafters/astro-meta/schema — JSON-LD authoring
//
// Schema.org modules emit one or more typed objects per route. The integration
// merges every module's output into a single `@graph` block and injects it
// into <head> as one <script type="application/ld+json"> tag.
//
// v0.1 ships a structural JsonLdObject type and trusts the author. v0.2 will
// layer typed Schema.org via schema-dts when the peer is installed.

import type { MetaContext } from "./index.js";

export type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | JsonLdValue[]
  | { [key: string]: JsonLdValue };

export type JsonLdObject = { "@type": string; [key: string]: JsonLdValue };

const JSON_LD_CONTEXT = "https://schema.org";

export interface SchemaModule {
  /** Hierarchical key for composition and audit. */
  key: readonly string[];
  /**
   * Pure derivation from MetaContext to one or more Schema.org objects. May
   * return an empty array when the module does not apply to the current
   * route. Async is allowed for content-collection lookups.
   */
  schema: (args: {
    ctx: MetaContext;
  }) => JsonLdObject | JsonLdObject[] | Promise<JsonLdObject | JsonLdObject[]>;
}

function assertHasType(value: JsonLdObject, key: readonly string[]): void {
  if (typeof value["@type"] !== "string" || value["@type"].length === 0) {
    throw new Error(
      `@rafters/astro-meta/schema: module [${key.join(", ")}] emitted an object without a string @type`,
    );
  }
}

/**
 * Escape characters that would break out of a surrounding \`<script>\` tag or
 * trip JavaScript parsers when inlining JSON into HTML. The escapes use JSON's
 * \`\uXXXX\` form so the result still parses as the original string under
 * \`JSON.parse\`.
 *
 *   \`<\` -> \`\u003c\`  blocks \`</script>\` early-close
 *   \`>\` -> \`\u003e\`  blocks \`]]>\` in some HTML edge cases
 *   \`&\` -> \`\u0026\`  blocks \`&\` ambiguity in some parsers
 *   U+2028 / U+2029  block JS line-terminator interpretation
 */
function escapeForInlineScript(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(new RegExp("\\u2028", "g"), "\\u2028")
    .replace(new RegExp("\\u2029", "g"), "\\u2029");
}

/** Render one or more Schema.org objects to a JSON-LD JSON string, safe for inline `<script>` injection. */
export function renderJsonLd(value: JsonLdObject | JsonLdObject[]): string {
  const payload = Array.isArray(value)
    ? { "@context": JSON_LD_CONTEXT, "@graph": value }
    : (() => {
        const { "@type": atType, ...rest } = value;
        return { "@context": JSON_LD_CONTEXT, "@type": atType, ...rest };
      })();
  return escapeForInlineScript(JSON.stringify(payload));
}

/**
 * Combine multiple Schema.org objects into a deduped array. Two objects
 * sharing an `@id` are merged with later-wins semantics for non-`@id`
 * fields; objects without an `@id` are preserved in input order.
 *
 * Pair with `renderJsonLd` (or `<SchemaScript graph={...} />`) which wraps
 * an array in `@context` + `@graph` automatically.
 */
export function mergeGraph(objects: readonly JsonLdObject[]): JsonLdObject[] {
  const byId = new Map<string, JsonLdObject>();
  const anonymous: JsonLdObject[] = [];
  for (const obj of objects) {
    const id = obj["@id"];
    if (typeof id === "string" && id.length > 0) {
      const existing = byId.get(id);
      byId.set(id, existing ? { ...existing, ...obj } : obj);
    } else {
      anonymous.push(obj);
    }
  }
  return [...byId.values(), ...anonymous];
}

/**
 * Run every schema module for the given context, validate the @type fields,
 * and return a flat list of emitted objects.
 */
export async function collectSchemas(
  modules: readonly SchemaModule[],
  ctx: MetaContext,
): Promise<JsonLdObject[]> {
  const results = await Promise.all(
    modules.map(async (m) => ({ m, value: await m.schema({ ctx }) })),
  );
  const out: JsonLdObject[] = [];
  for (const { m, value } of results) {
    const arr = Array.isArray(value) ? value : [value];
    for (const obj of arr) {
      assertHasType(obj, m.key);
      out.push(obj);
    }
  }
  return out;
}

/**
 * Render the collected schemas as a single <script type="application/ld+json">
 * block ready to inject into <head>. Returns the empty string when no objects
 * were emitted so callers can safely concatenate.
 */
export function renderSchemaScript(objects: readonly JsonLdObject[]): string {
  if (objects.length === 0) return "";
  const payload =
    objects.length === 1
      ? renderJsonLd(objects[0] as JsonLdObject)
      : renderJsonLd(objects as JsonLdObject[]);
  return `<script type="application/ld+json">${payload}</script>`;
}

// ─── Typed builders for the common per-page types ───────────────────────────
//
// defineEntities covers the site-shared Organization/Person graph. These cover
// the per-page nodes sites otherwise hand-roll as raw JsonLdObjects:
// SoftwareApplication for a product/home page, Article/TechArticle/BlogPosting
// for docs and posts, BreadcrumbList for navigation. Each returns a plain
// JsonLdObject so it composes with mergeGraph and <SchemaScript> like any other.

/** A reference to another node in the graph by its `@id`. */
export interface NodeRef {
  "@id": string;
}

export interface SoftwareApplicationInput {
  "@id"?: string;
  name: string;
  url?: string;
  description?: string;
  /** e.g. "DeveloperApplication", "WebApplication". */
  applicationCategory?: string;
  operatingSystem?: string;
  /** Free software: { price: "0", priceCurrency: "USD" }. */
  offers?: { price: string; priceCurrency: string };
  sameAs?: readonly string[];
}

/** Build a SoftwareApplication node (product, CLI, app home page). */
export function softwareApplication(input: SoftwareApplicationInput): JsonLdObject {
  const out: Record<string, JsonLdValue> = { "@type": "SoftwareApplication", name: input.name };
  if (input["@id"] !== undefined) out["@id"] = input["@id"];
  if (input.url !== undefined) out["url"] = input.url;
  if (input.description !== undefined) out["description"] = input.description;
  if (input.applicationCategory !== undefined)
    out["applicationCategory"] = input.applicationCategory;
  if (input.operatingSystem !== undefined) out["operatingSystem"] = input.operatingSystem;
  if (input.offers !== undefined)
    out["offers"] = {
      "@type": "Offer",
      price: input.offers.price,
      priceCurrency: input.offers.priceCurrency,
    };
  if (input.sameAs !== undefined) out["sameAs"] = [...input.sameAs];
  return out as JsonLdObject;
}

export type ArticleType = "Article" | "TechArticle" | "BlogPosting";

export interface ArticleInput {
  "@id"?: string;
  /** Schema.org subtype. Default "Article". */
  type?: ArticleType;
  headline: string;
  description?: string;
  url?: string;
  /** ISO 8601. */
  datePublished?: string;
  /** ISO 8601. */
  dateModified?: string;
  author?: NodeRef;
  publisher?: NodeRef;
  image?: string | readonly string[];
}

/** Build an Article / TechArticle / BlogPosting node for a docs page or post. */
export function article(input: ArticleInput): JsonLdObject {
  const out: Record<string, JsonLdValue> = {
    "@type": input.type ?? "Article",
    headline: input.headline,
  };
  if (input["@id"] !== undefined) out["@id"] = input["@id"];
  if (input.description !== undefined) out["description"] = input.description;
  if (input.url !== undefined) out["url"] = input.url;
  if (input.datePublished !== undefined) out["datePublished"] = input.datePublished;
  if (input.dateModified !== undefined) out["dateModified"] = input.dateModified;
  if (input.author !== undefined) out["author"] = { "@id": input.author["@id"] };
  if (input.publisher !== undefined) out["publisher"] = { "@id": input.publisher["@id"] };
  if (input.image !== undefined)
    out["image"] = typeof input.image === "string" ? input.image : [...input.image];
  return out as JsonLdObject;
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

/** Build a BreadcrumbList node from an ordered list of name/url pairs. */
export function breadcrumbList(items: readonly BreadcrumbItem[]): JsonLdObject {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
