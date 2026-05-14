import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineEntities } from "../src/entities.js";

const ctx = { site: { url: "https://example.com", name: "Example" } };

describe("defineEntities", () => {
  let consoleWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarn.mockRestore();
  });

  it("emits an Organization and Person on every route", async () => {
    const mod = defineEntities({
      organization: { "@id": "#org", name: "Example Inc", url: "https://example.com" },
      people: [{ "@id": "#sean", name: "Sean", url: "https://sean.example" }],
    });
    const result = await mod.schema({ ctx });
    expect(Array.isArray(result)).toBe(true);
    const arr = Array.isArray(result) ? result : [result];
    expect(arr).toHaveLength(2);
    expect(arr.map((o) => o["@type"])).toEqual(["Organization", "Person"]);
  });

  it("renders sameAs as a string array on each entity", async () => {
    const mod = defineEntities({
      people: [
        {
          "@id": "#sean",
          name: "Sean",
          sameAs: ["https://github.com/ssilvius", "https://linkedin.com/in/ssilvius"],
        },
      ],
    });
    const out = await mod.schema({ ctx });
    const arr = Array.isArray(out) ? out : [out];
    expect(arr[0]?.["sameAs"]).toEqual([
      "https://github.com/ssilvius",
      "https://linkedin.com/in/ssilvius",
    ]);
  });

  it("renders knowsAbout on Person and founder/employee on Organization", async () => {
    const mod = defineEntities({
      organization: {
        "@id": "#org",
        name: "Org",
        founder: { "@id": "#sean" },
        employee: [{ "@id": "#sean" }],
      },
      people: [
        { "@id": "#sean", name: "Sean", knowsAbout: ["astro"], worksFor: { "@id": "#org" } },
      ],
    });
    const out = await mod.schema({ ctx });
    const arr = Array.isArray(out) ? out : [out];
    const org = arr.find((o) => o["@type"] === "Organization");
    const person = arr.find((o) => o["@type"] === "Person");
    expect(org?.["founder"]).toEqual({ "@id": "#sean" });
    expect(org?.["employee"]).toEqual([{ "@id": "#sean" }]);
    expect(person?.["knowsAbout"]).toEqual(["astro"]);
    expect(person?.["worksFor"]).toEqual({ "@id": "#org" });
  });

  it("throws when sameAs URL fails to parse", () => {
    expect(() =>
      defineEntities({
        people: [{ "@id": "#sean", name: "Sean", sameAs: ["not a url"] }],
      }),
    ).toThrow(/failed to parse/);
  });

  it("throws when sameAs URL is not https:", () => {
    expect(() =>
      defineEntities({
        people: [{ "@id": "#sean", name: "Sean", sameAs: ["http://example.com"] }],
      }),
    ).toThrow(/must be https:/);
  });

  it("throws on @id collision between organization and person", () => {
    expect(() =>
      defineEntities({
        organization: { "@id": "#dup", name: "Org" },
        people: [{ "@id": "#dup", name: "Person" }],
      }),
    ).toThrow(/@id collision/);
  });

  it("throws on @id collision between two people", () => {
    expect(() =>
      defineEntities({
        people: [
          { "@id": "#sean", name: "Sean" },
          { "@id": "#sean", name: "Other" },
        ],
      }),
    ).toThrow(/@id collision/);
  });

  it("warns when a person's worksFor isn't reflected in the organization's employee list", () => {
    defineEntities({
      organization: { "@id": "#org", name: "Org", employee: [] },
      people: [{ "@id": "#sean", name: "Sean", worksFor: { "@id": "#org" } }],
    });
    expect(consoleWarn).toHaveBeenCalled();
    const messages = consoleWarn.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(messages.some((m: string) => m.includes("employee list omits"))).toBe(true);
  });

  it("warns when employee list includes a person whose worksFor doesn't match", () => {
    defineEntities({
      organization: { "@id": "#org", name: "Org", employee: [{ "@id": "#sean" }] },
      people: [{ "@id": "#sean", name: "Sean" }],
    });
    expect(consoleWarn).toHaveBeenCalled();
    const messages = consoleWarn.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(messages.some((m: string) => m.includes("worksFor"))).toBe(true);
  });

  it("does not warn when employee and worksFor agree", () => {
    defineEntities({
      organization: { "@id": "#org", name: "Org", employee: [{ "@id": "#sean" }] },
      people: [{ "@id": "#sean", name: "Sean", worksFor: { "@id": "#org" } }],
    });
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("returns empty array when no entities are configured", async () => {
    const mod = defineEntities({});
    const out = await mod.schema({ ctx });
    const arr = Array.isArray(out) ? out : [out];
    expect(arr).toHaveLength(0);
  });
});
