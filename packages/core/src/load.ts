import { decode } from './decode.ts'
import { addLang, createGrammar, createRegistry } from './tokenizer.ts'
import type { Grammar } from './tokenizer.ts'

interface LangModule {
  default: string
}

export interface LoaderOptions {
  /** One `import()` per language, as written by the compiler's `langs/index.js`. */
  langs: Record<string, () => Promise<LangModule>>
  /** Language name -> everything it needs (`deps.js`). */
  deps?: Record<string, string[]>
  /** Alternate names (`aliases.js`). */
  aliases?: Record<string, string>
}

/** Loads languages on demand, each as its own chunk, and hands out grammars ready to tokenize. */
export const createLoader = ({ langs, deps = {}, aliases = {} }: LoaderOptions) => {
  const registry = createRegistry()
  const scopes = new Map<string, string>()
  const grammars = new Map<string, Grammar>()
  const modules = new Map<string, Promise<string>>()
  const text = (name: string) => {
    let promise = modules.get(name)
    if (!promise) {
      const load = langs[name]
      if (!load) throw new Error(`unknown language "${name}"`)
      modules.set(name, (promise = load().then((module) => module.default)))
    }
    return promise
  }

  return {
    registry,
    /** Grammar for a language name or alias; loads the language and what it includes first. */
    grammar: async (input: string) => {
      const name = aliases[input] ?? input
      let grammar = grammars.get(name)
      if (grammar) return grammar
      const needed = [...(deps[name] ?? []), name]
      // Fetch in parallel, link in dependency order so injections keep a stable order.
      const blobs = await Promise.all(needed.map(text))
      needed.forEach((member, index) => {
        if (scopes.has(member)) return
        const lang = decode(blobs[index]!)
        scopes.set(member, lang.scope)
        addLang(registry, lang)
      })
      grammar = createGrammar(registry, scopes.get(name)!)!
      grammars.set(name, grammar)
      return grammar
    },
  }
}
