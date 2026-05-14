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
