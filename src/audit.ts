// @rafters/astro-meta/audit — build-time GEO readability scoring
//
// Parses each generated route's static HTML without executing JS and scores
// against an open rubric. defaultRules ship a coarse v0.1 ruleset covering the
// load-bearing checks: renderability, schema presence, single H1, canonical
// URL, meta description length. Consumers can supply their own rules.
//
// Writes dist/_geo-audit.json (in the integration); CI may threshold-gate the
// build via opts.audit.threshold + opts.audit.failBuild.

export interface ParsedRoute {
  route: string;
  html: string;
  /** Linkedom-compatible Document, parsed by parseRoute. Opaque to keep linkedom optional. */
  dom?: ParsedDom;
}

export interface ParsedDom {
  querySelector: (selector: string) => ParsedElement | null;
  querySelectorAll: (selector: string) => ArrayLike<ParsedElement>;
  body?: ParsedElement | null;
}

export interface ParsedElement {
  textContent: string | null;
  getAttribute: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
}

export type AuditSeverity = "pass" | "warn" | "fail";

export interface AuditFinding {
  rule: string;
  severity: AuditSeverity;
  message: string;
}

export interface AuditRule {
  name: string;
  /** Contribution to the per-route score; sum across rules normalizes to 100. */
  weight: number;
  check: (page: ParsedRoute) => readonly AuditFinding[];
}

export interface AuditRouteReport {
  route: string;
  score: number;
  findings: readonly AuditFinding[];
}

export interface AuditReport {
  routes: readonly AuditRouteReport[];
  summary: { mean: number; min: number; failed: number; warned: number };
}

async function loadLinkedom(): Promise<{
  parseHTML: (html: string) => { document: ParsedDom };
} | null> {
  try {
    return (await import("linkedom")) as unknown as {
      parseHTML: (html: string) => { document: ParsedDom };
    };
  } catch {
    return null;
  }
}

/** Parse a route's HTML to a ParsedRoute with a linkedom-backed dom. */
export async function parseRoute(route: string, html: string): Promise<ParsedRoute> {
  const linkedom = await loadLinkedom();
  if (!linkedom) {
    throw new Error(
      "@rafters/astro-meta/audit: linkedom is a required peer dependency; install it to use the audit subpath",
    );
  }
  const { document } = linkedom.parseHTML(html);
  return { route, html, dom: document };
}

function selectAll(dom: ParsedDom | undefined, selector: string): ParsedElement[] {
  if (!dom) return [];
  const list = dom.querySelectorAll(selector);
  return Array.from({ length: list.length }, (_, i) => list[i] as ParsedElement);
}

function selectOne(dom: ParsedDom | undefined, selector: string): ParsedElement | null {
  if (!dom) return null;
  return dom.querySelector(selector);
}

function pass(rule: string, message: string): AuditFinding {
  return { rule, severity: "pass", message };
}

function fail(rule: string, message: string): AuditFinding {
  return { rule, severity: "fail", message };
}

function warn(rule: string, message: string): AuditFinding {
  return { rule, severity: "warn", message };
}

export const defaultRules: readonly AuditRule[] = [
  {
    name: "renderability",
    weight: 40,
    check: (page) => {
      const text = (page.dom?.body?.textContent ?? "").trim();
      if (text.length === 0) {
        return [fail("renderability", "<body> has no text content; likely a CSR shell")];
      }
      if (text.length < 200) {
        return [warn("renderability", `body text content is only ${text.length} bytes`)];
      }
      return [pass("renderability", `${text.length} bytes of visible text`)];
    },
  },
  {
    name: "json-ld",
    weight: 20,
    check: (page) => {
      const scripts = selectAll(page.dom, 'script[type="application/ld+json"]');
      if (scripts.length === 0) {
        return [fail("json-ld", "no <script type=application/ld+json> present")];
      }
      for (const script of scripts) {
        try {
          JSON.parse(script.textContent ?? "");
        } catch {
          return [fail("json-ld", "found a JSON-LD script with invalid JSON")];
        }
      }
      return [pass("json-ld", `${scripts.length} JSON-LD block(s) present and parseable`)];
    },
  },
  {
    name: "single-h1",
    weight: 15,
    check: (page) => {
      const headings = selectAll(page.dom, "h1");
      if (headings.length === 0) return [fail("single-h1", "no <h1> on the page")];
      if (headings.length > 1) {
        return [warn("single-h1", `${headings.length} <h1> elements; one is preferred`)];
      }
      return [pass("single-h1", "exactly one <h1>")];
    },
  },
  {
    name: "canonical",
    weight: 15,
    check: (page) => {
      const link = selectOne(page.dom, 'link[rel="canonical"]');
      if (!link) return [fail("canonical", "no <link rel=canonical>")];
      const href = link.getAttribute("href") ?? "";
      if (href.length === 0) return [fail("canonical", "<link rel=canonical> has empty href")];
      if (!href.startsWith("http")) {
        return [warn("canonical", `canonical href is not absolute: ${href}`)];
      }
      return [pass("canonical", `canonical resolves to ${href}`)];
    },
  },
  {
    name: "meta-description",
    weight: 10,
    check: (page) => {
      const meta = selectOne(page.dom, 'meta[name="description"]');
      if (!meta) return [fail("meta-description", "no <meta name=description>")];
      const content = meta.getAttribute("content") ?? "";
      if (content.length === 0) {
        return [fail("meta-description", "<meta name=description> has empty content")];
      }
      if (content.length < 70 || content.length > 160) {
        return [
          warn(
            "meta-description",
            `description length ${content.length} is outside recommended 70-160 range`,
          ),
        ];
      }
      return [pass("meta-description", `description length ${content.length}`)];
    },
  },
];

function scoreFindings(findings: readonly AuditFinding[], weight: number): number {
  if (findings.some((f) => f.severity === "fail")) return 0;
  if (findings.some((f) => f.severity === "warn")) return Math.round(weight / 2);
  return weight;
}

export function runAudit(
  routes: readonly ParsedRoute[],
  rules: readonly AuditRule[] = defaultRules,
): AuditReport {
  const routeReports: AuditRouteReport[] = routes.map((page) => {
    const findings: AuditFinding[] = [];
    let score = 0;
    for (const rule of rules) {
      let ruleFindings: readonly AuditFinding[];
      try {
        ruleFindings = rule.check(page);
      } catch (err) {
        ruleFindings = [
          { rule: rule.name, severity: "fail", message: `rule threw: ${(err as Error).message}` },
        ];
      }
      findings.push(...ruleFindings);
      score += scoreFindings(ruleFindings, rule.weight);
    }
    return { route: page.route, score, findings };
  });
  const scores = routeReports.map((r) => r.score);
  const totalFail = routeReports.reduce(
    (acc, r) => acc + r.findings.filter((f) => f.severity === "fail").length,
    0,
  );
  const totalWarn = routeReports.reduce(
    (acc, r) => acc + r.findings.filter((f) => f.severity === "warn").length,
    0,
  );
  const sum = scores.reduce((a, b) => a + b, 0);
  return {
    routes: routeReports,
    summary: {
      mean: scores.length === 0 ? 0 : Math.round(sum / scores.length),
      min: scores.length === 0 ? 0 : Math.min(...scores),
      failed: totalFail,
      warned: totalWarn,
    },
  };
}
