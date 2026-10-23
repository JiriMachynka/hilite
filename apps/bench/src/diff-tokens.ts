import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { snippetsFor, corpusLangs } from './lib/corpus.ts'
import { compare, firstMismatch } from './lib/diff.ts'
import type { Score } from './lib/diff.ts'
import { hiliteFor } from './lib/hilite.ts'
import { referenceFor } from './lib/reference.ts'

const args = process.argv.slice(2)
const verbose = args.includes('-v')
const langs = args.filter((a) => !a.startsWith('-'))
const targets = langs.length ? langs : corpusLangs()

const perLanguage: { lang: string; tokens: number; matched: number }[] = []
const total: Score = { tokens: 0, matched: 0, lines: 0, linesMatched: 0 }
const below: string[] = []
const scoreKeys = ['tokens', 'matched', 'lines', 'linesMatched'] as const
console.log('lang'.padEnd(22), 'token%'.padStart(8), 'line%'.padStart(8), 'tokens'.padStart(7))
for (const lang of targets) {
  const score: Score = { tokens: 0, matched: 0, lines: 0, linesMatched: 0 }
  try {
    const reference = await referenceFor(lang)
    const hilite = hiliteFor(lang)
    for (const snippet of await snippetsFor(lang)) {
      const expected = reference.tokenize(snippet.code)
      const actual = hilite.tokenize(snippet.code)
      const s = compare(expected, actual)
      for (const k of scoreKeys) score[k] += s[k]
      if (verbose && s.matched !== s.tokens) {
        const miss = firstMismatch(expected, actual)
        if (miss) console.log(`  [${snippet.label}] line ${miss.line}\n    want ${miss.want}\n    got  ${miss.got}`)
      }
    }
    reference.dispose()
  } catch (error) {
    console.log(lang.padEnd(22), 'ERROR', error instanceof Error ? error.message.slice(0, 120) : String(error))
    below.push(lang)
    continue
  }
  perLanguage.push({ lang, tokens: score.tokens, matched: score.matched })
  for (const k of scoreKeys) total[k] += score[k]
  const pct = score.tokens ? (score.matched / score.tokens) * 100 : 100
  const linePct = score.lines ? (score.linesMatched / score.lines) * 100 : 100
  if (pct < 99) below.push(lang)
  console.log(
    lang.padEnd(22),
    pct.toFixed(2).padStart(8),
    linePct.toFixed(2).padStart(8),
    String(score.tokens).padStart(7),
  )
}
console.log(
  `\noverall token match ${((total.matched / total.tokens) * 100).toFixed(3)}%  lines ${((total.linesMatched / total.lines) * 100).toFixed(3)}%  (${total.tokens} tokens)`,
)
console.log(`below 99% or failed: ${below.length}${below.length ? ` -> ${below.join(', ')}` : ''}`)

if (!langs.length) {
  mkdirSync(join(import.meta.dir, '../../../reports'), { recursive: true })
  writeFileSync(
    join(import.meta.dir, '../../../reports/tokens.json'),
    JSON.stringify({ ...total, languages: perLanguage.length, perLanguage, below }, null, 2),
  )
}
