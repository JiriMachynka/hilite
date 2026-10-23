import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Glob } from 'bun'
import { buildLanguages, buildThemes } from '@hilite/compiler'

const root = import.meta.dir
const data = join(root, 'src/data')
const dist = join(root, 'dist')

rmSync(data, { recursive: true, force: true })
rmSync(dist, { recursive: true, force: true })
mkdirSync(data, { recursive: true })

// Every grammar and theme is compiled once, here, and ships as its own module.
const { reports: languageReports } = await buildLanguages({ out: data })
const themeReports = await buildThemes({ out: data })

// Names for pickers: `TypeScript` rather than `typescript`, `GitHub Dark` rather than `github-dark`.
writeFileSync(
  join(data, 'info.js'),
  `export default ${JSON.stringify({
    languages: languageReports.map((r) => ({ id: r.name, name: r.displayName, aliases: r.aliases })),
    themes: themeReports.map((r) => ({ id: r.name, name: r.displayName, type: r.type })),
  })}\n`,
)
writeFileSync(
  join(data, 'info.d.ts'),
  `declare const info: {
  languages: { id: string; name: string; aliases: string[] }[]
  themes: { id: string; name: string; type: string }[]
}
export default info
`,
)

const bundled = await Bun.build({
  entrypoints: [join(root, 'src/index.ts'), join(root, 'src/core.ts')],
  outdir: dist,
  target: 'browser',
  format: 'esm',
  splitting: true,
  minify: true,
  external: ['./data/*'],
})
if (!bundled.success) throw new Error(bundled.logs.join('\n'))
cpSync(data, join(dist, 'data'), { recursive: true })

const names = (text: string) => [...text.matchAll(/^ {2}"([^"]+)":/gm)].map((m) => m[1]!)
const languages = names(readFileSync(join(data, 'langs/index.js'), 'utf8'))
const themes = names(readFileSync(join(data, 'themes/index.js'), 'utf8'))
const aliases = Object.keys(JSON.parse(readFileSync(join(data, 'aliases.js'), 'utf8').replace('export default ', '')))
const union = (values: string[]) => values.map((v) => JSON.stringify(v)).join(' | ')

const core = `declare const grammar: unique symbol

/** One token of a line: a range of the line text and the scopes that apply to it. */
export interface Token {
  start: number
  end: number
  /** Scope ids, outermost first. Turn one into a name with \`scopeName\`. */
  scopeIds: number[]
}
export interface RenderToken {
  content: string
  offset: number
  style: [string, string][]
  classes: string[]
  font: number
}
export interface RenderLine {
  classes: string[]
  tokens: RenderToken[]
}
export interface Transformer {
  /** Edit the token lists before they are turned into markup. */
  tokens?: (lines: RenderToken[][]) => void
  line?: (line: RenderLine, lineNumber: number) => void
  /** Attributes of the outer \`pre\`. */
  pre?: (attrs: Record<string, string>) => void
}
export interface ThemeData {
  name: string
  type: string
  fg: string
  bg: string
  rules: [string[], string, string, string][]
  replace?: Record<string, string>
}
export interface Theme {
  readonly data: ThemeData
}
export interface Grammar {
  readonly [grammar]: true
}
export interface HtmlOptions {
  theme?: Theme
  /** Several themes at once, such as \`{ light, dark }\`, shown through CSS variables. */
  themes?: Record<string, Theme>
  defaultColor?: string | false
  cssVariablePrefix?: string
  colorsRendering?: 'css-vars' | 'none'
  /** Classes and a stylesheet instead of inline styles. Single theme only. */
  classMode?: boolean
  tabindex?: string | false
  transformers?: Transformer[]
}
export interface Rendered {
  html: string
  /** Present in class mode. */
  css?: string
}
export interface TokenizeOptions {
  /** Milliseconds one line may take before the rest of it is left unstyled. Default 500, 0 for no limit. */
  timeLimit?: number
  /** Lines at least this long are not tokenized and come back as one token. Default 20000, 0 for no limit. */
  maxLineLength?: number
}
export type CodeToHtmlOptions<L extends string, T extends string> = Omit<HtmlOptions, 'theme' | 'themes'> & {
  lang: L
  /** Milliseconds one line may take before the rest of it is left unstyled. Default 500, 0 for no limit. */
  tokenizeTimeLimit?: number
  /** Lines at least this long are not tokenized. Default 20000, 0 for no limit. */
  tokenizeMaxLineLength?: number
} & ({ theme: T; themes?: undefined } | { themes: Record<string, T>; theme?: undefined })
export interface LoaderOptions {
  langs: Record<string, () => Promise<{ default: string }>>
  deps?: Record<string, string[]>
  aliases?: Record<string, string>
}
export interface HighlighterOptions<L extends string, T extends string> extends LoaderOptions {
  langs: Record<L, () => Promise<{ default: string }>>
  themes: Record<T, () => Promise<{ default: ThemeData }>>
}
export interface Highlighter<L extends string, T extends string> {
  codeToTokens: (code: string, lang: L, options?: TokenizeOptions) => Promise<Token[][]>
  codeToRendered: (code: string, options: CodeToHtmlOptions<L, T>) => Promise<Rendered>
  codeToHtml: (code: string, options: CodeToHtmlOptions<L, T>) => Promise<string>
  codeToAnsi: (code: string, options: { lang: L; theme: T }) => Promise<string>
}

export declare const createHighlighterCore: <L extends string, T extends string>(
  options: HighlighterOptions<L, T>,
) => Highlighter<L, T>
export declare const createLoader: (options: LoaderOptions) => { grammar: (name: string) => Promise<Grammar> }
export declare const tokenize: (grammar: Grammar, code: string, options?: TokenizeOptions) => Token[][]
export declare const scopeName: (id: number) => string
export declare const createTheme: (data: ThemeData) => Theme
export declare const renderHtml: (code: string, tokens: Token[][], options: HtmlOptions) => Rendered
export declare const renderAnsi: (code: string, tokens: Token[][], theme: Theme) => string
export declare const lineHighlight: (lines: number[]) => Transformer
export declare const lineDiff: (lines: { added?: number[]; removed?: number[] }) => Transformer
export declare const lineFocus: (lines: number[]) => Transformer
export declare const notationDiff: () => Transformer
export declare const notationHighlight: () => Transformer
export declare const notationFocus: () => Transformer
`

