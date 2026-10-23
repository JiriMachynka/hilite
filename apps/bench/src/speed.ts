import { addLang, createGrammar, createRegistry, decode, tokenizeLine } from '@hilite/core'
import type { Frame } from '@hilite/core'
import { bundleOf, compileGrammar, contextFor, encode, loadRegistry } from '@hilite/compiler'
import { createTheme, renderHtml } from '@hilite/render'
import { compileTheme } from '@hilite/compiler'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const engine = process.argv[2] ?? 'hilite'
const lang = process.argv[3] ?? 'javascript'
const src = readFileSync(join(import.meta.dir, '../corpus/perf/web-tree-sitter-2000.js'), 'utf8')
const runs = 5

const report = (init: number, first: number, warm: number) =>
  process.argv.includes('--json')
    ? console.log(JSON.stringify({ engine, init, first, warm }))
    : console.log(
        engine.padEnd(10),
        'init',
        init.toFixed(0).padStart(5),
        'ms | first run',
        first.toFixed(0).padStart(5),
        'ms | warm',
        warm.toFixed(0).padStart(4),
        'ms |',
        src.split('\n').length,
        'lines,',
        (src.length / 1024).toFixed(0),
        'KB',
      )

const measure = (init: number, run: () => void) => {
  const t1 = performance.now()
  run()
  const t2 = performance.now()
  for (let i = 0; i < runs; i++) run()
  const t3 = performance.now()
  report(init, t2 - t1, (t3 - t2) / runs)
}

if (engine === 'hilite') {
  // Blobs are prebuilt and loaded the way a shipped bundle would: decode, link, theme.
  const registry = await loadRegistry()
  const blobs = bundleOf(registry, lang).map((name) =>
    encode(compileGrammar(registry.sources.get(name)!.grammar, contextFor(registry, name)).lang),
  )
  const themeData = compileTheme((await import('@shikijs/themes/github-dark')).default)
  const t0 = performance.now()
  const reg = createRegistry()
  for (const blob of blobs) addLang(reg, decode(blob))
  const grammar = createGrammar(reg, registry.sources.get(lang)!.grammar.scopeName)!
  const theme = createTheme(themeData)
  const init = performance.now() - t0
  measure(init, () => {
    let state: Frame | null = null
    const lines = src.split(/\r?\n/).map((line) => {
      if (line === '') return []
      const r = tokenizeLine(grammar, line, state)
      state = r.state
      return r.tokens
    })
    renderHtml(src, lines, { theme })
  })
} else if (engine === 'hljs') {
  const { default: hljs } = await import('highlight.js/lib/core')
  const { default: javascript } = await import('highlight.js/lib/languages/javascript')
  const t0 = performance.now()
  hljs.registerLanguage('javascript', javascript)
  measure(performance.now() - t0, () => hljs.highlight(src, { language: 'javascript' }).value)
} else if (engine === 'prism') {
  const { default: Prism } = await import('prismjs')
  const t0 = performance.now()
  const grammar = Prism.languages.javascript!
  measure(performance.now() - t0, () => Prism.highlight(src, grammar, 'javascript'))
} else if (engine === 'starry') {
  const { createStarryNight, common } = await import('@wooorm/starry-night')
  const { toHtml } = await import('hast-util-to-html')
  const t0 = performance.now()
  const starry = await createStarryNight(common)
  const init = performance.now() - t0
  measure(init, () => toHtml(starry.highlight(src, 'source.js')))
} else {
  const registry = await loadRegistry()
  const langs = bundleOf(registry, lang).map((name) => {
    const s = registry.sources.get(name)!
    return { ...s.grammar, repository: s.grammar.repository ?? {}, name, injectTo: s.injectTo }
  })
  const t0 = performance.now()
  const highlighter = await createHighlighterCore({
    themes: [import('@shikijs/themes/github-dark')],
    langs,
    engine: engine === 'onig' ? createOnigurumaEngine(import('shiki/wasm')) : createJavaScriptRegexEngine(),
  })
  const init = performance.now() - t0
  measure(init, () => highlighter.codeToHtml(src, { lang, theme: 'github-dark' }))
}
