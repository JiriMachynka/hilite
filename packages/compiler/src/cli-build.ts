import { join } from 'node:path'
import { buildLanguages, buildThemes } from './build.ts'
import { measureDictionary } from './dictionary.ts'
import { writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? undefined : args[at + 1]
}
const out = flag('out') ?? join(import.meta.dir, '../../../dist')
const languages = flag('langs')?.split(',')

const { reports, texts } = await buildLanguages({ out, languages })
const themes = await buildThemes({ out })

const kb = (n: number) => (n / 1024).toFixed(1).padStart(7)
const failed = reports.flatMap((r) => r.failures.map((f) => ({ lang: r.name, ...f })))
let ours = 0
let theirs = 0
console.log('lang'.padEnd(22), 'patterns', 'convs', ' set', 'sticky', 'clip', '    br KB', 'shiki br KB', 'ratio')
for (const r of reports) {
  ours += r.brotli
  theirs += r.shikiBrotli
  console.log(
    r.name.padEnd(22),
    String(r.patterns).padStart(8),
    String(r.convs).padStart(5),
    String(r.setConvs).padStart(4),
    String(r.stickyConvs).padStart(6),
    String(r.clipConvs).padStart(4),
    kb(r.brotli),
    kb(r.shikiBrotli).padStart(11),
    (r.brotli / r.shikiBrotli).toFixed(2).padStart(5),
  )
}
const ratios = reports.map((r) => r.brotli / r.shikiBrotli)
const mean = ratios.reduce((s, v) => s + v, 0) / ratios.length
console.log(
  `\nlanguages ${reports.length}  total ${kb(ours)} KB br vs ${kb(theirs)} KB  (aggregate ${(ours / theirs).toFixed(3)}, mean per-language ${mean.toFixed(3)})`,
)
console.log(`patterns that failed to convert: ${failed.length}`)
for (const f of failed) console.log(`  [${f.lang}] ${f.error} :: ${f.source.slice(0, 100)}`)
console.log(
  `themes ${themes.length}: ${kb(themes.reduce((s, t) => s + t.brotli, 0))} KB br total, avg ${kb(themes.reduce((s, t) => s + t.brotli, 0) / themes.length)} KB`,
)
const dictionary = args.includes('--dict')
  ? measureDictionary(texts, new Map(reports.map((r) => [r.name, r.shikiBrotli])))
  : undefined
if (dictionary) {
  console.log(`\nwith a shared brotli dictionary (${(dictionary.dictionaryBytes / 1024).toFixed(0)} KB):`)
  console.log(
    `  held out (dictionary from the other half of the languages): mean ${dictionary.heldOut.mean.toFixed(3)}, aggregate ${dictionary.heldOut.aggregate.toFixed(3)}`,
  )
  console.log(
    `  in sample (dictionary built from all languages):            mean ${dictionary.inSample.mean.toFixed(3)}, aggregate ${dictionary.inSample.aggregate.toFixed(3)}`,
  )
}
writeFileSync(join(out, 'report.json'), JSON.stringify({ languages: reports, themes, dictionary }, null, 2))
