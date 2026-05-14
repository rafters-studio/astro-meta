// @rafters/astro-meta/llms-txt — llms.txt + llms-full.txt emission
//
// llms.txt is a top-level index of titled URLs grouped by section. llms-full.txt
// is the concatenated markdown of selected entries. Both are emitted on
// build:done. Disallow rules are mirrored from the configured robots policy
// so the two artifacts cannot drift.

import type { MetaContext } from "./index.js";

export interface LlmsTxtEntry {
  title: string;
  url: string;
  /** One-line summary used in the llms.txt index. */
  summary?: string;
  /** Markdown body, required to appear in llms-full.txt. */
  body?: string;
  /** Section heading in llms.txt; entries with the same section group together. */
  section?: string;
}

export interface LlmsTxtSource {
  key: readonly string[];
  collect: (ctx: MetaContext) => Promise<readonly LlmsTxtEntry[]> | readonly LlmsTxtEntry[];
}

export interface LlmsTxtBuildOptions {
  sources: readonly LlmsTxtSource[];
  /** Path-prefix array; entries whose URL matches any prefix are dropped. */
  disallow?: readonly string[];
  /** Site-level header; renders as H1 + blockquote at the top of llms.txt. */
  header?: { title: string; description?: string };
  /** Whether to emit llms-full.txt. Default: true. */
  full?: boolean;
}

export function buildLlmsTxt(
  _opts: LlmsTxtBuildOptions,
  _ctx: MetaContext,
): Promise<{ index: string; full?: string }> {
  throw new Error("not implemented");
}
