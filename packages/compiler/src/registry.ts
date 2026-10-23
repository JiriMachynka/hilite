import { grammars } from 'tm-grammars'
import { listGrammarNames, loadGrammar } from './grammar.ts'
import type { RawGrammar, RawRule } from './grammar.ts'

export interface Source {
  name: string
  grammar: RawGrammar
  injectTo: string[]
}

const includeScope = (include: string) => {
  if (include.startsWith('#') || include === '$self' || include === '$base') return null
  const hash = include.indexOf('#')
  return hash === -1 ? { scope: include, name: '' } : { scope: include.slice(0, hash), name: include.slice(hash + 1) }
}

const walkIncludes = (grammar: RawGrammar, visit: (include: string) => void) => {
  const rule = (node: RawRule | null) => {
    if (!node) return
    if (node.include) visit(node.include)
    for (const key of ['captures', 'beginCaptures', 'endCaptures', 'whileCaptures'] as const) {
      const captures = node[key]
      if (captures) for (const capture of Object.values(captures)) rule(capture)
    }
    node.patterns?.forEach(rule)
    if (node.repository) Object.values(node.repository).forEach(rule)
  }
  grammar.patterns.forEach(rule)
  if (grammar.repository) Object.values(grammar.repository).forEach(rule)
  if (grammar.injections) Object.values(grammar.injections).forEach(rule)
}

/** Index a set of grammars: which repository entries other grammars include, and who depends on whom. */
export const createRegistry = (list: Source[]) => {
  const sources = new Map(list.map((source) => [source.name, source]))
  const byScope = new Map(list.map((source) => [source.grammar.scopeName, source]))

  // Which repository entries other grammars pull in, so a blob only keeps rules someone can reach.
  const needed = new Map<string, Set<string>>()
  const dependsOn = new Map<string, Set<string>>()
  for (const source of sources.values()) {
    const deps = new Set<string>()
    walkIncludes(source.grammar, (include) => {
      const ref = includeScope(include)
      if (!ref || ref.scope === source.grammar.scopeName || !byScope.has(ref.scope)) return
      deps.add(ref.scope)
      let set = needed.get(ref.scope)
      if (!set) needed.set(ref.scope, (set = new Set()))
      if (ref.name) set.add(ref.name)
    })
    dependsOn.set(source.name, deps)
  }
  return { sources, byScope, needed, dependsOn }
}

// The package index only lists the 242 public grammars; the injection-only ones exist as files alone.
export const loadRegistry = async () => {
  const list = await Promise.all(
    listGrammarNames().map(async (name) => {
      const grammar = await loadGrammar(name)
      const raw: RawGrammar & { injectTo?: string[] } = grammar
      return { name, grammar, injectTo: raw.injectTo ?? [] }
    }),
  )
  return createRegistry(list)
}

export type Registry = ReturnType<typeof createRegistry>

const prefixed = (scope: string, target: string) => scope === target || scope.startsWith(`${target}.`)

/** A language plus everything it needs at runtime, dependencies first. */
export const bundleOf = (registry: Registry, name: string) => {
  const sorted: string[] = []
  const seen = new Set<string>()
  const emit = (current: string) => {
    if (seen.has(current)) return
    seen.add(current)
    for (const scope of registry.dependsOn.get(current) ?? []) emit(registry.byScope.get(scope)!.name)
    if (current === name) {
      const { scopeName } = registry.sources.get(name)!.grammar
      const info = grammars.find((g) => g.name === name)
      for (const other of registry.sources.values()) {
        if (info?.embedded?.includes(other.name) && other.injectTo.some((t) => prefixed(scopeName, t))) emit(other.name)
      }
    }
    sorted.push(current)
  }
  emit(name)
  return sorted
}

/** What `compileGrammar` needs to know about the other grammars. */
export const contextFor = (registry: Registry, name: string) => {
  const source = registry.sources.get(name)!
  return {
    hasRule: (scope: string, rule: string | null) => {
      const target = registry.byScope.get(scope)
      return Boolean(target && (rule === null || target.grammar.repository?.[rule]))
    },
    neededExports: registry.needed.get(source.grammar.scopeName) ?? new Set<string>(),
  }
}
