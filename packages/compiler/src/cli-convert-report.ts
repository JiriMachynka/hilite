import { hasAnchor, resolveAnchors, rewriteEndOfString, backReference } from './anchors.ts'
import { convert } from './convert.ts'
import type { Target } from './convert.ts'
import { collectPatterns, listGrammarNames, loadGrammar } from './grammar.ts'

const targets: Target[] = ['auto', 'ES2025', 'ES2024', 'ES2018']
const wanted = process.argv[2] ?? 'ES2024'
const target = targets.find((t) => t === wanted)
if (!target) throw new Error(`unknown target "${wanted}", expected one of ${targets.join(', ')}`)
const verbose = process.argv.includes('--errors')

// Back-referenced end/while patterns are filled at tokenize time, so we convert with a stand-in char.
const placeholder = (source: string) =>
  source.replace(backReference, (_, n: string) => String.fromCharCode(0xe000 + Number(n)))

const variantsOf = (source: string) => {
  if (!hasAnchor(source)) return [source]
  const all = [
    resolveAnchors(source, false, false),
    resolveAnchors(source, true, false),
    resolveAnchors(source, false, true),
    resolveAnchors(source, true, true),
  ]
  return [...new Set(all)]
}

const rows: { lang: string; total: number; ok: number; clip: number; map: number; fail: number }[] = []
const errorCounts = new Map<string, number>()
const failures: { lang: string; source: string; error: string }[] = []

for (const lang of listGrammarNames()) {
  const grammar = await loadGrammar(lang)
  const unique = new Map(collectPatterns(grammar).map((p) => [p.source, p.kind]))
  const row = { lang, total: unique.size, ok: 0, clip: 0, map: 0, fail: 0 }
  for (const [raw, kind] of unique) {
    const prepared = rewriteEndOfString(raw)
    const source = kind === 'end' || kind === 'while' ? placeholder(prepared) : prepared
    const results = variantsOf(source).map((variant) => convert(variant, target))
    const failed = results.find((r) => !r.ok)
    if (failed && !failed.ok) {
      row.fail++
      const key = failed.error.replace(/"[^"]*"/g, '"…"').slice(0, 90)
      errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1)
      failures.push({ lang, source: raw, error: failed.error })
    } else if (results.some((r) => r.ok && r.strategy)) row.clip++
    else if (results.some((r) => r.ok && r.captureMap)) row.map++
    else row.ok++
  }
  rows.push(row)
}

const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + pick(r), 0)
const total = sum((r) => r.total)
console.log(`target ${target}`)
console.log('lang'.padEnd(24), 'total', ' ok', 'capmap', 'clip', 'fail')
for (const r of process.argv.includes('--all') ? rows : rows.filter((r) => r.fail || r.clip)) {
  console.log(
    r.lang.padEnd(24),
    String(r.total).padStart(5),
    String(r.ok).padStart(4),
    String(r.map).padStart(6),
    String(r.clip).padStart(4),
    String(r.fail).padStart(4),
  )
}
console.log(`\nlanguages: ${rows.length}, unique patterns: ${total}`)
console.log(
  `clean: ${sum((r) => r.ok)}  capture-map: ${sum((r) => r.map)}  clip-search: ${sum((r) => r.clip)}  failed: ${sum((r) => r.fail)} (${((sum((r) => r.fail) / total) * 100).toFixed(2)}%)`,
)
console.log('langs with failures:', rows.filter((r) => r.fail).length)
console.log('\nerror classes:')
for (const [k, v] of [...errorCounts].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(5), k)
if (verbose) for (const f of failures) console.log(`\n[${f.lang}] ${f.error}\n  ${f.source.slice(0, 200)}`)
