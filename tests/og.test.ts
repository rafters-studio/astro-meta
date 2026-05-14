import { describe, it, expect, vi } from "vitest";
import { ogSlugForRoute, renderOg } from "../src/og.js";
import type { OgModule } from "../src/og.js";

vi.mock("satori", () => ({
  default: async () => '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
}));

vi.mock("@resvg/resvg-js", () => ({
  Resvg: class {
    render() {
      return {
        asPng: () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      };
    }
  },
}));

const ctx = { site: { url: "https://example.com", name: "Example" }, page: { route: "/" } };

describe("ogSlugForRoute", () => {
  it.each([
    ["/", "index"],
    ["/about", "about"],
    ["/blog/post-1", "blog/post-1"],
    ["/blog/post-1/", "blog/post-1"],
    ["///nested///", "nested"],
  ])("ogSlugForRoute(%j) === %j", (input, expected) => {
    expect(ogSlugForRoute(input)).toBe(expected);
  });
});

describe("renderOg", () => {
  const module: OgModule = {
    key: ["default"],
    template: () => ({ type: "div", props: {} }),
  };

  it("returns PNG bytes (starts with PNG magic) for a valid module", async () => {
    const png = await renderOg(module, ctx);
    expect(png).toBeInstanceOf(Uint8Array);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  });

  it("calls satori with the configured width and height", async () => {
    const satori = await import("satori");
    const spy = vi.spyOn(satori, "default");
    const sized: OgModule = {
      key: ["wide"],
      width: 1920,
      height: 1080,
      template: () => ({ type: "div", props: {} }),
    };
    await renderOg(sized, ctx);
    expect(spy).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ width: 1920, height: 1080 }),
    );
    spy.mockRestore();
  });

  it("passes fonts through to satori", async () => {
    const satori = await import("satori");
    const spy = vi.spyOn(satori, "default");
    const fontData = new Uint8Array([1, 2, 3]);
    const withFont: OgModule = {
      key: ["custom"],
      fonts: [{ name: "Inter", data: fontData, weight: 400, style: "normal" }],
      template: () => ({ type: "div", props: {} }),
    };
    await renderOg(withFont, ctx);
    expect(spy).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        fonts: [{ name: "Inter", data: fontData, weight: 400, style: "normal" }],
      }),
    );
    spy.mockRestore();
  });

  it("defaults to 1200x630 when no dimensions are configured", async () => {
    const satori = await import("satori");
    const spy = vi.spyOn(satori, "default");
    await renderOg(module, ctx);
    expect(spy).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ width: 1200, height: 630 }),
    );
    spy.mockRestore();
  });
});
