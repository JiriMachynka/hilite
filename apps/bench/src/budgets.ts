import { measure } from './size.ts'

// Spec numbers from the task, in KB of brotli unless noted.
const SPEC = {
  coreKb: 10,
  fiveLangKb: 40,
  meanLanguageRatio: 0.5,
}

// What the build is held to. A budget that matches the spec is a hard limit; where the spec target
// is not reached yet, the guard sits just above the measured value so size cannot quietly grow.
const GUARD = {
  meanLanguageRatio: 0.95,
  worstLanguageRatio: 1.25,
}

const sizes = await measure()
const kb = (n: number) => n / 1024
const ratios = sizes.languages.map((l) => l.brotli / l.shikiBrotli)
const mean = ratios.reduce((s, v) => s + v, 0) / ratios.length
// Tiny injection grammars (a few hundred bytes) are mostly fixed overhead, so the ratio only means something above 1 KB.
const worst = sizes.languages
  .filter((l) => l.shikiBrotli >= 1024)
  .reduce((a, b) => (a.brotli / a.shikiBrotli > b.brotli / b.shikiBrotli ? a : b))
const aggregate =
  sizes.languages.reduce((s, l) => s + l.brotli, 0) / sizes.languages.reduce((s, l) => s + l.shikiBrotli, 0)

interface Row {
  name: string
  value: number
  limit: number
  unit: string
  spec?: number
}

const rows: Row[] = [
  { name: 'core runtime', value: kb(sizes.core.brotli), limit: SPEC.coreKb, unit: 'KB br' },
  {
    name: '5 languages + github-dark + core + render',
    value: kb(sizes.fiveLanguages.brotli),
    limit: SPEC.fiveLangKb,
    unit: 'KB br',
  },
  {
    name: 'mean language size vs Shiki JSON',
    value: mean,
    limit: GUARD.meanLanguageRatio,
    unit: 'x',
    spec: SPEC.meanLanguageRatio,
  },
  {
    name: `largest language (${worst.name}) vs Shiki JSON`,
    value: worst.brotli / worst.shikiBrotli,
    limit: GUARD.worstLanguageRatio,
    unit: 'x',
  },
]

let failed = false
for (const row of rows) {
  const over = row.value > row.limit
  failed ||= over
  const spec =
    row.spec !== undefined ? `  (spec target ${row.spec}${row.value > row.spec ? ', NOT MET' : ', met'})` : ''
  console.log(
    `${over ? 'FAIL' : 'ok  '} ${row.name.padEnd(46)} ${row.value.toFixed(2).padStart(7)} ${row.unit} (limit ${row.limit})${spec}`,
  )
}
console.log(
  `\naggregate over ${sizes.languages.length} languages: ${aggregate.toFixed(3)}x of Shiki's grammar JSON (brotli)`,
)
if (failed) process.exit(1)
