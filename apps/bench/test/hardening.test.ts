import { expect, test } from 'bun:test'
import { compileLanguage, compileTheme, createRegistry } from '@hilite/compiler'
import { addLang, createGrammar, createRegistry as createCoreRegistry, decode, tokenize } from '@hilite/core'
import { createTheme, renderHtml } from '@hilite/render'
import { grammar } from './helpers.ts'

const evil = grammar('evil', [{ match: 'a', name: 'keyword.evil' }])
const sources = createRegistry([{ name: 'evil', grammar: evil, injectTo: [] }])
const core = createCoreRegistry()
addLang(core, decode(compileLanguage(sources, 'evil').text))
const evilGrammar = createGrammar(core, 'source.evil')!

const theme = createTheme(
  compileTheme({
    name: 't',
    type: 'dark',
    fg: '#ccc',
    bg: '#111',
    settings: [{ scope: 'keyword', settings: { foreground: '</style><script>x</script>{' } }],
  }),
)
const tokens = tokenize(evilGrammar, 'a')

test('pre attribute names from transformers cannot break out of the tag', () => {
  const { html } = renderHtml('a', tokens, {
    theme,
    transformers: [{ pre: (attrs) => void (attrs['x onmouseover="alert(1)" y'] = 'v') }],
  })
  expect(html).not.toContain('onmouseover="')
  expect(html).toContain(' xonmouseoveralert1y="v"')
})

test('class mode stylesheet cannot close its style element', () => {
  const { css } = renderHtml('a', tokens, { theme, classMode: true })
  expect(css).not.toMatch(/[<>]/)
  expect(css!.match(/[{}]/g)).toHaveLength(2 * css!.split('\n').length)
})

test('very long lines are not tokenized by default', () => {
  const line = 'a'.repeat(20_000)
  expect(tokenize(evilGrammar, line)[0]).toHaveLength(1)
  expect(tokenize(evilGrammar, line, { maxLineLength: 0 })[0]!.length).toBeGreaterThan(1)
})
