import { createRegistry } from '@hilite/compiler'
import type { RawGrammar } from '@hilite/compiler'
import { hiliteFrom } from '../src/lib/hilite.ts'
import { normalize } from '../src/lib/diff.ts'
import { referenceFrom } from '../src/lib/reference.ts'

export type Inline = RawGrammar & { injectTo?: string[] }

/** Tokenize with Hilite and with Shiki+Oniguruma on the same tiny grammars. */
export const both = async (grammars: Inline[], root: string, code: string) => {
  const registry = createRegistry(
    grammars.map((grammar) => ({ name: grammar.name, grammar, injectTo: grammar.injectTo ?? [] })),
  )
  const bundle = grammars.map((g) => g.name)
  const reference = await referenceFrom(root, registry, bundle)
  try {
    return {
      want: reference.tokenize(code).map(normalize),
      got: hiliteFrom(registry, root, bundle).tokenize(code).map(normalize),
    }
  } finally {
    reference.dispose()
  }
}

export const grammar = (name: string, patterns: RawGrammar['patterns'], rest: Partial<Inline> = {}): Inline => ({
  name,
  scopeName: `source.${name}`,
  patterns,
  ...rest,
})
