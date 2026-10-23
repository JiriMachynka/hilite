import { createLoader, tokenize } from '@hilite/core'
import { createTheme, renderHtml } from '@hilite/render'
import type { Theme, Transformer } from '@hilite/render'
import deps from '../../../../dist/deps.js'
import langs from '../../../../dist/langs/index.js'
import themes from '../../../../dist/themes/index.js'
import { langInfo } from './data.ts'
import { esc } from './html.ts'
import { iconFor } from './icons.ts'

// The site highlights itself with the engine it documents.
const loader = createLoader({ langs, deps })

const themeData = async (name: string) => {
  const load = themes[name]
  if (!load) throw new Error(`unknown theme "${name}"`)
  return (await load()).default
}
export const codeTheme = createTheme(await themeData('github-dark'))
export const lightTheme = createTheme(await themeData('github-light'))

export const tokensOf = async (lang: string, code: string) => tokenize(await loader.grammar(lang), code)

export const langIcon = (id: string) => iconFor(id, langInfo.get(id)?.aliases)

export const highlight = async (lang: string, code: string, theme: Theme = codeTheme) => {
  const grammar = await loader.grammar(lang)
  return renderHtml(code, tokenize(grammar, code), { theme }).html
}

export const highlightWith = async (lang: string, code: string, transformers: Transformer[]) => {
  const grammar = await loader.grammar(lang)
  return renderHtml(code, tokenize(grammar, code), { theme: codeTheme, transformers }).html
}

/** A code block with its file name and a Copy button. */
export const panel = async (lang: string, code: string, name: string) =>
  `<div class="panel"><span class="name">${langInfo.has(lang) ? langIcon(lang) : ''}${esc(name)}</span><button type="button" class="copy" aria-label="Copy code">Copy</button>${await highlight(lang, code.replace(/\n$/, ''))}</div>`

/** The output of transformers, so no Copy button. */
export const demo = async (code: string, transformers: Transformer[], name: string) =>
  `<div class="panel"><span class="name">${langIcon('typescript')}${esc(name)}</span>${await highlightWith('typescript', code, transformers)}</div>`

/** One render with light and dark as CSS variables, the dual-themes output itself. */
export const dualHighlight = async (lang: string, code: string) => {
  const grammar = await loader.grammar(lang)
  return renderHtml(code, tokenize(grammar, code), {
    themes: { light: lightTheme, dark: codeTheme },
    tabindex: false,
  }).html
}

/** A theme's own background and foreground behind "Aa". */
export const swatch = async (name: string) => {
  const data = await themeData(name)
  const color = (value: string) => data.replace?.[value.toLowerCase()] ?? value
  return `<span class="sw" style="background:${esc(color(data.bg))};color:${esc(color(data.fg))}">Aa</span>`
}
