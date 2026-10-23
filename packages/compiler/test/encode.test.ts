import { expect, test } from 'bun:test'
import { RULE_STRIDE, Slot } from '@hilite/core/format'
import type { Lang } from '@hilite/core/format'
import { decode } from '@hilite/core/decode'
import { compileGrammar } from '../src/compile.ts'
import { encode } from '../src/encode.ts'
import { contextFor, loadRegistry } from '../src/registry.ts'

const registry = await loadRegistry()

const compile = (name: string) => {
  const source = registry.sources.get(name)!
  return compileGrammar(source.grammar, contextFor(registry, name)).lang
}

// Ids are renumbered by the encoder, so compare what each rule means instead of its raw numbers.
const meaning = (lang: Lang) => {
  const rule = (id: number) => lang.rules.slice(id * RULE_STRIDE, (id + 1) * RULE_STRIDE)
  const regex = (id: number) =>
    id ? lang.regexes[id]!.conv.map((c) => ({ ...lang.convs[c]!, refs: undefined })) : null
  const list = (id: number) => lang.lists[id]!
  const name = (id: number) => (id ? lang.names[id - 1] : null)
  const capsOf = (id: number) => lang.caps[id]!.map((cap) => (cap ? [name(cap[0]), name(cap[1]), cap[2]] : null))
  const out = []
  for (let id = 1; id < lang.rules.length / RULE_STRIDE; id++) {
    const r = rule(id)
    out.push({
      kind: r[Slot.Kind],
      name: r[Slot.Name] ? lang.names[r[Slot.Name]! - 1] : null,
      contentName: r[Slot.ContentName] ? lang.names[r[Slot.ContentName]! - 1] : null,
      regex: regex(r[Slot.Regex]!),
      regex2: regex(r[Slot.Regex2]!),
      refs: r[Slot.Regex2] ? lang.regexes[r[Slot.Regex2]!]!.refs : null,
      caps: capsOf(r[Slot.Caps]!),
      caps2: capsOf(r[Slot.Caps2]!),
      patterns: list(r[Slot.Patterns]! >> 1),
      last: r[Slot.Patterns]! & 1,
    })
  }
  return out
}

test.each(['json', 'css', 'typescript', 'markdown'])(
  'encode/decode round trip: %s',
  (name) => {
    const lang = compile(name)
    const back = decode(encode(lang))
    expect(meaning(back)).toEqual(meaning(lang))
    expect(back.exports).toEqual(lang.exports)
    expect(back.scope).toBe(lang.scope)
  },
  30_000,
)
