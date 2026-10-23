import type { RenderToken, Transformer } from './html.ts'

type Parts = [prefix: string, body: string, suffix: string | undefined]

interface Comment {
  parts: Parts
  line: RenderToken[]
  token: RenderToken
  /** The rest of a comment the grammar split in two, such as `//` followed by `[!code ++]`. */
  extra?: RenderToken
  alone: boolean
}

const LINE_PREFIX = /^(?:\/\/|["'#]|;{1,2}|%{1,2}|--)$/
const TRAILING_PREFIX = /(?:\/\/|#|;{1,2}|%{1,2}|--)(\s*)$/
const SPLIT = /(\s+\/\/)/
const ANY_NOTATION = /#?\s*\[!code\b(?:\\.|[^\]])*\]/gi

// Comment shapes, and whether each one has to sit at the end of the line.
const shapes: [RegExp, boolean][] = [
  [/^(<!--)(.+)(-->)$/, false],
  [/^(\/\*)(.+)(\*\/)$/, false],
  [/^(\/\/|["'#]|;{1,2}|%{1,2}|--)(.*)$/, true],
  [/^(\*)(.+)$/, true],
]

const matchComment = (text: string, last: boolean): Parts | undefined => {
  const trimmed = text.trim()
  const front = text.length - text.trimStart().length
  const back = text.length - front - trimmed.length
  for (const [shape, endOfLine] of shapes) {
    if (endOfLine && !last) continue
    const found = shape.exec(trimmed)
    if (found) return [' '.repeat(front) + found[1]!, found[2]!, found[3] ? found[3] + ' '.repeat(back) : undefined]
  }
}

/** A token holding `code // [!code ++]` in one piece is cut so the comment stands alone. */
const splitComments = (line: RenderToken[]) => {
  const out = line.flatMap((token, i) => {
    if (!matchComment(token.content, i === line.length - 1)) return [token]
    const raw = token.content.split(SPLIT)
    const pieces = [raw[0]!]
    for (let j = 1; j < raw.length; j += 2) pieces.push(raw[j]! + (raw[j + 1] ?? ''))
    const kept = pieces.filter(Boolean)
    return kept.length > 1 ? kept.map((content) => ({ ...token, content })) : [token]
  })
  if (out.length !== line.length) line.splice(0, line.length, ...out)
}

const findComments = (lines: RenderToken[][]) => {
  const found: Comment[] = []
  for (const line of lines) {
    splitComments(line)
    const last = line.length - 1
    const token = line[last]
    if (!token) continue
    const parts = matchComment(token.content, true)
    if (parts) {
      found.push({ parts, line, token, alone: line.length === 1 })
      continue
    }
    const before = line[last - 1]
    if (!before || !token.content.trim().startsWith('[!code')) continue
    if (!before.content.includes('//') && !LINE_PREFIX.test(before.content.trim())) continue
    const joined = matchComment(before.content + token.content, true)
    if (joined) found.push({ parts: joined, line, token: before, extra: token, alone: line.length === 2 })
  }
  return found
}

// Every notation transformer in a render reads the same comments, so markers one of them removes stay gone for the next.
const parsed = new WeakMap<RenderToken[][], Comment[]>()

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const notation = (classMap: Record<string, string[]>, preClass: string): Transformer => {
  const marker = new RegExp(`#?\\s*\\[!code (${Object.keys(classMap).map(escapeRegExp).join('|')})(:\\d+)?\\]`, 'gi')
  const marked = new Map<RenderToken[], string[]>()
  let used = false
  return {
    tokens: (lines) => {
      marked.clear()
      used = false
      let comments = parsed.get(lines)
      if (!comments) parsed.set(lines, (comments = findComments(lines)))
      const dropped: RenderToken[][] = []
      for (const comment of comments) {
        const { parts } = comment
        let at = lines.indexOf(comment.line)
        // A comment on a line of its own marks the line below it.
        if (comment.alone && parts[1].replace(ANY_NOTATION, '').replace(marker, '').trim() === '') at++
        let replaced = false
        parts[1] = parts[1].replace(marker, (_whole, key: string, range = ':1') => {
          for (let i = at; i < Math.min(at + Number.parseInt(range.slice(1), 10), lines.length); i++) {
            const classes = marked.get(lines[i]!) ?? []
            for (const name of classMap[key] ?? []) if (!classes.includes(name)) classes.push(name)
            marked.set(lines[i]!, classes)
          }
          used = replaced = true
          return ''
        })
        if (!replaced) continue
        const tail = parts[1].match(TRAILING_PREFIX)
        if (tail && tail[1]!.trim() === '') parts[1] = parts[1].slice(0, tail.index).trimEnd()
        if (parts[1].trim() !== '') {
          comment.token.content = parts.join('')
          if (comment.extra) comment.extra.content = ''
          continue
        }
        parts[1] = ''
        if (comment.alone) dropped.push(comment.line)
        else {
          if (comment.extra) comment.line.splice(comment.line.indexOf(comment.extra), 1)
          comment.line.splice(comment.line.indexOf(comment.token), 1)
        }
      }
      for (const line of dropped) lines.splice(lines.indexOf(line), 1)
    },
    line: (line) => {
      const classes = marked.get(line.tokens)
      if (classes) line.classes.push(...classes)
    },
    pre: (attrs) => {
      if (used) attrs.class += ` ${preClass}`
    },
  }
}

/** `// [!code ++]` and `// [!code --]` mark added and removed lines, like Shiki's `transformerNotationDiff`. */
export const notationDiff = () => notation({ '++': ['diff', 'add'], '--': ['diff', 'remove'] }, 'has-diff')

/** `// [!code highlight]` (or `hl`) adds `highlighted`. */
export const notationHighlight = () => notation({ highlight: ['highlighted'], hl: ['highlighted'] }, 'has-highlighted')

/** `// [!code focus]` adds `focused`. */
export const notationFocus = () => notation({ focus: ['focused'] }, 'has-focused')