const index = `import type { CodeToHtmlOptions, Highlighter, Rendered, Token, TokenizeOptions } from './core.js'
export * from './core.js'

/** Every language name and alias the package accepts. */
export type BundledLanguage = ${union([...languages, ...aliases])}
export type BundledTheme = ${union(themes)}

/** The canonical language names, without aliases. */
export declare const bundledLanguages: readonly BundledLanguage[]
export declare const bundledThemes: readonly BundledTheme[]

export interface LanguageInfo {
  /** The name to pass as \`lang\`. */
  id: BundledLanguage
  /** The name to show people, such as \`TypeScript\` or \`C++\`. */
  name: string
  aliases: string[]
}
export interface ThemeInfo {
  /** The name to pass as \`theme\`. */
  id: BundledTheme
  /** The name to show people, such as \`GitHub Dark\`. */
  name: string
  type: 'light' | 'dark'
}
export declare const bundledLanguagesInfo: readonly LanguageInfo[]
export declare const bundledThemesInfo: readonly ThemeInfo[]

export declare const createHighlighter: () => Highlighter<BundledLanguage, BundledTheme>

export declare const codeToHtml: (code: string, options: CodeToHtmlOptions<BundledLanguage, BundledTheme>) => Promise<string>
export declare const codeToRendered: (
  code: string,
  options: CodeToHtmlOptions<BundledLanguage, BundledTheme>,
) => Promise<Rendered>
export declare const codeToAnsi: (code: string, options: { lang: BundledLanguage; theme: BundledTheme }) => Promise<string>
export declare const codeToTokens: (code: string, lang: BundledLanguage, options?: TokenizeOptions) => Promise<Token[][]>
`
writeFileSync(join(dist, 'core.d.ts'), core)
writeFileSync(join(dist, 'index.d.ts'), index)

// Grammars and themes keep their own licenses, so their notices ship in the package.
const store = join(root, '../../node_modules/.bun')
const installed = (name: string, file: string) => {
  const [match] = [...new Glob(`${name.replace('/', '+')}@*/node_modules/${name}/${file}`).scanSync({ cwd: store })]
  if (!match) throw new Error(`${name}: ${file} not found in ${store}`)
  return readFileSync(join(store, match), 'utf8').trim()
}
const notice = [
  '# Third-party notices',
  '',
  'Hilite is MIT licensed (see LICENSE). It includes the work of the projects below, each under its own license.',
  '',
  '## Grammars',
  '',
  'The compiled languages in `data/langs` are generated from the `tm-grammars` package. Each grammar keeps the license of the project it came from, listed here.',
  '',
  installed('tm-grammars', 'NOTICE'),
  '',
  '## Themes',
  '',
  'The compiled themes in `data/themes` are generated from the `@shikijs/themes` package, which collects VS Code themes. Each theme belongs to its author and keeps their license; `@shikijs/themes` itself is:',
  '',
  installed('@shikijs/themes', 'LICENSE'),
  '',
  '## vscode-textmate',
  '',
  'The tokenizer is a port of the TextMate grammar algorithm in vscode-textmate.',
  '',
  installed('vscode-textmate', 'LICENSE.md'),
  '',
  '## Shiki',
  '',
  'The HTML output format, the comment-marker transformers and the theme handling follow Shiki.',
  '',
  installed('shiki', 'LICENSE'),
  '',
].join('\n')
writeFileSync(join(dist, 'THIRD_PARTY_NOTICES.md'), notice)

const size = (path: string) => readFileSync(join(dist, path)).length
console.log(`${languages.length} languages, ${themes.length} themes, ${aliases.length} aliases`)
console.log(`dist/index.js ${size('index.js')} bytes, dist/core.js ${size('core.js')} bytes`)
