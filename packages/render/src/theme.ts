import { scopeName } from '@hilite/core'

/** One theme rule: [scope selectors, foreground, background, fontStyle]; a lone empty selector = defaults. */
export type ThemeRule = [string[], string, string, string]

export interface ThemeData {
  name: string
  type: string
  fg: string
  bg: string
  rules: ThemeRule[]
  /** CSS-variable style colors are swapped for placeholders at build time and restored on output. */
  replace?: Record<string, string>
}

export const enum Font {
  None = 0,
  Italic = 1,
  Bold = 2,
  Underline = 4,
  Strikethrough = 8,
}

const NOT_SET = -1

interface TrieRule {
  depth: number
  parents: string[]
  font: number
  fg: number
  bg: number
}

interface Trie {
  main: TrieRule
  withParents: TrieRule[]
  children: Map<string, Trie>
}

/** Resolved style of one scope stack: standard token type, font style, foreground id, background id. */
export interface Attrs {
  type: number
  font: number
  fg: number
  bg: number
}

export interface Theme {
  data: ThemeData
  /** Color table, id 0 is "unset". Upper case like vscode-textmate stores it. */
  colors: string[]
  root: Trie
  defaults: Attrs
  cache: Map<string, TrieRule[]>
  stacks: WeakMap<number[], Attrs>
}

const validHex = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

const cloneRule = (rule: TrieRule): TrieRule => ({ ...rule })

const compare = (a: string[], b: string[]) => {
  if (a.length !== b.length) return a.length - b.length
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1
  return 0
}

const insert = (
  node: Trie,
  depth: number,
  scope: string,
  parents: string[] | null,
  font: number,
  fg: number,
  bg: number,
) => {
  if (scope === '') {
    if (parents === null) {
      overwrite(node.main, depth, font, fg, bg)
      return
    }
    for (const rule of node.withParents) {
      if (compare(rule.parents, parents) === 0) {
        overwrite(rule, depth, font, fg, bg)
        return
      }
    }
    node.withParents.push({
      depth,
      parents,
      font: font === NOT_SET ? node.main.font : font,
      fg: fg === 0 ? node.main.fg : fg,
      bg: bg === 0 ? node.main.bg : bg,
    })
    return
  }
  const dot = scope.indexOf('.')
  const head = dot === -1 ? scope : scope.slice(0, dot)
  const tail = dot === -1 ? '' : scope.slice(dot + 1)
  let child = node.children.get(head)
  if (!child) {
    child = { main: cloneRule(node.main), withParents: node.withParents.map(cloneRule), children: new Map() }
    node.children.set(head, child)
  }
  insert(child, depth + 1, tail, parents, font, fg, bg)
}

const overwrite = (rule: TrieRule, depth: number, font: number, fg: number, bg: number) => {
  if (rule.depth <= depth) rule.depth = depth
  if (font !== NOT_SET) rule.font = font
  if (fg !== 0) rule.fg = fg
  if (bg !== 0) rule.bg = bg
}

const bySpecificity = (a: TrieRule, b: TrieRule) => {
  if (a.depth !== b.depth) return b.depth - a.depth
  let i = 0
  let j = 0
  for (;;) {
    if (a.parents[i] === '>') i++
    if (b.parents[j] === '>') j++
    if (i >= a.parents.length || j >= b.parents.length) break
    const diff = b.parents[j]!.length - a.parents[i]!.length
    if (diff !== 0) return diff
    i++
    j++
  }
  return b.parents.length - a.parents.length
}

const lookup = (node: Trie, scope: string): TrieRule[] => {
  if (scope !== '') {
    const dot = scope.indexOf('.')
    const child = node.children.get(dot === -1 ? scope : scope.slice(0, dot))
    if (child) return lookup(child, dot === -1 ? '' : scope.slice(dot + 1))
  }
  return [...node.withParents, node.main].sort(bySpecificity)
}

const matchesScope = (name: string, pattern: string) =>
  pattern === name || (name.startsWith(pattern) && name[pattern.length] === '.')

