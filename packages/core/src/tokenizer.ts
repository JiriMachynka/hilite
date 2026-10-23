import { Kind, Mode, RULE_STRIDE, Slot } from './format.ts'
import type { Conv, Lang, Regex } from './format.ts'
import { parseSelector } from './selector.ts'
import { emptyScope, pushScope, scopeNames } from './scopes.ts'
import type { Scope } from './scopes.ts'

export interface Token {
  start: number
  end: number
  /** Scope string ids, outermost first. Shared between tokens, do not mutate. */
  scopeIds: number[]
}

export interface Registry {
  langs: Map<string, Lang>
}

/** A language as seen from one root grammar: `$base` and rule caches belong to that root. */
export interface Linked {
  lang: Lang
  grammar: Grammar
  rules: (Rule | undefined)[]
}

export interface Rule {
  linked: Linked
  id: number
  kind: Kind
  name: string | null
  contentName: string | null
  nameDynamic: boolean
  contentDynamic: boolean
  regex: Regex | null
  regex2: Regex | null
  applyEndPatternLast: boolean
  caps?: (CapRule | null)[]
  caps2?: (CapRule | null)[]
  leaves?: Rule[]
  scanners: Map<string, Scanner>
}

/** What one capture group does: scope names and, optionally, a rule to run over the captured text. */
export interface CapRule {
  linked: Linked
  name: string | null
  contentName: string | null
  nameDynamic: boolean
  contentDynamic: boolean
  retokenize: number
  rule?: Rule | null
}

export interface Frame {
  parent: Frame | null
  rule: Rule
  enterPos: number
  anchorPos: number
  capturedEOL: boolean
  /** Begin-capture text substituted into the end/while pattern. */
  endValues: string[] | null
  nameScopes: Scope
  contentScopes: Scope
}

export interface Injection {
  matches: (scopes: string[]) => boolean
  rule: Rule
  priority: number
}

export interface Grammar {
  registry: Registry
  /** Set once the root language is linked; `$base` rules read it lazily. */
  root: Rule | null
  injections: Injection[]
  linked: Map<string, Linked>
  bulks: Map<string, Bulk>
}

// Capture indices are flat [start0, end0, start1, end1, ...] with -1 for groups that did not take part.
type Indices = number[]

const END = 1
const WHILE = 2

interface Alt {
  index: number
  rule: Rule | null
  /** 0 begin/match, END, WHILE */
  role: number
  conv: Conv
  captures: boolean
  exact?: RegExp
  search?: RegExp
}

/** Alternatives tried together. Rules with the same child patterns share one, whatever their end pattern is. */
interface Bulk {
  fast: Alt[]
  slow: Alt[]
  offsets: number[]
  combined: RegExp | null
}

/** Bulks in priority order: an end pattern before the children, or after them with applyEndPatternLast. */
type Scanner = Bulk[]

export const createRegistry = (): Registry => ({ langs: new Map() })

export const addLang = (registry: Registry, lang: Lang) => {
  registry.langs.set(lang.scope, lang)
}

const linkOf = (grammar: Grammar, scope: string) => {
  let linked = grammar.linked.get(scope)
  if (!linked) {
    const lang = grammar.registry.langs.get(scope)
    if (!lang) return undefined
    grammar.linked.set(scope, (linked = { lang, grammar, rules: [] }))
  }
  return linked
}

const dynamicName = /\$(\d+)|\$\{(\d+):\/(downcase|upcase)\}/g

