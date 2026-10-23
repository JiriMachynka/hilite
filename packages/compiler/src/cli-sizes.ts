import { brotliCompressSync } from 'node:zlib'
import { compileGrammar } from './compile.ts'
import { contextFor } from './registry.ts'
import { encode } from './encode.ts'
import { loadRegistry } from './registry.ts'

const registry = await loadRegistry()
const names = process.argv.slice(2)
const br = (text: string) => brotliCompressSync(Buffer.from(text)).length

let ours = 0
let theirs = 0
for (const name of names) {
  const source = registry.sources.get(name)!
  const { lang, failures } = compileGrammar(source.grammar, contextFor(registry, name))
  const text = encode(lang)
  const a = br(text)
  const b = br(JSON.stringify(source.grammar))
  ours += a
  theirs += b
  const parts = text.split('\n')
  const head = JSON.parse(parts[0]!)
  const part = (from: number, to: number) => br(parts.slice(from, to).join('\n'))
  if (process.env.PARTS)
    console.log(
      '   header',
      br(parts[0]!),
      'names',
      part(1, 1 + head.names),
      'convs',
      part(1 + head.names, 1 + head.names + head.convs),
      'numbers',
      br(parts[parts.length - 1]!),
    )
  console.log(
    name.padEnd(14),
    'rules',
    String(lang.rules.length / 8 - 1).padStart(5),
    'chars',
    String(text.length).padStart(7),
    'br',
    String(a).padStart(6),
    '| tm-json br',
    String(b).padStart(6),
    '| ratio',
    (a / b).toFixed(2),
    failures.length ? `fail ${failures.length}` : '',
  )
}
console.log('total', ours, theirs, (ours / theirs).toFixed(2))
