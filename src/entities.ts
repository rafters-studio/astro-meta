// @rafters/astro-meta/entities — Organization + Person entity graph
//
// The AEO gap pagesmith/Yoast/RankMath don't fill. Entity disambiguation via
// `sameAs` linking (Wikipedia, LinkedIn, GitHub, ORCID) is increasingly
// load-bearing for AI Overviews and ChatGPT citations.
//
// defineEntities returns a SchemaModule that emits a shared graph on every
// route. Per-page schemas (Article, BlogPosting) reference the Organization
// and Person nodes by `@id`; JSON-LD's standard `@graph` cross-resolution
// handles the rest.

import type { JsonLdObject, JsonLdValue, SchemaModule } from "./schema.js";

export interface OrganizationEntity {
  "@id": string;
  name: string;
  url?: string;
  logo?: string;
  sameAs?: readonly string[];
  founder?: { "@id": string };
  employee?: readonly { "@id": string }[];
}

export interface PersonEntity {
  "@id": string;
  name: string;
  url?: string;
  sameAs?: readonly string[];
  knowsAbout?: readonly string[];
  worksFor?: { "@id": string };
}

export interface EntitiesOptions {
  organization?: OrganizationEntity;
  people?: readonly PersonEntity[];
}

function validateSameAs(name: string, urls: readonly string[] | undefined): void {
  if (!urls) return;
  for (const value of urls) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(
        `@rafters/astro-meta/entities: sameAs URL on "${name}" failed to parse: ${value}`,
      );
    }
    if (parsed.protocol !== "https:") {
      throw new Error(
        `@rafters/astro-meta/entities: sameAs URL on "${name}" must be https: (got ${parsed.protocol})`,
      );
    }
  }
}

function assertNoIdCollisions(opts: EntitiesOptions): void {
  const ids = new Set<string>();
  const claim = (id: string, source: string): void => {
    if (ids.has(id)) {
      throw new Error(
        `@rafters/astro-meta/entities: @id collision: "${id}" is used by more than one entity (most recent: ${source})`,
      );
    }
    ids.add(id);
  };
  if (opts.organization)
    claim(opts.organization["@id"], `organization "${opts.organization.name}"`);
  for (const person of opts.people ?? []) claim(person["@id"], `person "${person.name}"`);
}

function checkReciprocity(opts: EntitiesOptions, warn: (msg: string) => void): void {
  const org = opts.organization;
  if (!org) return;
  const employees = new Set((org.employee ?? []).map((e) => e["@id"]));
  for (const person of opts.people ?? []) {
    const worksForId = person.worksFor?.["@id"];
    if (worksForId === org["@id"] && !employees.has(person["@id"])) {
      warn(
        `entity "${person.name}" lists worksFor "${org["@id"]}" but the organization's employee list omits ${person["@id"]}`,
      );
    }
    if (employees.has(person["@id"]) && worksForId !== org["@id"]) {
      warn(
        `organization "${org.name}" lists ${person["@id"]} as employee but the person's worksFor is ${worksForId ?? "unset"}`,
      );
    }
  }
}

function personToJsonLd(person: PersonEntity): JsonLdObject {
  const out: Record<string, JsonLdValue> = {
    "@type": "Person",
    "@id": person["@id"],
    name: person.name,
  };
  if (person.url !== undefined) out["url"] = person.url;
  if (person.sameAs !== undefined) out["sameAs"] = [...person.sameAs];
  if (person.knowsAbout !== undefined) out["knowsAbout"] = [...person.knowsAbout];
  if (person.worksFor !== undefined) out["worksFor"] = { "@id": person.worksFor["@id"] };
  return out as JsonLdObject;
}

function organizationToJsonLd(org: OrganizationEntity): JsonLdObject {
  const out: Record<string, JsonLdValue> = {
    "@type": "Organization",
    "@id": org["@id"],
    name: org.name,
  };
  if (org.url !== undefined) out["url"] = org.url;
  if (org.logo !== undefined) out["logo"] = org.logo;
  if (org.sameAs !== undefined) out["sameAs"] = [...org.sameAs];
  if (org.founder !== undefined) out["founder"] = { "@id": org.founder["@id"] };
  if (org.employee !== undefined) out["employee"] = org.employee.map((e) => ({ "@id": e["@id"] }));
  return out as JsonLdObject;
}

/**
 * Build a SchemaModule that emits the configured Organization and Person
 * entities into the per-page @graph block.
 *
 * Validation runs at definition time:
 * - sameAs URLs must parse and be https: (throws)
 * - @id values must be unique across all entities (throws)
 * - employee / worksFor reciprocity is checked (console.warn, non-fatal)
 */
export function defineEntities(opts: EntitiesOptions): SchemaModule {
  if (opts.organization) validateSameAs(opts.organization.name, opts.organization.sameAs);
  for (const person of opts.people ?? []) {
    validateSameAs(person.name, person.sameAs);
  }
  assertNoIdCollisions(opts);
  checkReciprocity(opts, (msg) => {
    // Reciprocity is advisory; emit at definition time so it surfaces in
    // astro.config.mjs's logs without requiring a logger plumbed through.
    console.warn(`@rafters/astro-meta/entities: ${msg}`);
  });

  const objects: JsonLdObject[] = [];
  if (opts.organization) objects.push(organizationToJsonLd(opts.organization));
  for (const person of opts.people ?? []) objects.push(personToJsonLd(person));

  return {
    key: ["entities"],
    schema: () => objects,
  };
}
