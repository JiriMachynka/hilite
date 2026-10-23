import { toRegExpDetails } from 'oniguruma-to-es'
import type { ToRegExpOptions } from 'oniguruma-to-es'

export type Target = NonNullable<ToRegExpOptions['target']>

// Mirrors the options Shiki's JS engine uses, so token output stays comparable.
export const convertOptions = (target: Target) =>
  ({
    global: true,
    hasIndices: true,
    target,
    rules: {
      allowOrphanBackrefs: true,
      asciiWordBoundaries: true,
      captureGroup: true,
      recursionLimit: 5,
      singleline: true,
    },
  }) satisfies ToRegExpOptions

export type Conversion =
  | { ok: true; pattern: string; flags: string; strategy: boolean; captureMap: boolean }
  | { ok: false; error: string }

export const convert = (source: string, target: Target): Conversion => {
  try {
    const details = toRegExpDetails(source, convertOptions(target))
    return {
      ok: true,
      pattern: details.pattern,
      flags: details.flags,
      strategy: Boolean(details.options?.strategy),
      captureMap: Boolean(details.options?.hiddenCaptures?.length || details.options?.transfers?.length),
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
