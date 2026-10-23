import { expect, test } from 'bun:test'
import { createHighlighter } from '@hilite/highlight'
import { notationDiff } from '@hilite/render'
import { createHighlighter as createShiki } from 'shiki'
import aliases from '../../../dist/aliases.js'
import deps from '../../../dist/deps.js'
import langs from '../../../dist/langs/index.js'
import themes from '../../../dist/themes/index.js'

const hilite = createHighlighter({ langs, deps, aliases, themes })
const code = 'const answer: number = 42 // [!code ++]\nlet s = `a${1}`'
const shiki = await createShiki({ langs: ['typescript', 'python'], themes: ['github-dark', 'github-light'] })

test('codeToHtml matches Shiki for one theme', async () => {
  expect(await hilite.codeToHtml(code, { lang: 'typescript', theme: 'github-dark' })).toBe(
    shiki.codeToHtml(code, { lang: 'typescript', theme: 'github-dark' }),
  )
})

test('codeToHtml matches Shiki for light and dark', async () => {
  const themes = { light: 'github-light', dark: 'github-dark' } as const
  expect(await hilite.codeToHtml(code, { lang: 'ts', themes })).toBe(shiki.codeToHtml(code, { lang: 'ts', themes }))
})

test('transformers pass through', async () => {
  const html = await hilite.codeToHtml(code, {
    lang: 'typescript',
    theme: 'github-dark',
    transformers: [notationDiff()],
  })
  expect(html).toContain('diff add')
  expect(html).not.toContain('[!code')
})

test('codeToAnsi and unknown names', async () => {
  expect(await hilite.codeToAnsi('x = 1', { lang: 'python', theme: 'github-dark' })).toContain('\x1b[38;2;')
  await expect(hilite.codeToHtml('x', { lang: 'nope', theme: 'github-dark' })).rejects.toThrow('unknown language')
  await expect(hilite.codeToHtml('x', { lang: 'python', theme: 'nope' })).rejects.toThrow('unknown theme')
})
