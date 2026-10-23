import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { brotliCompressSync } from 'node:zlib'
import { measureBundle } from './size.ts'

// The same five languages as the size report: typescript, python, rust, css, json.
const require = createRequire(join(import.meta.dir, '../package.json'))
const starryDir = require.resolve('@wooorm/starry-night')
const wasm = join(dirname(createRequire(starryDir).resolve('vscode-oniguruma')), '../release/onig.wasm')
const starryWasm = brotliCompressSync(readFileSync(wasm)).length

const shiki = (engine: 'js' | 'onig') => `
import { createHighlighterCore } from 'shiki/core'
import ${engine === 'js' ? "{ createJavaScriptRegexEngine } from 'shiki/engine/javascript'" : "{ createOnigurumaEngine } from 'shiki/engine/oniguruma'"}
import ts from 'shiki/langs/typescript.mjs'
import py from 'shiki/langs/python.mjs'
import rs from 'shiki/langs/rust.mjs'
import css from 'shiki/langs/css.mjs'
import json from 'shiki/langs/json.mjs'
import theme from 'shiki/themes/github-dark.mjs'
export const h = await createHighlighterCore({ themes: [theme], langs: [ts, py, rs, css, json], engine: ${engine === 'js' ? 'createJavaScriptRegexEngine()' : "createOnigurumaEngine(import('shiki/wasm'))"} })`

const hljs = `
import hljs from 'highlight.js/lib/core'
import ts from 'highlight.js/lib/languages/typescript'
import py from 'highlight.js/lib/languages/python'
import rs from 'highlight.js/lib/languages/rust'
import css from 'highlight.js/lib/languages/css'
import json from 'highlight.js/lib/languages/json'
for (const [name, lang] of Object.entries({ typescript: ts, python: py, rust: rs, css, json })) hljs.registerLanguage(name, lang)
export { hljs }`

const prism = `
import 'prismjs'
import 'prismjs/components/prism-typescript.js'
import 'prismjs/components/prism-python.js'
import 'prismjs/components/prism-rust.js'
import 'prismjs/components/prism-json.js'
export const Prism = globalThis.Prism`

const starry = `
import { createStarryNight } from '@wooorm/starry-night'
import ts from '@wooorm/starry-night/source.ts'
import py from '@wooorm/starry-night/source.python'
import rs from '@wooorm/starry-night/source.rust'
import css from '@wooorm/starry-night/source.css'
import json from '@wooorm/starry-night/source.json'
export const s = await createStarryNight([ts, py, rs, css, json])`

const sizes = {
  shikiJs: (await measureBundle(shiki('js'))).brotli,
  shikiOnig: (await measureBundle(shiki('onig'))).brotli,
  hljs: (await measureBundle(hljs)).brotli,
  prism: (await measureBundle(prism)).brotli,
  starry: (await measureBundle(starry)).brotli,
  starryWasm,
}
const count = (dir: string, pattern: RegExp) =>
  Bun.spawnSync(['ls', dir])
    .stdout.toString()
    .split('\n')
    .filter((f) => pattern.test(f)).length
const nm = join(import.meta.dir, '../node_modules')
const versionOf = (name: string): string => JSON.parse(readFileSync(join(nm, name, 'package.json'), 'utf8')).version
const inventory = {
  hljsLanguages: count(join(nm, 'highlight.js/lib/languages'), /^[^.]+\.js$/),
  hljsThemes: count(join(nm, 'highlight.js/styles'), /^[^.]+\.css$/),
  prismLanguages: count(join(nm, 'prismjs/components'), /^prism-.*(?<!\.min)\.js$/),
  prismThemes: count(join(nm, 'prismjs/themes'), /^prism[^.]*\.css$/),
  starryGrammars: count(dirname(starryDir) + '/lang', /\.js$/),
  starryThemes: count(dirname(starryDir) + '/style', /^[^.]+\.css$/) - 1,
  versions: Object.fromEntries(
    ['shiki', 'highlight.js', 'prismjs', '@wooorm/starry-night'].map((name) => [name, versionOf(name)]),
  ),
}
console.log(sizes, inventory)
mkdirSync(join(import.meta.dir, '../../../reports'), { recursive: true })
writeFileSync(join(import.meta.dir, '../../../reports/compare.json'), JSON.stringify({ sizes, inventory }, null, 2))
