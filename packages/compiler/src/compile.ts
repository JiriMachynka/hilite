import { Kind, RULE_STRIDE, Slot } from '@hilite/core/format'
import type { Cap, Lang } from '@hilite/core/format'
import { createRegexPool } from './regex-pool.ts'
import type { RawCaptures, RawGrammar, RawRule } from './grammar.ts'

interface Include {
  scope: string | null
  name: string | null
}

const parseInclude = (include: string): Include => {
  if (include === '$base' || include === '$self') return { scope: null, name: include }
  if (include.startsWith('#')) return { scope: null, name: include.slice(1) }
  const hash = include.indexOf('#')
  return hash === -1 ? { scope: include, name: null } : { scope: include.slice(0, hash), name: include.slice(hash + 1) }
}

export interface CompileContext {
  /** Scope names of every grammar that can be linked against. */
  /** Whether `repository[name]` (or the grammar itself when `name` is null) exists in the grammar for `scopeName`. */
  hasRule: (scopeName: string, name: string | null) => boolean
  /** Repository names other grammars include from this one. */
  neededExports: Set<string>
}

interface Draft {
  kind: Kind
  name: string | undefined
  contentName: string | undefined
  regex: number
  regex2: number
  caps: (Cap | null)[] | null
  caps2: (Cap | null)[] | null
  patterns: number[] | null
  hasMissing: boolean
  applyEndPatternLast: boolean
}

type Repository = Record<string, RawRule>

const zeros = (n: number) => Array.from({ length: n }, () => 0)

