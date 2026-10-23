import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderHtml } from '@hilite/render'
import { createHighlighterCore } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'
import { corpusLangs, snippetsFor } from './lib/corpus.ts'
import { hiliteFor } from './lib/hilite.ts'
import { shikiLangs } from './lib/reference.ts'
import { cssVariablesTheme, hiliteCssVariablesTheme, loadHiliteTheme } from './lib/themes.ts'

const args = process.argv.slice(2)
const verbose = args.includes('-v')
const langs = args.filter((a) => !a.startsWith('-'))
const targets = langs.length ? langs : corpusLangs()

const engine = createOnigurumaEngine(import('shiki/wasm'))
const dark = await loadHiliteTheme('github-dark')
const light = await loadHiliteTheme('github-light')
const vars = hiliteCssVariablesTheme()

const cases = [
  { id: 'single', shiki: { theme: 'github-dark' }, hilite: { theme: dark } },
  {
    id: 'dual',
    shiki: { themes: { light: 'github-light', dark: 'github-dark' } },
    hilite: { themes: { light, dark } },
  },
  { id: 'vars', shiki: { theme: 'css-variables' }, hilite: { theme: vars } },
] as const

const firstDiff = (a: string, b: string) => {
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  return `...${a.slice(Math.max(0, i - 60), i + 80)}\n    ${b.slice(Math.max(0, i - 60), i + 80)}`
}

const totals = { all: 0, ok: 0 }
let languageCount = 0
const failed: string[] = []
for (const lang of targets) {
  const shiki = await createHighlighterCore({
    themes: [import('@shikijs/themes/github-dark'), import('@shikijs/themes/github-light'), cssVariablesTheme],
    langs: shikiLangs(lang),
    engine,
  })
  const hilite = hiliteFor(lang)
  let ok = 0
  let all = 0
  for (const snippet of await snippetsFor(lang)) {
    const tokens = hilite.tokens(snippet.code)
    for (const c of cases) {
      all++
      const want = shiki.codeToHtml(snippet.code, { lang, ...c.shiki })
      const got = renderHtml(snippet.code, tokens, c.hilite).html
      if (want === got) ok++
      else if (verbose) console.log(`  [${lang}/${snippet.label}/${c.id}]\n    ${firstDiff(want, got)}`)
    }
  }
  shiki.dispose()
  languageCount++
  totals.all += all
  totals.ok += ok
  if (ok !== all) failed.push(lang)
  console.log(lang.padEnd(22), `${ok}/${all}`)
}
console.log(`\nbyte-identical: ${totals.ok}/${totals.all} (${((totals.ok / totals.all) * 100).toFixed(2)}%)`)
console.log(`languages with differences: ${failed.length}${failed.length ? ` -> ${failed.join(', ')}` : ''}`)

if (!langs.length) {
  mkdirSync(join(import.meta.dir, '../../../reports'), { recursive: true })
  writeFileSync(
    join(import.meta.dir, '../../../reports/html.json'),
    JSON.stringify({ ...totals, languages: languageCount, failed }, null, 2),
  )
}
