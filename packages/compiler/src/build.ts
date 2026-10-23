import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { grammars } from 'tm-grammars'
import { compileGrammar } from './compile.ts'
import { encode } from './encode.ts'
import { bundleOf, contextFor, loadRegistry } from './registry.ts'
import type { Registry } from './registry.ts'
import { collectPatterns } from './grammar.ts'
import { compileTheme } from './theme.ts'
import type { CompactTheme } from './theme.ts'
import type { Failure } from './regex-pool.ts'

const ACRONYMS = new Set(['css', 'es', 'glsl', 'html', 'js', 'json', 'jsonl', 'sfc', 'sql', 'ts', 'xml'])
/** `es-tag-css` becomes `ES Tag CSS`, for the grammars the list of bundled languages has no name for. */
const spelledOut = (id: string) =>
  id
    .split('-')
    .map((word) => (ACRONYMS.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')

export interface LangReport {
  name: string
  /** The name people write, such as `TypeScript` or `C++`. Languages that only exist to be embedded get their id spelled out. */
  displayName: string
  aliases: string[]
  /** Distinct regex sources in the grammar. */
  patterns: number
  /** Distinct converted variants kept in the blob. */
  convs: number
  failures: Failure[]
  /** Variants that need `v`-flag class sets, or `\G` handling outside the combined regex. */
  setConvs: number
  searchConvs: number
  stickyConvs: number
  clipConvs: number
  chars: number
  gzip: number
  brotli: number
  /** Brotli size of the original tm-grammars JSON, the number to beat. */
  shikiBrotli: number
  deps: string[]
}

export const brotli = (data: string | Uint8Array) =>
  brotliCompressSync(typeof data === 'string' ? Buffer.from(data) : Buffer.from(data)).length

/**
 * A blob as an ES module, so bundlers can split one chunk per language. `String.raw` keeps backslashes as written,
 * so only an unescaped backtick or `${` and a trailing backslash need splicing in through an interpolation.
 */
export const toModule = (text: string) =>
  `export default String.raw\`${text
    .replace(/(?<!\\)((?:\\\\)*)(`|\$\{)/g, (_, run: string, ch: string) => `${run}\${'${ch[0]}'}${ch.slice(1)}`)
    .replace(/(?<!\\)((?:\\\\)*)\\$/, "$1${'\\\\'}")}\``

export const compileLanguage = (registry: Registry, name: string) => {
  const source = registry.sources.get(name)!
  const { lang, failures } = compileGrammar(source.grammar, contextFor(registry, name))
  lang.injectTo = source.injectTo.length ? source.injectTo : undefined
  lang.injectionSelector = source.grammar.injectionSelector
  return { lang, failures, text: encode(lang) }
}

export interface BuildOptions {
  out: string
  languages?: string[]
  themes?: string[]
}

export const buildLanguages = async (options: BuildOptions) => {
  const registry = await loadRegistry()
  const names = options.languages ?? [...registry.sources.keys()].sort()
  const dir = join(options.out, 'langs')
  mkdirSync(dir, { recursive: true })
  const reports: LangReport[] = []
  const texts = new Map<string, string>()

  for (const name of names) {
    const { lang, failures, text } = compileLanguage(registry, name)
    const module = toModule(text)
    writeFileSync(join(dir, `${name}.js`), module)
    writeFileSync(join(dir, `${name}.d.ts`), 'declare const blob: string\nexport default blob\n')
    texts.set(name, text)
    const source = registry.sources.get(name)!
    const listed = grammars.find((g) => g.name === name)
    reports.push({
      name,
      displayName: listed?.displayName ?? spelledOut(name),
      aliases: listed?.aliases ?? [],
      patterns: new Set(collectPatterns(source.grammar).map((p) => p.source)).size,
      convs: lang.convs.length,
      failures,
      setConvs: lang.convs.filter((c) => c.set).length,
      searchConvs: lang.convs.filter((c) => c.mode === 0 && !c.set).length,
      stickyConvs: lang.convs.filter((c) => c.mode === 1).length,
      clipConvs: lang.convs.filter((c) => c.mode === 2).length,
      chars: module.length,
      gzip: gzipSync(Buffer.from(module), { level: 9 }).length,
      brotli: brotli(module),
      shikiBrotli: brotli(JSON.stringify(source.grammar)),
      deps: bundleOf(registry, name).filter((member) => member !== name),
    })
  }

  const aliases: Record<string, string> = {}
  for (const info of grammars) for (const alias of info.aliases ?? []) aliases[alias] = info.name
  writeFileSync(
    join(dir, 'index.js'),
    `export default {\n${names.map((n) => `  ${JSON.stringify(n)}: () => import('./${n}.js'),`).join('\n')}\n}\n`,
  )
  writeFileSync(join(dir, 'index.d.ts'), loadersDeclaration('string'))
  writeFileSync(
    join(options.out, 'deps.js'),
    `export default ${JSON.stringify(Object.fromEntries(reports.map((r) => [r.name, r.deps])))}\n`,
  )
  writeFileSync(join(options.out, 'deps.d.ts'), 'declare const deps: Record<string, string[]>\nexport default deps\n')
  writeFileSync(join(options.out, 'aliases.js'), `export default ${JSON.stringify(aliases)}\n`)
  writeFileSync(
    join(options.out, 'aliases.d.ts'),
    'declare const aliases: Record<string, string>\nexport default aliases\n',
  )
  return { registry, reports, texts }
}

const themeShape =
  '{ name: string; type: string; fg: string; bg: string; rules: [string[], string, string, string][]; replace?: Record<string, string> }'
const themeDeclaration = `declare const theme: ${themeShape}\nexport default theme\n`
const loadersDeclaration = (shape: string) =>
  `declare const loaders: Record<string, () => Promise<{ default: ${shape} }>>\nexport default loaders\n`

export interface ThemeReport {
  name: string
  displayName: string
  type: string
  chars: number
  brotli: number
  shikiBrotli: number
}

export const buildThemes = async (options: BuildOptions) => {
  const dir = join(options.out, 'themes')
  mkdirSync(dir, { recursive: true })
  const { bundledThemesInfo } = await import('shiki/themes')
  const reports: ThemeReport[] = []
  for (const info of bundledThemesInfo) {
    if (options.themes && !options.themes.includes(info.id)) continue
    const raw = (await info.import()).default
    const compact: CompactTheme = compileTheme(raw)
    const module = `export default ${JSON.stringify(compact)}`
    writeFileSync(join(dir, `${info.id}.js`), module)
    writeFileSync(join(dir, `${info.id}.d.ts`), themeDeclaration)
    reports.push({
      name: info.id,
      displayName: info.displayName,
      type: info.type,
      chars: module.length,
      brotli: brotli(module),
      shikiBrotli: brotli(JSON.stringify(raw)),
    })
  }
  writeFileSync(
    join(dir, 'index.js'),
    `export default {\n${reports.map((r) => `  ${JSON.stringify(r.name)}: () => import('./${r.name}.js'),`).join('\n')}\n}\n`,
  )
  writeFileSync(join(dir, 'index.d.ts'), loadersDeclaration(themeShape))
  return reports
}