const isDynamic = (text: string | null) => text !== null && /\$\d|\$\{\d/.test(text)

const ruleAt = (linked: Linked, id: number): Rule | undefined => {
  if (id < 0) {
    const [scope, name] = linked.lang.externals[-id - 1]!
    if (scope === '$base') return linked.grammar.root ?? undefined
    const target = linkOf(linked.grammar, scope)
    const targetId = target?.lang.exports[name]
    return targetId ? ruleAt(target!, targetId) : undefined
  }
  const known = linked.rules[id]
  if (known) return known
  const { lang } = linked
  const slot = (s: Slot) => lang.rules[id * RULE_STRIDE + s]!
  const kind: Kind = slot(Slot.Kind)
  const name = slot(Slot.Name) ? lang.names[slot(Slot.Name) - 1]! : null
  const contentName = slot(Slot.ContentName) ? lang.names[slot(Slot.ContentName) - 1]! : null
  return (linked.rules[id] = {
    linked,
    id,
    kind,
    name,
    contentName,
    nameDynamic: isDynamic(name),
    contentDynamic: isDynamic(contentName),
    regex: slot(Slot.Regex) ? lang.regexes[slot(Slot.Regex)]! : null,
    regex2: slot(Slot.Regex2) ? lang.regexes[slot(Slot.Regex2)]! : null,
    applyEndPatternLast: Boolean(slot(Slot.Patterns) & 1),
    scanners: new Map(),
  })
}

const slotOf = (rule: Rule, slot: Slot) => rule.linked.lang.rules[rule.id * RULE_STRIDE + slot]!

const captureTable = (rule: Rule, slot: Slot.Caps | Slot.Caps2): (CapRule | null)[] =>
  rule.linked.lang.caps[slotOf(rule, slot)]!.map((cap) => {
    if (!cap) return null
    const name = cap[0] ? rule.linked.lang.names[cap[0] - 1]! : null
    const contentName = cap[1] ? rule.linked.lang.names[cap[1] - 1]! : null
    return {
      linked: rule.linked,
      name,
      contentName,
      nameDynamic: isDynamic(name),
      contentDynamic: isDynamic(contentName),
      retokenize: cap[2],
    }
  })

const retokenizeOf = (capture: CapRule) => {
  if (capture.rule === undefined)
    capture.rule = capture.retokenize ? (ruleAt(capture.linked, capture.retokenize) ?? null) : null
  return capture.rule
}

const collect = (rule: Rule, out: Rule[], seen: Set<Rule>) => {
  if (seen.has(rule)) return
  seen.add(rule)
  if (rule.kind === Kind.Include) {
    for (const id of rule.linked.lang.lists[slotOf(rule, Slot.Patterns) >> 1]!) {
      const child = ruleAt(rule.linked, id)
      if (child) collect(child, out, seen)
    }
  } else out.push(rule)
}

const leavesOf = (owner: Rule) => {
  if (!owner.leaves) {
    const out: Rule[] = []
    const seen = new Set<Rule>()
    if (owner.kind === Kind.Match) out.push(owner)
    else
      for (const id of owner.linked.lang.lists[slotOf(owner, Slot.Patterns) >> 1]!) {
        const child = ruleAt(owner.linked, id)
        if (child) collect(child, out, seen)
      }
    owner.leaves = out
  }
  return owner.leaves
}

const hasEntries = (table: (CapRule | null)[]) => table.some(Boolean)

const convOf = (regex: Regex, linked: Linked, allowA: boolean, allowG: boolean) =>
  linked.lang.convs[regex.conv.length === 1 ? regex.conv[0]! : regex.conv[(allowG ? 2 : 0) + (allowA ? 1 : 0)]!]!

const escapeText = (text: string) => text.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&').replace(/-/g, '\\x2d')

const fill = (conv: Conv, values: string[]): Conv => ({
  ...conv,
  src: conv.src.replace(/[\uE000-\uE0FF]/g, (ch) => escapeText(values[ch.charCodeAt(0) - 0xe000] ?? '')),
})

const shiftRefs = (src: string, offset: number) =>
  src.replace(/\\(?:([1-9]\d*)|[^])/g, (all, n: string | undefined) => (n ? `(?:\\${Number(n) + offset})` : all))

// Only plain searching `u` alternatives can share the combined regex, which runs with `gu` alone.
const combinable = (conv: Conv) => conv.mode === Mode.Search && !conv.set && !conv.fold

const buildBulk = (alts: Alt[]): Bulk => {
  const live = alts.filter((alt) => alt.conv.src !== '(?!)')
  // A lone alternative gains nothing from a combined regex, and its own regex already reports groups.
  const lone = live.length === 1
  const fast = lone ? [] : live.filter((alt) => combinable(alt.conv))
  const offsets: number[] = []
  let source = ''
  let group = 1
  for (const alt of fast) {
    offsets.push(group)
    source += `${source ? '|' : ''}(${alt.conv.refs ? shiftRefs(alt.conv.src, group) : alt.conv.src})`
    group += 1 + alt.conv.groups
  }
  return {
    fast,
    slow: lone ? live : live.filter((alt) => !combinable(alt.conv)),
    offsets,
    combined: source ? new RegExp(source, 'gu') : null,
  }
}

const toIndices = (found: RegExpIndicesArray, conv: Conv, shift: number): Indices => {
  const out: Indices = []
  const group = (raw: number) => {
    const span = found[raw]
    out.push(span ? span[0] + shift : -1, span ? span[1] + shift : -1)
  }
  if (!conv.map) for (let i = 0; i < found.length; i++) group(i)
  else {
    group(0)
    for (const raws of conv.map) {
      let chosen = raws[0]!
      for (const raw of raws) if (found[raw]) chosen = raw
      group(chosen)
    }
  }
  return out
}

interface Hit {
  alt: Alt
  indices: Indices
}

const flagsOf = (conv: Conv) => `${conv.fold ? 'i' : ''}${conv.set ? 'v' : 'u'}`

/** Run one alternative on its own, either anchored at `start` or searching forward from it. */
const runAlt = (alt: Alt, text: string, start: number, search: boolean): Indices | null => {
  const { conv } = alt
  if (conv.mode === Mode.Clip) {
    alt.search ??= new RegExp(conv.src, `dg${flagsOf(conv)}`)
    alt.search.lastIndex = 0
    const found = alt.search.exec(text.slice(start))
    return found ? toIndices(found.indices!, conv, start) : null
  }
  const re = search
    ? (alt.search ??= new RegExp(conv.src, `dg${flagsOf(conv)}`))
    : (alt.exact ??= new RegExp(conv.src, `dy${flagsOf(conv)}`))
  re.lastIndex = start
  const found = re.exec(text)
  return found ? toIndices(found.indices!, conv, 0) : null
}

const scanBulk = (bulk: Bulk, text: string, pos: number): Hit | null => {
  let best: Alt | null = null
  let bestIndices: Indices | null = null
  if (bulk.combined) {
    const re = bulk.combined
    re.lastIndex = pos
    const found = re.exec(text)
    if (found) {
      const { offsets, fast } = bulk
      let k = 0
      while (found[offsets[k]!] === undefined) k++
      best = fast[k]!
      bestIndices = [found.index, found.index + found[0].length]
    }
  }
  for (const alt of bulk.slow) {
    if (best && bestIndices![0] === pos && alt.index > best.index) continue
    const indices = runAlt(alt, text, pos, alt.conv.mode === Mode.Search)
    if (!indices) continue
    if (!best || indices[0]! < bestIndices![0]! || (indices[0] === bestIndices![0] && alt.index < best.index)) {
      best = alt
      bestIndices = indices
    }
  }
  if (!best) return null
  // The combined regex only reports the overall span; groups cost a second, anchored run of the winner.
  if (best.captures && combinable(best.conv)) bestIndices = runAlt(best, text, bestIndices![0]!, false)!
  return { alt: best, indices: bestIndices! }
}

const scan = (scanner: Scanner, text: string, pos: number): Hit | null => {
  let best: Hit | null = null
  for (const bulk of scanner) {
    const hit = scanBulk(bulk, text, pos)
    if (!hit) continue
    // Parts are in priority order, so only a strictly earlier start beats what we have.
    if (!best || hit.indices[0]! < best.indices[0]!) best = hit
    if (best.indices[0] === pos) break
  }
  return best
}

const bulkFor = (grammar: Grammar, leaves: Rule[], allowA: boolean, allowG: boolean) => {
  const key = `${allowA ? 1 : 0}${allowG ? 1 : 0}${leaves.map((leaf) => `${leaf.linked.lang.scope}:${leaf.id}`).join()}`
  let bulk = grammar.bulks.get(key)
  if (!bulk) {
    const alts: Alt[] = []
    for (const leaf of leaves) {
      if (!leaf.regex) continue
      leaf.caps ??= captureTable(leaf, Slot.Caps)
      const captures = hasEntries(leaf.caps) || leaf.nameDynamic || leaf.contentDynamic || Boolean(leaf.regex2?.refs)
      alts.push({
        index: alts.length,
        rule: leaf,
        role: 0,
        conv: convOf(leaf.regex, leaf.linked, allowA, allowG),
        captures,
      })
    }
    grammar.bulks.set(key, (bulk = buildBulk(alts)))
  }
  return bulk
}

const scannerFor = (owner: Rule, values: string[] | null, allowA: boolean, allowG: boolean, role: number) => {
  const key = `${role}${allowA ? 1 : 0}${allowG ? 1 : 0}${values ? values.join('\0') : ''}`
  let scanner = owner.scanners.get(key)
  if (scanner) return scanner
  const edge = (regexRole: number, table: Slot.Caps2) => {
    owner.caps2 ??= captureTable(owner, table)
    let conv = convOf(owner.regex2!, owner.linked, allowA, allowG)
    if (owner.regex2!.refs && values) conv = fill(conv, values)
    return buildBulk([{ index: 0, rule: null, role: regexRole, conv, captures: hasEntries(owner.caps2) }])
  }
  if (role === WHILE) scanner = [edge(WHILE, Slot.Caps2)]
  else {
    const children = bulkFor(owner.linked.grammar, leavesOf(owner), allowA, allowG)
    const end = owner.kind === Kind.BeginEnd ? edge(END, Slot.Caps2) : null
    scanner = !end ? [children] : owner.applyEndPatternLast ? [children, end] : [end, children]
  }
  if (owner.scanners.size > 64) owner.scanners.clear()
  owner.scanners.set(key, scanner)
  return scanner
}

const interpolate = (template: string, text: string, indices: Indices) =>
  template.replace(
    dynamicName,
    (all, plain: string | undefined, braced: string | undefined, command: string | undefined) => {
      const n = Number(plain ?? braced)
      const start = indices[2 * n]
      if (start === undefined) return all
      // A group that did not take part counts as empty, like a zero-width capture.
      let value = start < 0 ? '' : text.slice(start, indices[2 * n + 1])
      while (value[0] === '.') value = value.slice(1)
      return command === 'downcase' ? value.toLowerCase() : command === 'upcase' ? value.toUpperCase() : value
    },
  )

const nameOf = (name: string | null, dynamic: boolean, text: string | null, indices: Indices | null) =>
  dynamic && name && text !== null && indices ? interpolate(name, text, indices) : name

const frame = (
  parent: Frame | null,
  rule: Rule,
  enterPos: number,
  anchorPos: number,
  capturedEOL: boolean,
  endValues: string[] | null,
  nameScopes: Scope,
  contentScopes: Scope,
): Frame => ({ parent, rule, enterPos, anchorPos, capturedEOL, endValues, nameScopes, contentScopes })

const withContent = (f: Frame, contentScopes: Scope): Frame =>
  f.contentScopes === contentScopes
    ? f
    : frame(f.parent, f.rule, f.enterPos, f.anchorPos, f.capturedEOL, f.endValues, f.nameScopes, contentScopes)

const hasSameRuleAs = (f: Frame, other: Frame) => {
  for (let el: Frame | null = f; el && el.enterPos === other.enterPos; el = el.parent)
    if (el.rule === other.rule) return true
  return false
}

interface LineTokens {
  list: Token[]
  last: number
}

const produce = (out: LineTokens, scope: Scope, end: number) => {
  if (out.last >= end) return
  out.list.push({ start: out.last, end, scopeIds: scope.ids })
  out.last = end
}

const handleCaptures = (
  grammar: Grammar,
  text: string,
  isFirstLine: boolean,
  stack: Frame,
  out: LineTokens,
  captures: (CapRule | null)[],
  indices: Indices,
) => {
  if (captures.length === 0) return
  const len = Math.min(captures.length, indices.length >> 1)
  const local: { scopes: Scope; end: number }[] = []
  const maxEnd = indices[1]!
  for (let i = 0; i < len; i++) {
    const capture = captures[i]
    if (!capture) continue
    const start = indices[2 * i]!
    const end = indices[2 * i + 1]!
    if (end - start <= 0) continue
    if (start > maxEnd) break
    while (local.length > 0 && local[local.length - 1]!.end <= start) {
      const top = local.pop()!
      produce(out, top.scopes, top.end)
    }
    if (local.length > 0) produce(out, local[local.length - 1]!.scopes, start)
    else produce(out, stack.contentScopes, start)

    const retokenize = retokenizeOf(capture)
    if (retokenize) {
      const nameScopes = pushScope(stack.contentScopes, nameOf(capture.name, capture.nameDynamic, text, indices))
      const contentScopes = pushScope(nameScopes, nameOf(capture.contentName, capture.contentDynamic, text, indices))
      const clone = frame(stack, retokenize, start, -1, false, null, nameScopes, contentScopes)
      tokenizeString(grammar, text.slice(0, end), isFirstLine && start === 0, start, clone, out, false, 0)
      continue
    }
    const name = nameOf(capture.name, capture.nameDynamic, text, indices)
    if (name !== null) {
      const base = local.length > 0 ? local[local.length - 1]!.scopes : stack.contentScopes
      local.push({ scopes: pushScope(base, name), end })
    }
  }
  while (local.length > 0) {
    const top = local.pop()!
    produce(out, top.scopes, top.end)
  }
}

const matchRule = (grammar: Grammar, text: string, isFirstLine: boolean, pos: number, stack: Frame, anchor: number) => {
  const { rule } = stack
  return scan(scannerFor(rule, stack.endValues, isFirstLine, pos === anchor, 0), text, pos)
}

const matchInjections = (
  grammar: Grammar,
  text: string,
  isFirstLine: boolean,
  pos: number,
  stack: Frame,
  anchor: number,
) => {
  let bestStart = Infinity
  let best: Hit | null = null
  let bestPriority = 0
  const scopes = scopeNames(stack.contentScopes)
  for (const injection of grammar.injections) {
    if (!injection.matches(scopes)) continue
    const hit = scan(scannerFor(injection.rule, null, isFirstLine, pos === anchor, 0), text, pos)
    if (!hit) continue
    const start = hit.indices[0]!
    if (start >= bestStart) continue
    bestStart = start
    best = hit
    bestPriority = injection.priority
    if (start === pos) break
  }
  return best ? { hit: best, priorityMatch: bestPriority === -1 } : null
}

const matchRuleOrInjections = (
  grammar: Grammar,
  text: string,
  isFirstLine: boolean,
  pos: number,
  stack: Frame,
  anchor: number,
) => {
  const result = matchRule(grammar, text, isFirstLine, pos, stack, anchor)
  if (grammar.injections.length === 0) return result
  const injected = matchInjections(grammar, text, isFirstLine, pos, stack, anchor)
  if (!injected) return result
  if (!result) return injected.hit
  const injectedStart = injected.hit.indices[0]!
  const resultStart = result.indices[0]!
  return injectedStart < resultStart || (injected.priorityMatch && injectedStart === resultStart)
    ? injected.hit
    : result
}

const checkWhileConditions = (
  grammar: Grammar,
  text: string,
  isFirstLine: boolean,
  pos: number,
  stack: Frame,
  out: LineTokens,
) => {
  let anchor = stack.capturedEOL ? 0 : -1
  const whiles: Frame[] = []
  for (let node: Frame | null = stack; node; node = node.parent)
    if (node.rule.kind === Kind.BeginWhile) whiles.push(node)
  for (let node = whiles.pop(); node; node = whiles.pop()) {
    const scanner = scannerFor(node.rule, node.endValues, isFirstLine, pos === anchor, WHILE)
    const hit = scan(scanner, text, pos)
    if (!hit) {
      stack = node.parent!
      break
    }
    const { indices } = hit
    produce(out, node.contentScopes, indices[0]!)
    node.rule.caps2 ??= captureTable(node.rule, Slot.Caps2)
    handleCaptures(grammar, text, isFirstLine, node, out, node.rule.caps2, indices)
    produce(out, node.contentScopes, indices[1]!)
    anchor = indices[1]!
    if (indices[1]! > pos) {
      pos = indices[1]!
      isFirstLine = false
    }
  }
  return { stack, pos, anchor, isFirstLine }
}

const tokenizeString = (
  grammar: Grammar,
  text: string,
  isFirstLine: boolean,
  pos: number,
  stack: Frame,
  out: LineTokens,
  checkWhile: boolean,
  deadline: number,
) => {
  const lineLength = text.length
  let anchor = -1
  if (checkWhile) {
    const checked = checkWhileConditions(grammar, text, isFirstLine, pos, stack, out)
    stack = checked.stack
    pos = checked.pos
    isFirstLine = checked.isFirstLine
    anchor = checked.anchor
  }

  for (let steps = 1; ; steps++) {
    // A hostile line can make every step slower than the last, so give up on the rest of it once the time is spent.
    if (deadline && (steps & 31) === 0 && performance.now() > deadline) {
      produce(out, stack.contentScopes, lineLength)
      return stack
    }
    const hit = matchRuleOrInjections(grammar, text, isFirstLine, pos, stack, anchor)
    if (!hit) {
      produce(out, stack.contentScopes, lineLength)
      return stack
    }
    const { alt, indices } = hit
    const matchStart = indices[0]!
    const matchEnd = indices[1]!
    const advanced = matchEnd > pos

    if (alt.role === END) {
      const popped = stack.rule
      produce(out, stack.contentScopes, matchStart)
      stack = withContent(stack, stack.nameScopes)
      popped.caps2 ??= captureTable(popped, Slot.Caps2)
      handleCaptures(grammar, text, isFirstLine, stack, out, popped.caps2, indices)
      produce(out, stack.contentScopes, matchEnd)
      const old = stack
      stack = stack.parent!
      anchor = old.anchorPos
      if (!advanced && old.enterPos === pos) {
        // The grammar pushed and popped a rule without moving; stop instead of looping forever.
        stack = old
        produce(out, stack.contentScopes, lineLength)
        return stack
      }
    } else {
      const rule = alt.rule!
      produce(out, stack.contentScopes, matchStart)
      const before = stack
      const nameScopes = pushScope(stack.contentScopes, nameOf(rule.name, rule.nameDynamic, text, indices))
      stack = frame(stack, rule, pos, anchor, matchEnd === lineLength, null, nameScopes, nameScopes)
      if (rule.kind === Kind.Match) {
        rule.caps ??= captureTable(rule, Slot.Caps)
        handleCaptures(grammar, text, isFirstLine, stack, out, rule.caps, indices)
        produce(out, stack.contentScopes, matchEnd)
        stack = stack.parent!
        if (!advanced) {
          stack = stack.parent ?? stack
          produce(out, stack.contentScopes, lineLength)
          return stack
        }
      } else {
        rule.caps ??= captureTable(rule, Slot.Caps)
        handleCaptures(grammar, text, isFirstLine, stack, out, rule.caps, indices)
        produce(out, stack.contentScopes, matchEnd)
        anchor = matchEnd
        const contentScopes = pushScope(nameScopes, nameOf(rule.contentName, rule.contentDynamic, text, indices))
        stack = withContent(stack, contentScopes)
        if (rule.regex2?.refs) {
          const count = indices.length >> 1
          stack.endValues = Array.from({ length: count }, (_, n) =>
            indices[2 * n]! < 0 ? '' : text.slice(indices[2 * n], indices[2 * n + 1]),
          )
        }
        if (!advanced && hasSameRuleAs(before, stack)) {
          stack = stack.parent!
          produce(out, stack.contentScopes, lineLength)
          return stack
        }
      }
    }
    if (matchEnd > pos) {
      pos = matchEnd
      isFirstLine = false
    }
  }
}

const reset = (stack: Frame) => {
  for (let el: Frame | null = stack; el; el = el.parent) {
    el.enterPos = -1
    el.anchorPos = -1
  }
}

export const createGrammar = (registry: Registry, scope: string): Grammar | undefined => {
  const grammar: Grammar = { registry, root: null, linked: new Map(), bulks: new Map(), injections: [] }
  const linked = linkOf(grammar, scope)
  const root = linked && ruleAt(linked, linked.lang.exports['']!)
  if (!linked || !root) return undefined
  grammar.root = root
  const add = (selector: string, rule: Rule) => {
    for (const { matches, priority } of parseSelector(selector)) grammar.injections.push({ matches, rule, priority })
  }
  for (const [selector, id] of linked.lang.injections) {
    const rule = ruleAt(linked, id)
    if (rule) add(selector, rule)
  }
  for (const other of registry.langs.values()) {
    if (!other.injectTo?.some((t) => scope === t || scope.startsWith(`${t}.`)) || !other.injectionSelector) continue
    const otherLinked = linkOf(grammar, other.scope)!
    const rule = ruleAt(otherLinked, other.exports['']!)
    if (rule) add(other.injectionSelector, rule)
  }
  grammar.injections.sort((a, b) => a.priority - b.priority)
  return grammar
}

export interface LineResult {
  tokens: Token[]
  state: Frame
}

/** `timeLimit` is in milliseconds for this one line; once it passes, the rest of the line is left with the scopes reached so far. 0 turns it off. It is only checked between regex matches, so one catastrophically backtracking match is not interrupted: run untrusted input in a worker. */
export const tokenizeLine = (grammar: Grammar, line: string, previous: Frame | null, timeLimit = 500): LineResult => {
  let stack = previous
  const isFirstLine = !previous
  if (stack) reset(stack)
  else {
    const scope = pushScope(emptyScope, grammar.root!.name)
    stack = frame(null, grammar.root!, -1, -1, false, null, scope, scope)
  }
  const text = `${line}\n`
  const out: LineTokens = { list: [], last: 0 }
  stack = tokenizeString(
    grammar,
    text,
    isFirstLine,
    0,
    stack,
    out,
    true,
    timeLimit > 0 ? performance.now() + timeLimit : 0,
  )

  // Drop the token that only covers the appended newline and clip the rest to the real line.
  const { list } = out
  if (list.length > 0 && list[list.length - 1]!.start === line.length) list.pop()
  for (const token of list) if (token.end > line.length) token.end = line.length
  return { tokens: list, state: stack }
}

export interface TokenizeOptions {
  /** Milliseconds one line may take before the rest of it is left unstyled. Default 500, 0 for no limit. */
  timeLimit?: number
  /** Lines at least this long are not tokenized and come back as one token. Default 20000, 0 for no limit. */
  maxLineLength?: number
}

/** Whole-text convenience: lines split like Shiki does, empty lines left without tokens. */
export const tokenize = (
  grammar: Grammar,
  code: string,
  { timeLimit, maxLineLength = 20_000 }: TokenizeOptions = {},
) => {
  let state: Frame | null = null
  return code.split(/\r?\n/).map((line) => {
    if (line === '') return []
    if (maxLineLength > 0 && line.length >= maxLineLength) {
      return [{ start: 0, end: line.length, scopeIds: pushScope(emptyScope, grammar.root!.name).ids }]
    }
    const result = tokenizeLine(grammar, line, state, timeLimit)
    state = result.state
    return result.tokens
  })
}
