import { expect, test } from 'bun:test'
import { compileTheme, createRegistry } from '@hilite/compiler'
import { createTheme, renderHtml } from '@hilite/render'
import type { Transformer } from '@hilite/render'
import { createHighlighterCore } from 'shiki/core'
import type { ThemeRegistrationRaw } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'
import { hiliteFrom } from '../src/lib/hilite.ts'
import { grammar } from './helpers.ts'

const lang = grammar('demo', [
  { match: '\\b(?:let|fn)\\b', name: 'keyword.control.demo' },
  { match: '\\d+', name: 'constant.numeric.demo' },
  {
    begin: '"',
    end: '"',
    name: 'string.quoted.double.demo',
    patterns: [{ match: '\\\\.', name: 'constant.character.escape.demo' }],
  },
  { match: '//.*$', name: 'comment.line.demo' },
  { match: '[<&]', name: 'keyword.operator.demo' },
  {
    begin: '\\{',
    end: '\\}',
    name: 'meta.block.demo',
    patterns: [{ match: '\\w+', name: 'variable.other.demo' }, { include: '$self' }],
  },
])

const theme = (name: string, type: string, rules: ThemeRegistrationRaw['settings']): ThemeRegistrationRaw => ({
  name,
  type: type as 'dark',
  fg: '#cccccc',
  bg: '#111111',
  settings: rules,
})

const dark = theme('t-dark', 'dark', [
  { settings: { foreground: '#cccccc', background: '#111111' } },
  { scope: ['keyword', 'constant.numeric'], settings: { foreground: '#ff0000', fontStyle: 'bold italic' } },
  { scope: 'string', settings: { foreground: '#00ff00' } },
  { scope: 'string constant.character.escape', settings: { foreground: '#00ffff', fontStyle: 'underline' } },
  { scope: 'meta.block variable', settings: { foreground: '#ffff00', background: '#222222' } },
  { scope: 'comment', settings: { foreground: '#888888', fontStyle: 'italic strikethrough' } },
  { scope: 'meta.block > keyword', settings: { fontStyle: '' } },
])
const light = theme('t-light', 'light', [
  { settings: { foreground: '#222222', background: '#ffffff' } },
  { scope: 'keyword', settings: { foreground: '#aa0000' } },
  { scope: 'string', settings: { foreground: '#005500', fontStyle: 'bold' } },
])

const code = 'let a = 1 // note <b> & "q\\"x" fn\n{ let b 22 "z" }\n  \n\tfn 3'

const engine = createOnigurumaEngine(import('shiki/wasm'))
const shiki = await createHighlighterCore({ themes: [dark, light], langs: [{ ...lang, repository: {} }], engine })
const registry = createRegistry([{ name: 'demo', grammar: lang, injectTo: [] }])
const tokens = hiliteFrom(registry, 'demo').tokens(code)
const darkTheme = createTheme(compileTheme(dark))
const lightTheme = createTheme(compileTheme(light))

test('single theme html is byte for byte what Shiki writes', () => {
  expect(renderHtml(code, tokens, { theme: darkTheme }).html).toBe(
    shiki.codeToHtml(code, { lang: 'demo', theme: 't-dark' }),
  )
})

test('dual themes use CSS variables like Shiki', () => {
  const want = shiki.codeToHtml(code, { lang: 'demo', themes: { light: 't-light', dark: 't-dark' } })
  expect(renderHtml(code, tokens, { themes: { light: lightTheme, dark: darkTheme } }).html).toBe(want)
  expect(want).toContain('--shiki-dark')
})

test('no default color puts every theme behind variables', () => {
  const options = { themes: { light: 't-light', dark: 't-dark' }, defaultColor: false } as const
  const want = shiki.codeToHtml(code, { lang: 'demo', ...options })
  expect(renderHtml(code, tokens, { themes: { light: lightTheme, dark: darkTheme }, defaultColor: false }).html).toBe(
    want,
  )
})

