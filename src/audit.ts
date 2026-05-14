// @rafters/astro-meta/audit — build-time GEO readability scoring
//
// Parses each generated route's static HTML without executing JS and scores
// against a rubric: renderability, structure, schema, crawler signals, AI
// affordances. Writes dist/_geo-audit.json. CI may threshold-gate the build.
//
// The rubric is open: consumers can supply their own rules. defaultRules
// ships in v0.2 alongside the implementations.

export interface ParsedRoute {
  route: string;
  html: string;
  /** Lightweight DOM handle; opaque until linkedom is wired in v0.2. */
  dom?: unknown;
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

/** Default rule set. Empty in v0.1; populated in v0.2 alongside implementations. */
export const defaultRules: readonly AuditRule[] = [];

export function runAudit(
  _routes: readonly ParsedRoute[],
  _rules?: readonly AuditRule[],
): AuditReport {
  throw new Error("not implemented");
}
