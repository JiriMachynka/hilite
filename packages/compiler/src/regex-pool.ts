import { Mode } from '@hilite/core/format'
import type { Conv, Regex } from '@hilite/core/format'
import { toRegExpDetails } from 'oniguruma-to-es'
import { hasAnchor, resolveAnchors, rewriteEndOfString } from './anchors.ts'
import { convertOptions } from './convert.ts'

const refMarker = 0xe000
const backReference = /\\(\d+)/g
const hasBackReference = /\\(\d+)/

export interface Failure {
  source: string
  error: string
}

const reserved = '&!#%,:;<=>@`~'
const plainInClass = '$*+?.(){}|/['

/**
 * Rewrites `v` style escapes into the shortest `u` spelling: reserved punctuation is never special in `u`,
 * and most syntax characters lose their meaning inside a class.
 */
const narrowEscapes = (pattern: string) => {
  let out = ''
  let inClass = false
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!
    if (ch === '\\') {
      const next = pattern[++i]!
      const opensClass = out.endsWith('[') || out.endsWith('[^')
      const closesClass = pattern[i + 1] === ']'
      const bare =
        reserved.includes(next) ||
        (next === '-' && (!inClass || opensClass || closesClass)) ||
        (inClass && (plainInClass.includes(next) || (next === '^' && !opensClass)))
      out += bare ? next : `\\${next}`
    } else {
      if (ch === '[' && !inClass) inClass = true
      else if (ch === ']') inClass = false
      out += ch
    }
  }
  return out
}

// `v` costs far more to compile in some engines, so patterns only use it when `u` cannot say the same thing.
const needsSet = (pattern: string, fold: boolean) => {
  try {
    new RegExp(pattern, 'u')
  } catch {
    return true
  }
  // Under case folding `u` complements before folding and `v` after, which changes negated property classes.
  return fold && /\\P\{|\[\^(?:[^\]\\]|\\.)*\\p\{/.test(pattern)
}

const countGroups = (src: string) => new RegExp(`(?:${src})|`, 'v').exec('')!.length - 1

// Oniguruma reads `\xHH` above 0x7f inside a class as the code point, the converter wants a full UTF-8 sequence.
const highByte = /(?<!\\)((?:\\\\)*)\\x([89a-f][0-9a-f])/gi

// ES2025 would emit inline modifiers like `(?i:…)`, which only Node 23+ and Chrome 125+ parse.
const target = 'ES2024'

const detailsOf = (source: string) => {
  try {
    return toRegExpDetails(source, convertOptions(target))
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('Multibyte code')) throw error
    return toRegExpDetails(source.replace(highByte, '$1\\u00$2'), convertOptions(target))
  }
}

// Captures are read by number, and the same name in two combined alternatives only parses in Node 23+ and Chrome 125+.
// The converter writes every backreference by number, so names can go.
const groupName = /(?<!\\)((?:\\\\)*)\(\?<[A-Za-z_$][\w$]*>/g

const toConv = (source: string): Conv => {
  const details = detailsOf(source)
  const pattern = details.pattern.replace(groupName, '$1(')
  const sticky = details.flags.includes('y')
  const clip = details.options?.strategy === 'clip_search'
  const hidden = details.options?.hiddenCaptures ?? []
  const transfers = details.options?.transfers ?? []
  const groups = countGroups(pattern)
  // The ES2024 target hoists a whole-pattern `(?i)` into the `i` flag instead of spelling it out.
  const fold = details.flags.includes('i')
  const conv: Conv = {
    src: pattern,
    mode: clip ? Mode.Clip : sticky ? Mode.Sticky : Mode.Search,
    set: needsSet(pattern, fold),
    fold,
    groups,
    refs: /\\[1-9]/.test(pattern.replace(/\\\\/g, '')),
  }
  // `u` is much cheaper to compile than `v`, so keep the `u` spelling whenever it is equivalent.
  const narrow = narrowEscapes(conv.src)
  if (narrow !== conv.src && !needsSet(narrow, fold)) {
    conv.src = narrow
    conv.set = false
  }
  if (hidden.length || transfers.length) {
    const out: number[][] = []
    const slot = new Map<number, number>()
    for (let raw = 1; raw <= groups; raw++) {
      if (hidden.includes(raw)) continue
      slot.set(raw, out.length)
      out.push([raw])
    }
    for (const [to, from] of transfers) {
      const target = slot.get(to)
      if (target === undefined) throw new Error(`capture transfer to hidden group ${to}`)
      for (const raw of from) out[target]!.push(raw)
    }
    conv.map = out
  }
  return conv
}

/** Interns every distinct regex source of a grammar and its converted variants. */
export const createRegexPool = () => {
  // Id 0 stays reserved so rule records can use 0 for "no regex".
  const regexes: Regex[] = [{ conv: [0], refs: false }]
  const convs: Conv[] = []
  const regexByKey = new Map<string, number>()
  const convByKey = new Map<string, number>()
  const failures: Failure[] = []
  const dead = (): Conv => ({ src: '(?!)', mode: Mode.Search, set: false, fold: false, groups: 0, refs: false })

  const internConv = (conv: Conv) => {
    const key = JSON.stringify(conv)
    let id = convByKey.get(key)
    if (id === undefined) {
      id = convs.push(conv) - 1
      convByKey.set(key, id)
    }
    return id
  }

  /** `refs` marks end/while patterns, where `\N` is replaced with begin-capture text at tokenize time. */
  const add = (raw: string, refs: boolean) => {
    const rewritten = rewriteEndOfString(raw)
    const withRefs = refs && hasBackReference.test(rewritten)
    const key = `${withRefs ? 1 : 0}${rewritten}`
    const known = regexByKey.get(key)
    if (known !== undefined) return known

    const source = withRefs
      ? rewritten.replace(backReference, (_, n: string) => String.fromCharCode(refMarker + Number(n)))
      : rewritten
    const variants = hasAnchor(source)
      ? [false, true].flatMap((g) => [false, true].map((a) => resolveAnchors(source, a, g)))
      : [source]
    const ids = variants.map((variant) => {
      try {
        return internConv(toConv(variant))
      } catch (error) {
        failures.push({ source: raw, error: error instanceof Error ? error.message : String(error) })
        return internConv(dead())
      }
    })
    const regex: Regex = { conv: ids.every((id) => id === ids[0]) ? [ids[0]!] : ids, refs: withRefs }
    const id = regexes.push(regex) - 1
    regexByKey.set(key, id)
    return id
  }

  return { add, regexes, convs, failures }
}