test('light-dark() default color matches Shiki', () => {
  const want = shiki.codeToHtml(code, {
    lang: 'demo',
    themes: { light: 't-light', dark: 't-dark' },
    defaultColor: 'light-dark()',
  })
  expect(
    renderHtml(code, tokens, { themes: { light: lightTheme, dark: darkTheme }, defaultColor: 'light-dark()' }).html,
  ).toBe(want)
})

test('class mode swaps inline styles for classes and a stylesheet', () => {
  const { html, css } = renderHtml(code, tokens, { theme: darkTheme, classMode: true })
  expect(html).not.toContain('<span style=')
  expect(html).toMatch(/<span class="t0">let<\/span>/)
  expect(css).toContain('.t0{color:#FF0000;font-style:italic;font-weight:bold}')
})

test('transformers can edit lines and the pre element', () => {
  const highlight: Transformer = {
    line: (line, n) => {
      if (n === 2) line.classes.push('highlighted')
    },
    pre: (attrs) => {
      attrs['data-x'] = '1'
    },
  }
  const { html } = renderHtml(code, tokens, { theme: darkTheme, transformers: [highlight] })
  expect(html).toContain('<span class="line highlighted">')
  expect(html.match(/highlighted/g)).toHaveLength(1)
  expect(html).toContain('data-x="1"')
})

test('tokens that differ only in background or token type stay separate spans', () => {
  const html = renderHtml(code, tokens, { theme: darkTheme }).html
  expect(html).toBe(shiki.codeToHtml(code, { lang: 'demo', theme: 't-dark' }))
  // Same color, different background (and string vs other): vscode-textmate keeps them apart.
  expect(html).toContain('<span style="color:#FFFF00">let</span><span style="color:#FFFF00"> b</span>')
})

test('escapes text and attribute values', () => {
  const { html } = renderHtml('a<b>&"', [[{ start: 0, end: 6, scopeIds: [] }]], { theme: darkTheme })
  expect(html).toContain('a&#x3C;b>&#x26;"')
})

test('ansi output matches the Shiki CLI', async () => {
  const { codeToANSI } = await import('@shikijs/cli')
  const { renderAnsi } = await import('@hilite/render')
  const sample = 'let a = 1 // c\n{ fn x }\n'
  const mine = renderAnsi(sample, hiliteFrom(registry, 'demo').tokens(sample), darkTheme)
  // The CLI loads languages itself, so compare on a bundled one.
  const { hiliteFor } = await import('../src/lib/hilite.ts')
  const js = 'const a = [1, "x"] // note\nfunction f() { return `t${a}` }\n'
  const github = (await import('../src/lib/themes.ts')).loadHiliteTheme
  const want = await codeToANSI(js, 'javascript', 'github-dark')
  expect(renderAnsi(js, hiliteFor('javascript').tokens(js), await github('github-dark'))).toBe(want)
  expect(mine).toContain('\x1b[38;2;')
  expect(mine).toContain('\x1b[1m')
})

test('tokens that look the same but differ in background or token type stay separate spans', async () => {
  const pairs = grammar('pairs', [
    { match: 'a', name: 'x.one' },
    { match: 'b', name: 'x.two' },
    { match: 'c', name: 'plain.c' },
    { match: 'd', name: 'string.d' },
  ])
  const flat = theme('flat', 'dark', [
    { settings: { foreground: '#cccccc', background: '#111111' } },
    { scope: 'x.one', settings: { foreground: '#ff0000' } },
    { scope: 'x.two', settings: { foreground: '#ff0000', background: '#0000ff' } },
    { scope: ['plain', 'string'], settings: { foreground: '#00ff00' } },
  ])
  const text = 'ab\ncd'
  const highlighter = await createHighlighterCore({ themes: [flat], langs: [{ ...pairs, repository: {} }], engine })
  const reg = createRegistry([{ name: 'pairs', grammar: pairs, injectTo: [] }])
  const html = renderHtml(text, hiliteFrom(reg, 'pairs').tokens(text), { theme: createTheme(compileTheme(flat)) }).html
  expect(html).toBe(highlighter.codeToHtml(text, { lang: 'pairs', theme: 'flat' }))
  expect(html).toContain('<span style="color:#FF0000">a</span><span style="color:#FF0000">b</span>')
  expect(html).toContain('<span style="color:#00FF00">c</span><span style="color:#00FF00">d</span>')
})

