import { expect, test } from 'bun:test'
import { bundledLanguages, bundledThemes, codeToAnsi, codeToHtml, createHighlighter, notationDiff } from 'hilite'
import * as main from 'hilite'
import { bundledLanguagesInfo, bundledThemesInfo } from 'hilite'
import * as core from 'hilite/core'
import { createHighlighterCore } from 'hilite/core'
import { createHighlighter as createShiki } from 'shiki'

const code = 'const answer: number = 42 // [!code ++]\nlet s = `a${1}`'
const shiki = await createShiki({
  langs: ['typescript', 'python', 'sql'],
  themes: ['github-dark', 'github-light', 'nord'],
})

test('codeToHtml works with nothing set up and matches Shiki', async () => {
  expect(await codeToHtml(code, { lang: 'ts', theme: 'github-dark' })).toBe(
    shiki.codeToHtml(code, { lang: 'ts', theme: 'github-dark' }),
  )
})

test('light and dark themes by name', async () => {
  const themes = { light: 'github-light', dark: 'github-dark' } as const
  expect(await codeToHtml('SELECT 1', { lang: 'sql', themes })).toBe(
    shiki.codeToHtml('SELECT 1', { lang: 'sql', themes }),
  )
})

test('transformers, ANSI and a fresh highlighter all work', async () => {
  const html = await codeToHtml(code, { lang: 'typescript', theme: 'nord', transformers: [notationDiff()] })
  expect(html).toContain('diff add')
  expect(await codeToAnsi('x = 1', { lang: 'python', theme: 'github-dark' })).toContain('\x1b[38;2;')
  expect(await createHighlighter().codeToHtml('x', { lang: 'py', theme: 'nord' })).toContain('<pre class="shiki nord"')
})

test('lists what is bundled', () => {
  expect(bundledLanguages).toHaveLength(260)
  expect(bundledThemes).toContain('github-dark')
})

test('every bundled language loads and highlights', async () => {
  const failed: string[] = []
  for (const lang of bundledLanguages) {
    await codeToHtml('a = "b" {c} `d` ${e}\n<f>g</f>', { lang, theme: 'nord' }).catch((error: Error) =>
      failed.push(`${lang}: ${error.message.slice(-80)}`),
    )
  }
  expect(failed).toEqual([])
}, 60_000)

test('names are checked by the compiler and by the loader', async () => {
  // @ts-expect-error not a language
  await expect(codeToHtml('x', { lang: 'nope', theme: 'nord' })).rejects.toThrow('unknown language')
  // @ts-expect-error not a theme
  await expect(codeToHtml('x', { lang: 'ts', theme: 'nope' })).rejects.toThrow('unknown theme')
})

test('the core entry takes only the languages you hand it', async () => {
  const { default: deps } = await import('hilite/deps')
  const small = createHighlighterCore({
    langs: { python: () => import('hilite/langs/python') },
    deps,
    themes: { nord: () => import('hilite/themes/nord') },
  })
  expect(await small.codeToHtml('x = 1', { lang: 'python', theme: 'nord' })).toBe(
    shiki.codeToHtml('x = 1', { lang: 'python', theme: 'nord' }),
  )
})

test('the package ships its license and the notices of what it bundles', async () => {
  const dir = new URL('../../../packages/hilite/', import.meta.url)
  expect(await Bun.file(new URL('LICENSE', dir)).text()).toContain('MIT License')
  const notices = await Bun.file(new URL('dist/THIRD_PARTY_NOTICES.md', dir)).text()
  for (const name of ['tm-grammars', '@shikijs/themes', 'vscode-textmate', 'Shiki']) expect(notices).toContain(name)
})

// The type declarations are written by hand, so they must list exactly what the code exports.
const declared = async (file: string) =>
  [
    ...(await Bun.file(new URL(`../../../packages/hilite/dist/${file}`, import.meta.url)).text()).matchAll(
      /^export declare const (\w+)/gm,
    ),
  ]
    .map((m) => m[1]!)
    .sort()

test('declarations list exactly the runtime exports', async () => {
  const coreNames = await declared('core.d.ts')
  expect(Object.keys(core).sort()).toEqual(coreNames)
  expect(Object.keys(main).sort()).toEqual([...coreNames, ...(await declared('index.d.ts'))].sort())
})

test('a hostile line is cut off instead of hanging the process', async () => {
  const started = performance.now()
  const html = await codeToHtml('{'.repeat(20_000), { lang: 'css', theme: 'nord' })
  expect(html).toContain('{{{{')
  // Without the per-line time limit this input takes about twenty seconds.
  expect(performance.now() - started).toBeLessThan(4000)
}, 15_000)

test('lines past the max length are left unstyled, like Shiki', async () => {
  const text = 'const a = 1\nlet b = 2'
  expect(await codeToHtml(text, { lang: 'ts', theme: 'nord', tokenizeMaxLineLength: 12 })).toBe(
    shiki.codeToHtml(text, { lang: 'ts', theme: 'nord', tokenizeMaxLineLength: 12 }),
  )
})

test('names for pickers sit beside the ids', () => {
  const language = (id: string) => bundledLanguagesInfo.find((info) => info.id === id)
  expect(language('typescript')?.name).toBe('TypeScript')
  expect(language('cpp')).toMatchObject({ name: 'C++', aliases: ['c++'] })
  expect(language('es-tag-css')?.name).toBe('ES Tag CSS')
  expect(bundledThemesInfo.find((info) => info.id === 'github-dark')).toMatchObject({
    name: 'GitHub Dark',
    type: 'dark',
  })
  expect(bundledLanguagesInfo.map((info) => info.id).sort()).toEqual([...main.bundledLanguages].sort())
})
