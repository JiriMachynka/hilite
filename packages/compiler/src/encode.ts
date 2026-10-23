import { FIELDS, RULE_STRIDE, Slot } from '@hilite/core/format'
import type { Conv, Lang } from '@hilite/core/format'

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'

const zig = (n: number) => (n << 1) ^ (n >> 31)

const vlq = (n: number) => {
  if (!Number.isInteger(n) || n < 0) throw new Error(`cannot encode ${n}`)
  let out = ''
  do {
    const digit = n % 32
    n = Math.floor(n / 32)
    out += ALPHABET[digit + (n ? 32 : 0)]
  } while (n)
  return out
}

/**
 * Tables are renumbered in first-use order, so "the next new entry" is the common case and costs one
 * symbol. `ref` returns the value to write: 0 none, 1 new, otherwise the old id plus `2 - base`.
 */
const createInterner = (base: number) => {
  const ids = new Map<number, number>()
  const order: number[] = []
  return {
    order,
    ref: (old: number) => {
      const known = ids.get(old)
      if (known !== undefined) return known + 2 - base
      ids.set(old, base + order.length)
      order.push(old)
      return 1
    },
  }
}

const columns = [Slot.Name, Slot.ContentName, Slot.Regex, Slot.Regex2, Slot.Caps, Slot.Caps2, Slot.Patterns]

export const encode = (lang: Lang) => {
  const nRules = lang.rules.length / RULE_STRIDE
  const records = Array.from({ length: nRules - 1 }, (_, i) =>
    lang.rules.slice((i + 1) * RULE_STRIDE, (i + 2) * RULE_STRIDE),
  )

  const names = createInterner(1)
  const regexes = createInterner(1)
  const caps = createInterner(1)
  const lists = createInterner(1)
  const internerOf = (slot: Slot) =>
    slot === Slot.Name || slot === Slot.ContentName
      ? names
      : slot === Slot.Regex || slot === Slot.Regex2
        ? regexes
        : slot === Slot.Patterns
          ? lists
          : caps
  const name = (old: number) => (old === 0 ? 0 : names.ref(old))

  const kinds = records.map((rec) => vlq(rec[Slot.Kind]! | (rec[Slot.Patterns]! & 1 ? 8 : 0)))
  const body: string[] = []
  for (const slot of columns) {
    for (const rec of records) {
      if (!FIELDS[rec[Slot.Kind]!]!.includes(slot)) continue
      const old = slot === Slot.Patterns ? rec[slot]! >> 1 : rec[slot]!
      body.push(vlq(old === 0 ? 0 : internerOf(slot).ref(old)))
    }
  }

  // Capture tables in first-use order. Interning their names here keeps one numbering for all names.
  const capStream: string[] = []
  for (const old of caps.order) {
    const table = lang.caps[old]!
    capStream.push(vlq(table.length))
    for (const cap of table) {
      if (!cap) {
        capStream.push(vlq(0))
        continue
      }
      const [nameId, contentId, retokenize] = cap
      capStream.push(vlq(1 + ((nameId ? 1 : 0) | (contentId ? 2 : 0) | (retokenize ? 4 : 0))))
      if (nameId) capStream.push(vlq(name(nameId)))
      if (contentId) capStream.push(vlq(name(contentId)))
      if (retokenize) capStream.push(vlq(zig(retokenize)))
    }
  }

  const listStream: string[] = []
  for (const old of lists.order) {
    const list = lang.lists[old]!
    listStream.push(vlq(list.length))
    let previous = 0
    for (const value of list) {
      listStream.push(vlq(zig(value - previous)))
      previous = value
    }
  }

  // Regexes in new id order, with the convs they use.
  const convs = createInterner(0)
  const convStream: string[] = []
  const extras: string[] = []
  const pending: number[][] = []
  for (const old of regexes.order) {
    const regex = lang.regexes[old]!
    const anchored = regex.conv.length === 4
    convStream.push(vlq((regex.refs ? 1 : 0) | (anchored ? 2 : 0)), vlq(convs.ref(regex.conv[0]!)))
    if (anchored) pending.push(regex.conv.slice(1))
  }
  for (const rest of pending) {
    for (const old of rest) {
      const ref = convs.ref(old)
      extras.push(vlq(ref === 1 ? convs.order.length - 1 : ref - 2))
    }
  }
  const convList: Conv[] = convs.order.map((old) => lang.convs[old]!)
  const mapped = convList.flatMap((conv, i) => (conv.map ? [[i, conv.map] as const] : []))
  const mapStream = [vlq(mapped.length)]
  for (const [i, map] of mapped) {
    mapStream.push(vlq(i), vlq(map.length))
    for (const raws of map) mapStream.push(vlq(raws.length), ...raws.map(vlq))
  }

  const nameList = names.order.map((old) => lang.names[old - 1]!)
  const sources = convList.map((c) => c.src)
  if ([...nameList, ...sources].some((text) => text.includes('\n')))
    throw new Error('newline inside a name or regex source')

  const header = {
    scope: lang.scope,
    deps: lang.deps,
    externals: lang.externals,
    exports: lang.exports,
    injections: lang.injections,
    injectTo: lang.injectTo,
    injectionSelector: lang.injectionSelector,
    names: nameList.length,
    convs: convList.length,
  }

  const numeric = [
    vlq(regexes.order.length + 1),
    vlq(nRules),
    vlq(caps.order.length + 1),
    vlq(lists.order.length + 1),
    convList.map((c) => vlq(c.mode | (c.set ? 4 : 0) | (c.fold ? 8 : 0))).join(''),
    convList.map((c) => vlq(c.groups)).join(''),
    mapStream.join(''),
    convStream.join(''),
    extras.join(''),
    kinds.join(''),
    body.join(''),
    capStream.join(''),
    listStream.join(''),
  ].join('')

  return [JSON.stringify(header), ...nameList, ...sources, numeric].join('\n')
}