test('strict parent selectors only look at the direct parent', async () => {
  const nested = grammar('nested', [
    {
      begin: '\\{',
      end: '\\}',
      name: 'meta.block',
      patterns: [
        { match: 'kw', name: 'keyword.k' },
        { begin: '\\(', end: '\\)', name: 'meta.inner', patterns: [{ match: 'kw', name: 'keyword.k' }] },
      ],
    },
  ])
  const strict = theme('strict', 'dark', [
    { settings: { foreground: '#cccccc', background: '#111111' } },
    { scope: 'meta.block > keyword', settings: { foreground: '#ff0000' } },
    { scope: 'meta.block keyword', settings: { fontStyle: 'bold' } },
  ])
  const text = '{ kw ( kw ) }'
  const highlighter = await createHighlighterCore({ themes: [strict], langs: [{ ...nested, repository: {} }], engine })
  const reg = createRegistry([{ name: 'nested', grammar: nested, injectTo: [] }])
  const html = renderHtml(text, hiliteFrom(reg, 'nested').tokens(text), {
    theme: createTheme(compileTheme(strict)),
  }).html
  expect(html).toBe(highlighter.codeToHtml(text, { lang: 'nested', theme: 'strict' }))
  expect(html).toContain('color:#FF0000')
  expect(html).toContain('font-weight:bold')
})

test('built-in line transformers add the classes Shiki uses for notation', async () => {
  const { lineDiff, lineFocus, lineHighlight } = await import('@hilite/render')
  const { html } = renderHtml(code, tokens, {
    theme: darkTheme,
    transformers: [lineHighlight([1]), lineDiff({ added: [2], removed: [3] }), lineFocus([4])],
  })
  expect(html).toContain('<span class="line highlighted">')
  expect(html).toContain('<span class="line diff add">')
  expect(html).toContain('<span class="line diff remove">')
  expect(html).toContain('<span class="line focused">')
  expect(html).toMatch(/<pre class="shiki t-dark has-highlighted has-diff has-focused"/)
})

test('comment markers match Shiki notation transformers', async () => {
  const { notationDiff, notationFocus, notationHighlight } = await import('@hilite/render')
  const { transformerNotationDiff, transformerNotationFocus, transformerNotationHighlight } =
    await import('@shikijs/transformers')
  const marked = [
    'let a = 1 // [!code ++]',
    'let b = 2 // [!code --] [!code focus]',
    '// [!code highlight:2]',
    'let c = 3',
    'let d = 4 // keep [!code hl]',
    '// [!code ++]',
  ].join('\n')
  const markedTokens = hiliteFrom(registry, 'demo').tokens(marked)
  const { html } = renderHtml(marked, markedTokens, {
    theme: darkTheme,
    transformers: [notationDiff(), notationHighlight(), notationFocus()],
  })
  const want = shiki.codeToHtml(marked, {
    lang: 'demo',
    theme: 't-dark',
    transformers: [transformerNotationDiff(), transformerNotationHighlight(), transformerNotationFocus()],
  })
  // Shiki keeps the newline before a removed last line; Hilite does not.
  expect(html).toBe(want.replace('\n</code>', '</code>'))
  expect(html).not.toContain('[!code ++]')
})

test('array scope entries are single selectors even when they contain a comma', async () => {
  const odd = theme('odd', 'dark', [
    { settings: { foreground: '#cccccc', background: '#111111' } },
    { scope: ['keyword, constant'], settings: { foreground: '#ff0000' } },
    { scope: 'keyword, constant', settings: { fontStyle: 'bold' } },
  ])
  const highlighter = await createHighlighterCore({ themes: [odd], langs: [{ ...lang, repository: {} }], engine })
  const html = renderHtml(code, tokens, { theme: createTheme(compileTheme(odd)) }).html
  expect(html).toBe(highlighter.codeToHtml(code, { lang: 'demo', theme: 'odd' }))
  expect(html).toContain('font-weight:bold')
})