export const compileGrammar = (grammar: RawGrammar, context: CompileContext) => {
  const pool = createRegexPool()
  const drafts: (Draft | undefined)[] = [undefined]
  const idOf = new Map<RawRule, number>()
  const externals: [string, string][] = []
  const externalIndex = new Map<string, number>()

  const root: RawRule = { patterns: grammar.patterns, name: grammar.scopeName }
  const baseRepository: Repository = { ...grammar.repository, $self: root, $base: root }

  const externalRef = (scope: string, name: string | null) => {
    const key = `${scope}#${name ?? ''}`
    let index = externalIndex.get(key)
    if (index === undefined) {
      index = externals.push([scope, name ?? '']) - 1
      externalIndex.set(key, index)
    }
    return -(index + 1)
  }

  const compilePatterns = (patterns: RawRule[] | undefined, repository: Repository) => {
    const ids: number[] = []
    for (const pattern of patterns ?? []) {
      let id = 0
      if (pattern.include) {
        const ref = parseInclude(pattern.include)
        // `$base` is whichever grammar the tokenizer was started with, so it is resolved when linking.
        if (ref.name === '$base' && ref.scope === null) id = externalRef('$base', null)
        else if (ref.scope === null || ref.scope === grammar.scopeName) {
          const target = repository[ref.name ?? '$self']
          if (target) id = compileRule(target, repository)
        } else if (context.hasRule(ref.scope, ref.name)) {
          id = externalRef(ref.scope, ref.name)
        }
      } else {
        id = compileRule(pattern, repository)
      }
      if (!id) continue
      const rule = id > 0 ? drafts[id] : undefined
      if (rule && rule.kind !== Kind.Match && rule.hasMissing && rule.patterns!.length === 0) continue
      ids.push(id)
    }
    return { ids, hasMissing: (patterns?.length ?? 0) !== ids.length }
  }

  const names: string[] = []
  const nameId = new Map<string, number>()
  const internName = (name: string | undefined) => {
    if (!name) return 0
    let id = nameId.get(name)
    if (id === undefined) {
      id = names.push(name)
      nameId.set(name, id)
    }
    return id
  }

  const compileCaptures = (captures: RawCaptures | undefined, repository: Repository) => {
    if (!captures) return null
    const entries = Object.entries(captures).filter(([key, capture]) => capture && /^\d+$/.test(key))
    const table: (Cap | null)[] = Array.from(
      { length: Math.max(-1, ...entries.map(([key]) => parseInt(key, 10))) + 1 },
      () => null,
    )
    for (const [key, capture] of entries) {
      const retokenize = capture.patterns ? compileRule(capture, repository) : 0
      table[parseInt(key, 10)] = [internName(capture.name), internName(capture.contentName), retokenize]
    }
    return table
  }

  const compileRule = (desc: RawRule, repository: Repository): number => {
    const known = idOf.get(desc)
    if (known !== undefined) return known
    const id = drafts.push(undefined) - 1
    idOf.set(desc, id)

    const base = {
      name: desc.name,
      contentName: desc.contentName,
      regex: 0,
      regex2: 0,
      caps: null,
      caps2: null,
      patterns: null,
      hasMissing: false,
      applyEndPatternLast: false,
    }
    if (desc.match) {
      drafts[id] = {
        ...base,
        kind: Kind.Match,
        regex: pool.add(desc.match, false),
        caps: compileCaptures(desc.captures, repository),
      }
    } else if (typeof desc.begin === 'undefined') {
      const scoped = desc.repository ? { ...repository, ...desc.repository } : repository
      const patterns = desc.patterns ?? (desc.include ? [{ include: desc.include }] : undefined)
      const compiled = compilePatterns(patterns, scoped)
      drafts[id] = { ...base, kind: Kind.Include, patterns: compiled.ids, hasMissing: compiled.hasMissing }
    } else if (desc.while) {
      const caps = compileCaptures(desc.beginCaptures ?? desc.captures, repository)
      const caps2 = compileCaptures(desc.whileCaptures ?? desc.captures, repository)
      const compiled = compilePatterns(desc.patterns, repository)
      drafts[id] = {
        ...base,
        kind: Kind.BeginWhile,
        regex: pool.add(desc.begin, false),
        regex2: pool.add(desc.while, true),
        caps,
        caps2,
        patterns: compiled.ids,
        hasMissing: compiled.hasMissing,
      }
    } else {
      const caps = compileCaptures(desc.beginCaptures ?? desc.captures, repository)
      const caps2 = compileCaptures(desc.endCaptures ?? desc.captures, repository)
      const compiled = compilePatterns(desc.patterns, repository)
      drafts[id] = {
        ...base,
        kind: Kind.BeginEnd,
        regex: pool.add(desc.begin, false),
        regex2: pool.add(desc.end ? desc.end : '￿', true),
        caps,
        caps2,
        patterns: compiled.ids,
        hasMissing: compiled.hasMissing,
        applyEndPatternLast: Boolean(desc.applyEndPatternLast),
      }
    }
    return id
  }

  const rootId = compileRule(root, baseRepository)
  const exports: Record<string, number> = { '': rootId }
  for (const name of context.neededExports) {
    const desc = grammar.repository?.[name]
    if (desc) exports[name] = compileRule(desc, baseRepository)
  }

  const injections: [string, number][] = Object.entries(grammar.injections ?? {}).map(([selector, rule]) => [
    selector,
    compileRule(rule, baseRepository),
  ])

  // Skip nameless single-child includes, but keep ones that wrap begin/end or while:
  // compiling those means "inside the block", collecting them as a child means their begin.
  const forward = new Map<number, number>()
  drafts.forEach((draft, id) => {
    if (
      draft &&
      id !== rootId &&
      draft.kind === Kind.Include &&
      !draft.name &&
      !draft.contentName &&
      draft.patterns!.length === 1
    ) {
      const childId = draft.patterns![0]!
      const child = childId > 0 ? drafts[childId] : undefined
      if (child && (child.kind === Kind.Include || child.kind === Kind.Match)) forward.set(id, childId)
    }
  })
  const skip = (id: number) => {
    for (let hops = 0; id > 0 && forward.has(id) && hops < 64; hops++) id = forward.get(id)!
    return id
  }
  const live = new Map<number, number>()
  const order: number[] = []
  const visit = (id: number) => {
    id = skip(id)
    if (id <= 0 || live.has(id)) return
    live.set(id, order.push(id))
    const draft = drafts[id]!
    draft.patterns?.forEach(visit)
    for (const table of [draft.caps, draft.caps2]) for (const cap of table ?? []) if (cap?.[2]) visit(cap[2])
  }
  visit(rootId)
  Object.values(exports).forEach(visit)
  injections.forEach(([, id]) => visit(id))
  const renumber = (id: number) => {
    id = skip(id)
    return id > 0 ? live.get(id)! : id
  }
  const renumberCap = (cap: Cap | null): Cap | null => cap && [cap[0], cap[1], cap[2] ? renumber(cap[2]) : 0]
  const kept = order.map((id) => {
    const draft = drafts[id]!
    return {
      ...draft,
      patterns: draft.patterns && draft.patterns.map(renumber),
      caps: draft.caps && draft.caps.map(renumberCap),
      caps2: draft.caps2 && draft.caps2.map(renumberCap),
    }
  })
  for (const key of Object.keys(exports)) exports[key] = renumber(exports[key]!)
  injections.forEach((entry) => (entry[1] = renumber(entry[1])))

  // Tables are interned after the whole grammar is compiled so ids stay dense.
  const lists: number[][] = [[]]
  const listId = new Map<string, number>([['', 0]])
  const internList = (list: number[] | null) => {
    if (!list || list.length === 0) return 0
    const key = list.join(',')
    let id = listId.get(key)
    if (id === undefined) {
      id = lists.push(list) - 1
      listId.set(key, id)
    }
    return id
  }

  const caps: (Cap | null)[][] = [[]]
  const capsId = new Map<string, number>([['[]', 0]])
  const internCaps = (table: (Cap | null)[] | null) => {
    if (!table || table.length === 0) return 0
    const key = JSON.stringify(table)
    let id = capsId.get(key)
    if (id === undefined) {
      id = caps.push(table) - 1
      capsId.set(key, id)
    }
    return id
  }

  const rules = zeros(RULE_STRIDE)
  for (const draft of kept) {
    const record = zeros(RULE_STRIDE)
    record[Slot.Kind] = draft.kind
    record[Slot.Name] = internName(draft.name)
    record[Slot.ContentName] = internName(draft.contentName)
    record[Slot.Regex] = draft.regex
    record[Slot.Regex2] = draft.regex2
    record[Slot.Caps] = internCaps(draft.caps)
    record[Slot.Caps2] = internCaps(draft.caps2)
    record[Slot.Patterns] = internList(draft.patterns) * 2 + (draft.applyEndPatternLast ? 1 : 0)
    rules.push(...record)
  }

  const lang: Lang = {
    scope: grammar.scopeName,
    deps: [...new Set(externals.map(([scope]) => scope))].filter((scope) => scope !== '$base'),
    names,
    regexes: pool.regexes,
    convs: pool.convs,
    rules,
    lists,
    caps,
    externals,
    exports,
    injections,
  }
  return { lang, failures: pool.failures }
}
