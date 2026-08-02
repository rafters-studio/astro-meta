// Making the astro:content failure legible (#43).
//
// A source module is imported by astro.config.*, which Node's ESM loader
// evaluates outside Vite's module graph. `astro:content` is a Vite virtual
// module, so it does not resolve there -- at ANY hook. Measured across all
// four: config:setup, build:setup, build:generated, and build:done each fail
// identically. The phase is not the variable, the module graph is.
//
// Raw, that surfaces to the consumer as "Only URLs with a scheme in: file,
// data, and node are supported by the default ESM loader. Received protocol
// 'astro:'", which says nothing about sources, collections, or what to do.

/** Node's ESM loader rejecting a non-file protocol, i.e. a Vite virtual module. */
const UNSUPPORTED_SCHEME = /Received protocol 'astro:/;
/** Older Astro/Vite surfaced the same root cause this way; keep both matched. */
const RUNNER_CLOSED = /Vite module runner has been closed/;

export function isAstroVirtualModuleError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return UNSUPPORTED_SCHEME.test(message) || RUNNER_CLOSED.test(message);
}

/**
 * Rethrow a source `collect()` failure with the source key attached, upgrading
 * the astro:content case to say what actually went wrong and what to do
 * instead. Every other failure passes through with its message intact.
 */
export function sourceCollectError(surface: string, key: readonly string[], cause: unknown): Error {
  const where = `@rafters/astro-meta/${surface}: source [${key.join(", ")}] failed during collect()`;
  if (!isAstroVirtualModuleError(cause)) {
    // Keep the original message in the top-level string, not only in `cause`.
    // Naming the source is worth nothing if it costs the consumer the message
    // that says what actually broke.
    const original = cause instanceof Error ? cause.message : String(cause);
    return new Error(`${where}: ${original}`, { cause });
  }
  return new Error(
    `${where}: astro:content is not reachable from a source module. Source modules are imported by astro.config.*, which Node loads outside Vite's module graph, so the virtual module does not resolve at any build hook. Read the content directory directly instead (node:fs plus a frontmatter parser); see the llms.txt source example in the @rafters/astro-meta README.`,
    { cause },
  );
}
