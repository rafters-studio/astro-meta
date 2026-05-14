import { describe, it, expect } from "vitest";
import { buildLlmsTxt } from "../src/llms-txt.js";
import type { LlmsTxtSource } from "../src/llms-txt.js";

const ctx = { site: { url: "https://example.com", name: "Example" } };

describe("buildLlmsTxt", () => {
  it("renders header (H1 + blockquote) and a single section", async () => {
    const source: LlmsTxtSource = {
      key: ["docs"],
      collect: () => [
        { title: "Intro", url: "/docs/intro", summary: "Getting started", section: "Docs" },
      ],
    };
    const { index } = await buildLlmsTxt(
      {
        sources: [source],
        header: { title: "Example", description: "An example site" },
      },
      ctx,
    );
    expect(index).toContain("# Example");
    expect(index).toContain("> An example site");
    expect(index).toContain("## Docs");
    expect(index).toContain("- [Intro](https://example.com/docs/intro): Getting started");
  });

  it("groups entries by section in source order", async () => {
    const source: LlmsTxtSource = {
      key: ["all"],
      collect: () => [
        { title: "Post 1", url: "/blog/1", section: "Blog" },
        { title: "Doc 1", url: "/docs/1", section: "Docs" },
        { title: "Post 2", url: "/blog/2", section: "Blog" },
      ],
    };
    const { index } = await buildLlmsTxt({ sources: [source] }, ctx);
    const blogIdx = index.indexOf("## Blog");
    const docsIdx = index.indexOf("## Docs");
    expect(blogIdx).toBeGreaterThan(-1);
    expect(docsIdx).toBeGreaterThan(blogIdx);
    expect(index).toContain("- [Post 1](https://example.com/blog/1)");
    expect(index).toContain("- [Post 2](https://example.com/blog/2)");
  });

  it("resolves relative URLs against site.url", async () => {
    const source: LlmsTxtSource = {
      key: ["docs"],
      collect: () => [
        { title: "Slashed", url: "/p1" },
        { title: "No-slash", url: "p2" },
      ],
    };
    const { index } = await buildLlmsTxt({ sources: [source] }, ctx);
    expect(index).toContain("https://example.com/p1");
    expect(index).toContain("https://example.com/p2");
  });

  it("accepts absolute URLs as-is", async () => {
    const source: LlmsTxtSource = {
      key: ["external"],
      collect: () => [{ title: "External", url: "https://external.example/x" }],
    };
    const { index } = await buildLlmsTxt({ sources: [source] }, ctx);
    expect(index).toContain("https://external.example/x");
  });

  it("drops entries whose pathname matches a disallow prefix", async () => {
    const source: LlmsTxtSource = {
      key: ["mixed"],
      collect: () => [
        { title: "Public", url: "/public/1" },
        { title: "Private", url: "/private/secret" },
      ],
    };
    const { index } = await buildLlmsTxt({ sources: [source], disallow: ["/private"] }, ctx);
    expect(index).toContain("Public");
    expect(index).not.toContain("Private");
  });

  it("emits llms-full when entries have body and full !== false", async () => {
    const source: LlmsTxtSource = {
      key: ["docs"],
      collect: () => [
        { title: "Intro", url: "/docs/intro", body: "Intro body markdown" },
        { title: "Setup", url: "/docs/setup", body: "Setup body" },
      ],
    };
    const result = await buildLlmsTxt({ sources: [source] }, ctx);
    expect(result.full).toBeDefined();
    expect(result.full).toContain("## Intro");
    expect(result.full).toContain("url: https://example.com/docs/intro");
    expect(result.full).toContain("Intro body markdown");
    expect(result.full).toContain("---");
    expect(result.full).toContain("Setup body");
  });

  it("omits llms-full when full: false", async () => {
    const source: LlmsTxtSource = {
      key: ["docs"],
      collect: () => [{ title: "Intro", url: "/docs/intro", body: "Body" }],
    };
    const result = await buildLlmsTxt({ sources: [source], full: false }, ctx);
    expect(result.full).toBeUndefined();
  });

  it("omits llms-full when no entries have body", async () => {
    const source: LlmsTxtSource = {
      key: ["docs"],
      collect: () => [{ title: "Intro", url: "/docs/intro" }],
    };
    const result = await buildLlmsTxt({ sources: [source] }, ctx);
    expect(result.full).toBeUndefined();
  });

  it("aggregates entries from multiple sources", async () => {
    const s1: LlmsTxtSource = {
      key: ["docs"],
      collect: () => [{ title: "Doc", url: "/d1", section: "Docs" }],
    };
    const s2: LlmsTxtSource = {
      key: ["blog"],
      collect: () => [{ title: "Post", url: "/b1", section: "Blog" }],
    };
    const { index } = await buildLlmsTxt({ sources: [s1, s2] }, ctx);
    expect(index).toContain("- [Doc](https://example.com/d1)");
    expect(index).toContain("- [Post](https://example.com/b1)");
  });

  it("throws when an entry url is the empty string", async () => {
    const source: LlmsTxtSource = {
      key: ["bad"],
      collect: () => [{ title: "Empty", url: "" }],
    };
    await expect(buildLlmsTxt({ sources: [source] }, ctx)).rejects.toThrow(/non-empty/);
  });

  it("renders entries without a section under the header alone", async () => {
    const source: LlmsTxtSource = {
      key: ["misc"],
      collect: () => [{ title: "Orphan", url: "/o" }],
    };
    const { index } = await buildLlmsTxt({ sources: [source] }, ctx);
    expect(index).toContain("- [Orphan](https://example.com/o)");
    expect(index).not.toMatch(/^## /m);
  });
});
