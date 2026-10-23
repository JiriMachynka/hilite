import { FIELDS, Mode, RULE_STRIDE, Slot } from './format.ts'
import type { Cap, Conv, Lang, Regex } from './format.ts'

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'

interface Header {
  scope: string
  deps: string[]
  externals: [string, string][]
  exports: Record<string, number>
  injections: [string, number][]
  injectTo?: string[]
  injectionSelector?: string
  names: number
  convs: number
}

const zeros = (n: number) => Array.from({ length: n }, () => 0)

const unzig = (n: number) => (n >>> 1) ^ -(n & 1)

export const decode = (text: string): Lang => {
  const lines = text.split('\n')
  const header: Header = JSON.parse(lines[0]!)
  const names = lines.slice(1, 1 + header.names)
  const sources = lines.slice(1 + header.names, 1 + header.names + header.convs)
  const stream = lines[1 + header.names + header.convs]!

  let at = 0
  const next = () => {
    let value = 0
    let shift = 0
    for (;;) {
      const digit = ALPHABET.indexOf(stream[at++]!)
      value += (digit & 31) * 2 ** shift
      shift += 5
      if (!(digit & 32)) return value
    }
  }
  const many = <T>(count: number, read: () => T) => Array.from({ length: count }, read)

  // A referenced table entry is either absent, the next unseen one, or an earlier one.
  const reference = (counter: { n: number }, base = 1) => {
    const value = next()
    return value === 0 ? 0 : value === 1 ? counter.n++ : value - 2 + base
  }

  const nRegexes = next()
  const nRules = next()
  const nCaps = next()
  const nLists = next()

  const convs: Conv[] = sources.map((src) => ({
    src,
    mode: Mode.Search,
    set: false,
    fold: false,
    groups: 0,
    refs: /\\[1-9]/.test(src.replace(/\\\\/g, '')),
  }))
  for (const conv of convs) {
    const packed = next()
    conv.mode = packed & 3
    conv.set = Boolean(packed & 4)
    conv.fold = Boolean(packed & 8)
  }
  for (const conv of convs) conv.groups = next()
  for (let count = next(); count--;) {
    const conv = convs[next()]!
    conv.map = many(next(), () => many(next(), next))
  }

  const convCounter = { n: 0 }
  const regexes: Regex[] = [{ conv: [0], refs: false }]
  for (let i = 1; i < nRegexes; i++) {
    const flags = next()
    regexes.push({ conv: [reference(convCounter, 0)], refs: Boolean(flags & 1) })
    if (flags & 2) regexes[i]!.conv.length = 4
  }
  for (const regex of regexes) {
    if (regex.conv.length !== 4) continue
    for (let k = 1; k < 4; k++) regex.conv[k] = next()
  }

  const kinds = many(nRules - 1, next)
  const records = kinds.map((kind) => {
    const record = zeros(RULE_STRIDE)
    record[Slot.Kind] = kind & 7
    record[Slot.Patterns] = (kind >> 3) & 1
    return record
  })
  const counters: Partial<Record<Slot, { n: number }>> = {}
  const shared = { names: { n: 1 }, regexes: { n: 1 }, caps: { n: 1 }, lists: { n: 1 } }
  counters[Slot.Name] = counters[Slot.ContentName] = shared.names
  counters[Slot.Regex] = counters[Slot.Regex2] = shared.regexes
  counters[Slot.Caps] = counters[Slot.Caps2] = shared.caps
  counters[Slot.Patterns] = shared.lists
  for (const slot of [Slot.Name, Slot.ContentName, Slot.Regex, Slot.Regex2, Slot.Caps, Slot.Caps2, Slot.Patterns]) {
    for (const record of records) {
      if (!FIELDS[record[Slot.Kind]!]!.includes(slot)) continue
      const value = reference(counters[slot]!)
      record[slot] = slot === Slot.Patterns ? value * 2 + record[slot]! : value
    }
  }

  const caps: (Cap | null)[][] = [[]]
  const nameCounter = shared.names
  for (let i = 1; i < nCaps; i++) {
    caps.push(
      many(next(), () => {
        const flags = next()
        if (flags === 0) return null
        const bits = flags - 1
        const name = bits & 1 ? reference(nameCounter) : 0
        const content = bits & 2 ? reference(nameCounter) : 0
        return [name, content, bits & 4 ? unzig(next()) : 0]
      }),
    )
  }

  const lists: number[][] = [[]]
  for (let i = 1; i < nLists; i++) {
    let previous = 0
    lists.push(many(next(), () => (previous += unzig(next()))))
  }

  return {
    scope: header.scope,
    deps: header.deps,
    names,
    regexes,
    convs,
    rules: [...zeros(RULE_STRIDE), ...records.flat()],
    lists,
    caps,
    externals: header.externals,
    exports: header.exports,
    injections: header.injections,
    injectTo: header.injectTo,
    injectionSelector: header.injectionSelector,
  }
}
