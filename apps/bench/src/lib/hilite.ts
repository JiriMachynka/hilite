import { bundleOf, compileLanguage, loadRegistry } from '@hilite/compiler'
import type { Registry as Sources } from '@hilite/compiler'
import { addLang, createGrammar, createRegistry, decode, scopeName, tokenizeLine } from '@hilite/core'
import type { Frame } from '@hilite/core'

export const sources = await loadRegistry()

const compiled = new Map<Sources, Map<string, string>>()
const encodedOf = (registry: Sources, name: string) => {
  let texts = compiled.get(registry)
  if (!texts) compiled.set(registry, (texts = new Map()))
  let text = texts.get(name)
  if (!text) {
    text = compileLanguage(registry, name).text
    texts.set(name, text)
  }
  return text
}

/** Hilite for one language of a grammar set, with the language's whole bundle linked. */
export const hiliteFrom = (registry: Sources, lang: string, bundle = bundleOf(registry, lang)) => {
  const reg = createRegistry()
  for (const member of bundle) addLang(reg, decode(encodedOf(registry, member)))
  const grammar = createGrammar(reg, registry.sources.get(lang)!.grammar.scopeName)!
  const tokens = (code: string) => {
    let state: Frame | null = null
    return code.split(/\r?\n/).map((line) => {
      if (line === '') return []
      const result = tokenizeLine(grammar, line, state)
      state = result.state
      return result.tokens
    })
  }
  return {
    tokens,
    tokenize: (code: string) =>
      tokens(code).map((line) => line.map((t) => ({ start: t.start, end: t.end, scopes: t.scopeIds.map(scopeName) }))),
  }
}

export const hiliteFor = (lang: string) => hiliteFrom(sources, lang)
