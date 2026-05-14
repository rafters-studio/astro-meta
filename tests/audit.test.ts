import { describe, it, expect } from "vitest";
import { defaultRules, parseRoute, runAudit } from "../src/audit.js";
import type { AuditRule, ParsedRoute } from "../src/audit.js";

const wrap = (head: string, body: string): string =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

describe("parseRoute", () => {
  it("returns a ParsedRoute with a queryable dom", async () => {
    const route = await parseRoute("/", wrap("<title>X</title>", "<h1>Hello</h1>"));
    expect(route.route).toBe("/");
    expect(route.dom?.querySelector("h1")?.textContent).toBe("Hello");
  });
});

describe("defaultRules", () => {
  const goodHead = `
    <title>Page</title>
    <meta name="description" content="A description that is at least seventy characters long for the meta description rule.">
    <link rel="canonical" href="https://example.com/x">
    <script type="application/ld+json">{"@type":"Article"}</script>
  `;
  const goodBody = `<h1>Title</h1>${"<p>Paragraph text with substantial visible content. </p>".repeat(10)}`;

  it("passes a fully-formed page with score 100", async () => {
    const page = await parseRoute("/", wrap(goodHead, goodBody));
    const report = runAudit([page]);
    expect(report.routes[0]?.score).toBe(100);
    expect(report.routes[0]?.findings.every((f) => f.severity === "pass")).toBe(true);
  });

  it("fails renderability on a CSR shell", async () => {
    const page = await parseRoute("/", wrap("<title>X</title>", '<div id="root"></div>'));
    const report = runAudit([page]);
    const route = report.routes[0];
    expect(route?.score).toBeLessThanOrEqual(60);
    expect(route?.findings.some((f) => f.rule === "renderability" && f.severity === "fail")).toBe(
      true,
    );
  });

  it("warns on two h1 elements", async () => {
    const page = await parseRoute("/", wrap(goodHead, `<h1>One</h1><h1>Two</h1>${goodBody}`));
    const report = runAudit([page]);
    expect(
      report.routes[0]?.findings.some((f) => f.rule === "single-h1" && f.severity === "warn"),
    ).toBe(true);
  });

  it("fails json-ld when absent", async () => {
    const page = await parseRoute(
      "/",
      wrap(
        '<title>X</title><meta name="description" content="A description that is at least seventy characters long for the meta description rule."><link rel="canonical" href="https://example.com/x">',
        goodBody,
      ),
    );
    const report = runAudit([page]);
    expect(
      report.routes[0]?.findings.some((f) => f.rule === "json-ld" && f.severity === "fail"),
    ).toBe(true);
  });

  it("fails json-ld when JSON is invalid", async () => {
    const page = await parseRoute(
      "/",
      wrap(
        '<title>X</title><meta name="description" content="A description that is at least seventy characters long for the meta description rule."><link rel="canonical" href="https://example.com/x"><script type="application/ld+json">not json</script>',
        goodBody,
      ),
    );
    const report = runAudit([page]);
    expect(
      report.routes[0]?.findings.some((f) => f.rule === "json-ld" && f.severity === "fail"),
    ).toBe(true);
  });

  it("fails canonical when absent", async () => {
    const page = await parseRoute(
      "/",
      wrap(
        '<title>X</title><meta name="description" content="A description that is at least seventy characters long for the meta description rule."><script type="application/ld+json">{"@type":"X"}</script>',
        goodBody,
      ),
    );
    const report = runAudit([page]);
    expect(
      report.routes[0]?.findings.some((f) => f.rule === "canonical" && f.severity === "fail"),
    ).toBe(true);
  });

  it("warns on meta-description outside 70-160", async () => {
    const page = await parseRoute(
      "/",
      wrap(
        '<title>X</title><meta name="description" content="short"><link rel="canonical" href="https://example.com/x"><script type="application/ld+json">{"@type":"X"}</script>',
        goodBody,
      ),
    );
    const report = runAudit([page]);
    expect(
      report.routes[0]?.findings.some(
        (f) => f.rule === "meta-description" && f.severity === "warn",
      ),
    ).toBe(true);
  });

  it("default rules sum to weight 100", () => {
    const total = defaultRules.reduce((acc, r) => acc + r.weight, 0);
    expect(total).toBe(100);
  });
});

describe("runAudit", () => {
  it("returns aggregate summary across routes", async () => {
    const route1 = await parseRoute("/", "<html><head></head><body></body></html>");
    const route2 = await parseRoute(
      "/about",
      '<html><head><title>x</title><meta name="description" content="A description that is at least seventy characters long for the meta description rule."><link rel="canonical" href="https://example.com/x"><script type="application/ld+json">{"@type":"X"}</script></head><body><h1>X</h1>' +
        "<p>".repeat(50) +
        "Substantial body text that exceeds the 200-byte threshold for the renderability rule to pass cleanly without warning. " +
        "</p>".repeat(50) +
        "</body></html>",
    );
    const report = runAudit([route1, route2]);
    expect(report.routes).toHaveLength(2);
    expect(report.summary.failed).toBeGreaterThan(0);
  });

  it("catches rule throws and converts them to fail findings", async () => {
    const page = await parseRoute("/", "<html><head></head><body><h1>x</h1></body></html>");
    const throwingRule: AuditRule = {
      name: "thrower",
      weight: 10,
      check: () => {
        throw new Error("boom");
      },
    };
    const report = runAudit([page], [throwingRule]);
    const findings = report.routes[0]?.findings ?? [];
    expect(findings.some((f) => f.rule === "thrower" && f.severity === "fail")).toBe(true);
  });

  it("returns empty report for empty routes", () => {
    const report = runAudit([] as readonly ParsedRoute[]);
    expect(report.routes).toEqual([]);
    expect(report.summary).toEqual({ mean: 0, min: 0, failed: 0, warned: 0 });
  });
});
