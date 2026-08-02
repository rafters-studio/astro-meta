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

describe("buildLlmsTxt markdown-body contract", () => {
  // The sniff exists to catch component tags reaching crawlers. Its dangerous
  // failure is the opposite direction: flagging documentation that legitimately
  // shows JSX. This case is first because it constrains the implementation more
  // than any of the detection cases do.
  it("passes legitimate markdown containing fenced JSX, inline HTML, and tables", async () => {
    const body = [
      "Mount the component in your layout:",
      "",
      "```jsx",
      "<SiteHeader />",
      "<VoiceHero title='hi' />",
      "```",
      "",
      "~~~astro",
      "<MegaFooter current='legion' />",
      "~~~",
      "",
      "Inline `<Container />` is fine too, as is <img src='/a.png' alt='a'> and",
      "<div class='note'>raw HTML</div>, which markdown allows.",
      "",
      "| Component | Purpose |",
      "| --------- | ------- |",
      "| `<Grid />` | layout  |",
    ].join("\n");
    const source: LlmsTxtSource = {
      key: ["docs"],
      collect: () => [{ title: "Usage", url: "/docs/usage", body }],
    };
    const result = await buildLlmsTxt({ sources: [source], onNonMarkdownBody: "error" }, ctx);
    expect(result.nonMarkdownBodies).toEqual([]);
    expect(result.full).toContain("<SiteHeader />");
  });

  it("flags a body that is only component tags", async () => {
    const source: LlmsTxtSource = {
      key: ["pages"],
      collect: () => [
        {
          title: "Home",
          url: "/",
          body: "<SiteHeader />\n<VoiceHero />\n<MrsBlock />\n<NarrativeSections />",
        },
      ],
    };
    const result = await buildLlmsTxt({ sources: [source] }, ctx);
    expect(result.nonMarkdownBodies).toHaveLength(1);
    expect(result.nonMarkdownBodies[0]?.title).toBe("Home");
    expect(result.nonMarkdownBodies[0]?.url).toBe("https://example.com/");
    expect(result.nonMarkdownBodies[0]?.reason).toMatch(/SiteHeader/);
  });

  it("flags top-level import and export statements", async () => {
    const source: LlmsTxtSource = {
      key: ["pages"],
      collect: () => [
        { title: "Imported", url: "/i", body: "import Foo from './foo.astro';\n\nSome prose." },
        { title: "Exported", url: "/e", body: "export const x = 1;\n\nMore prose." },
      ],
    };
    const result = await buildLlmsTxt({ sources: [source] }, ctx);
    expect(result.nonMarkdownBodies).toHaveLength(2);
  });

  it("warns by default: the body still ships", async () => {
    const source: LlmsTxtSource = {
      key: ["pages"],
      collect: () => [{ title: "Home", url: "/", body: "<SiteHeader />" }],
    };
    const result = await buildLlmsTxt({ sources: [source] }, ctx);
    expect(result.nonMarkdownBodies).toHaveLength(1);
    expect(result.full).toContain("<SiteHeader />");
  });

  it("drop mode omits the body but keeps the entry in the index", async () => {
    const source: LlmsTxtSource = {
      key: ["pages"],
      collect: () => [
        { title: "Home", url: "/", body: "<SiteHeader />" },
        { title: "About", url: "/about", body: "Real prose about us." },
      ],
    };
    const result = await buildLlmsTxt({ sources: [source], onNonMarkdownBody: "drop" }, ctx);
    expect(result.index).toContain("- [Home](https://example.com/)");
    expect(result.full).not.toContain("<SiteHeader />");
    expect(result.full).toContain("Real prose about us.");
  });

  it("error mode names every failing entry, not just the first", async () => {
    const source: LlmsTxtSource = {
      key: ["pages"],
      collect: () => [
        { title: "Home", url: "/", body: "<SiteHeader />" },
        { title: "Docs", url: "/docs", body: "<DocsShell />" },
      ],
    };
    await expect(
      buildLlmsTxt({ sources: [source], onNonMarkdownBody: "error" }, ctx),
    ).rejects.toThrow(/Home[\s\S]*Docs/);
  });

  it("does not throw on a body far past the scan bound", async () => {
    const body = `${"prose line\n".repeat(50_000)}<SiteHeader />`;
    const source: LlmsTxtSource = {
      key: ["pages"],
      collect: () => [{ title: "Huge", url: "/huge", body }],
    };
    const result = await buildLlmsTxt({ sources: [source] }, ctx);
    expect(result.nonMarkdownBodies).toEqual([]);
  });

  it("leaves an unterminated code fence masked to the end rather than flagging", async () => {
    const source: LlmsTxtSource = {
      key: ["docs"],
      collect: () => [{ title: "Unterminated", url: "/u", body: "```jsx\n<SiteHeader />" }],
    };
    const result = await buildLlmsTxt({ sources: [source] }, ctx);
    expect(result.nonMarkdownBodies).toEqual([]);
  });
});
