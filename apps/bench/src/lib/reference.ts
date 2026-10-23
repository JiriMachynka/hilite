import { bundleOf } from '@hilite/compiler'
import type { Registry as Sources } from '@hilite/compiler'
import { createHighlighterCore } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'
import { sources } from './hilite.ts'

const engine = createOnigurumaEngine(import('shiki/wasm'))

/** The same raw grammars Hilite compiles, handed to Shiki, so both sides see one language bundle. */
export const shikiLangs = (lang: string, registry: Sources = sources, bundle = bundleOf(registry, lang)) =>
  bundle.map((name) => {
    const source = registry.sources.get(name)!
    return { ...source.grammar, repository: source.grammar.repository ?? {}, name, injectTo: source.injectTo }
  })

export interface Seg {
  start: number
  end: number
  scopes: string[]
}

export const referenceFrom = async (lang: string, registry: Sources = sources, bundle = bundleOf(registry, lang)) => {
  const highlighter = await createHighlighterCore({
    themes: [import('@shikijs/themes/github-dark')],
    langs: shikiLangs(lang, registry, bundle),
    engine,
  })
  return {
    dispose: () => highlighter.dispose(),
    tokenize: (code: string): Seg[][] =>
      highlighter.codeToTokensBase(code, { lang, theme: 'github-dark', includeExplanation: 'scopeName' }).map((line) =>
        line.flatMap((token) => {
          const base = line[0]!.offset
          let at = token.offset - base
          return (token.explanation ?? []).map((part) => {
            const seg = { start: at, end: at + part.content.length, scopes: part.scopes.map((s) => s.scopeName) }
            at = seg.end
            return seg
          })
        }),
      ),
  }
}

export const referenceFor = (lang: string) => referenceFrom(lang)
