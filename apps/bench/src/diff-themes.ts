import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { compileTheme } from '@hilite/compiler'
import { createTheme, renderHtml } from '@hilite/render'
import { bundledThemesInfo } from 'shiki/themes'
import { createHighlighterCore } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'
import { snippetsFor } from './lib/corpus.ts'
import { hiliteFor } from './lib/hilite.ts'
import { shikiLangs } from './lib/reference.ts'

// Every bundled theme, on a spread of languages, single theme and paired with another one.
const langs = ['typescript', 'css', 'python', 'markdown', 'html', 'rust']
const engine = createOnigurumaEngine(import('shiki/wasm'))

const themes = await Promise.all(
  bundledThemesInfo.map(async (info) => {
    const raw = (await info.import()).default
    return { id: info.id, raw, theme: createTheme(compileTheme(raw)) }
  }),
)
console.log(`themes: ${themes.length}`)

let ok = 0
let all = 0
const bad = new Map<string, number>()
for (const lang of langs) {
  const shiki = await createHighlighterCore({ themes: themes.map((t) => t.raw), langs: shikiLangs(lang), engine })
  const hilite = hiliteFor(lang)
  const full = (await snippetsFor(lang)).find((s) => s.label === 'full')!
  const tokens = hilite.tokens(full.code)
  for (const [index, t] of themes.entries()) {
    const pair = themes[(index + 7) % themes.length]!
    const cases: { name: string; want: string; got: string }[] = [
      {
        name: t.id,
        want: shiki.codeToHtml(full.code, { lang, theme: t.id }),
        got: renderHtml(full.code, tokens, { theme: t.theme }).html,
      },
      {
        name: `${t.id}+${pair.id}`,
        want: shiki.codeToHtml(full.code, { lang, themes: { light: t.id, dark: pair.id } }),
        got: renderHtml(full.code, tokens, { themes: { light: t.theme, dark: pair.theme } }).html,
      },
    ]
    for (const c of cases) {
      all++
      if (c.want === c.got) ok++
      else bad.set(c.name, (bad.get(c.name) ?? 0) + 1)
    }
  }
  shiki.dispose()
}
console.log(`byte-identical: ${ok}/${all} (${((ok / all) * 100).toFixed(2)}%)`)
if (bad.size) console.log('differences:', [...bad].map(([k, v]) => `${k} x${v}`).join(', '))
mkdirSync(join(import.meta.dir, '../../../reports'), { recursive: true })
writeFileSync(
  join(import.meta.dir, '../../../reports/themes.json'),
  JSON.stringify({ themes: themes.length, languages: langs, ok, all }, null, 2),
)
process.exit(bad.size ? 1 : 0)