const parentsMatch = (names: string[], from: number, parents: string[]) => {
  if (parents.length === 0) return true
  let at = from
  for (let index = 0; index < parents.length; index++) {
    let pattern = parents[index]!
    let strict = false
    if (pattern === '>') {
      if (index === parents.length - 1) return false
      pattern = parents[++index]!
      strict = true
    }
    while (at >= 0) {
      if (matchesScope(names[at]!, pattern)) break
      if (strict) return false
      at--
    }
    if (at < 0) return false
    at--
  }
  return true
}

const parseFont = (value: string) => {
  let font = Font.None
  for (const part of value.split(' ')) {
    if (part === 'italic') font |= Font.Italic
    else if (part === 'bold') font |= Font.Bold
    else if (part === 'underline') font |= Font.Underline
    else if (part === 'strikethrough') font |= Font.Strikethrough
  }
  return font
}

interface Parsed {
  scope: string
  parents: string[] | null
  index: number
  font: number
  fg: string | null
  bg: string | null
}

export const createTheme = (data: ThemeData): Theme => {
  const parsed: Parsed[] = []
  data.rules.forEach(([scopes, fgText, bgText, fontText], index) => {
    const font = fontText ? parseFont(fontText) : NOT_SET
    const fg = validHex.test(fgText) ? fgText : null
    const bg = validHex.test(bgText) ? bgText : null
    for (const entry of scopes) {
      const segments = entry.trim().split(' ')
      const scope = segments[segments.length - 1]!
      parsed.push({ scope, parents: segments.length > 1 ? segments.slice(0, -1).reverse() : null, index, font, fg, bg })
    }
  })
  parsed.sort(
    (a, b) =>
      (a.scope < b.scope ? -1 : a.scope > b.scope ? 1 : 0) ||
      (a.parents === null && b.parents === null
        ? 0
        : !a.parents
          ? -1
          : !b.parents
            ? 1
            : compare(a.parents, b.parents)) ||
      a.index - b.index,
  )

  const colors = ['']
  const colorId = (color: string | null) => {
    if (color === null) return 0
    const upper = color.toUpperCase()
    let id = colors.indexOf(upper)
    if (id === -1) id = colors.push(upper) - 1
    return id
  }

  let font = Font.None
  let fg = '#000000'
  let bg = '#ffffff'
  while (parsed.length > 0 && parsed[0]!.scope === '') {
    const entry = parsed.shift()!
    if (entry.font !== NOT_SET) font = entry.font
    if (entry.fg !== null) fg = entry.fg
    if (entry.bg !== null) bg = entry.bg
  }
  const defaults: Attrs = { type: 0, font, fg: colorId(fg), bg: colorId(bg) }
  const root: Trie = {
    main: { depth: 0, parents: [], font: NOT_SET, fg: 0, bg: 0 },
    withParents: [],
    children: new Map(),
  }
  for (const entry of parsed)
    insert(root, 0, entry.scope, entry.parents, entry.font, colorId(entry.fg), colorId(entry.bg))
  return { data, colors, root, defaults, cache: new Map(), stacks: new WeakMap() }
}

const tokenTypeOf = /\b(comment|string|regex|meta\.embedded)\b/

const typeOf = (name: string) => {
  const hit = tokenTypeOf.exec(name)?.[1]
  return hit === undefined ? -1 : hit === 'comment' ? 1 : hit === 'string' ? 2 : hit === 'regex' ? 3 : 0
}

/** Style of a whole scope stack, built the way vscode-textmate layers one scope at a time. */
export const resolve = (theme: Theme, ids: number[]): Attrs => {
  const known = theme.stacks.get(ids)
  if (known) return known
  const names = ids.map(scopeName)
  let { type, font, fg, bg } = theme.defaults
  for (let i = 0; i < names.length; i++) {
    const name = names[i]!
    let rules = theme.cache.get(name)
    if (!rules) theme.cache.set(name, (rules = lookup(theme.root, name)))
    const rule = rules.find((r) => parentsMatch(names, i - 1, r.parents))!
    const kind = typeOf(name)
    if (kind !== -1) type = kind
    if (rule.font !== NOT_SET) font = rule.font
    if (rule.fg !== 0) fg = rule.fg
    if (rule.bg !== 0) bg = rule.bg
  }
  const attrs = { type, font, fg, bg }
  theme.stacks.set(ids, attrs)
  return attrs
}
