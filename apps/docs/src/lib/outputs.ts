import { scopeName } from '@hilite/core'
import { renderAnsi, renderHtml } from '@hilite/render'
import type { HtmlOptions, Theme } from '@hilite/render'
import { colorOf } from '../../../../packages/render/src/style.ts'
import { resolve } from '../../../../packages/render/src/theme.ts'
import { codeTheme, highlight, tokensOf } from './highlight.ts'
import { esc } from './html.ts'

// What each output of the highlighter looks like, rendered at build time so the docs show results, not promises.

/** A panel holding a result, so no Copy button. */
export const outPanel = (name: string, inner: string, kind = '') =>
  `<div class="panel out${kind ? ` ${kind}` : ''}"><span class="name">${esc(name)}</span>${inner}</div>`

/** Real `renderHtml` output, shown as rendered and as the markup itself. */
export const htmlOutput = async (lang: string, code: string, options: Partial<HtmlOptions> = {}) => {
  const { html } = renderHtml(code, await tokensOf(lang, code), { theme: codeTheme, tabindex: false, ...options })
  return { html, markup: await highlight('html', html) }
}

/** The rendered block, with its markup folded away underneath. */
export const htmlPanel = async (lang: string, code: string, options: Partial<HtmlOptions> = {}, name = 'Output') => {
  const { html, markup } = await htmlOutput(lang, code, options)
  return outPanel(name, `${html}<details class="markup"><summary>Markup</summary>${markup}</details>`)
}

/** Truecolor escapes back into colored spans, the way a terminal paints them. */
const ansiToHtml = (ansi: string) => {
  let color = ''
  const font = new Set<string>()
  const [first = '', ...sequences] = ansi.split('\x1b[')
  let out = ''
  const flush = (text: string) => {
    if (!text) return
    const style = [color && `color:${color}`, ...font].filter(Boolean).join(';')
    out += style ? `<span style="${style}">${esc(text)}</span>` : esc(text)
  }
  flush(first)
  // Each piece starts with the parameters of one escape, up to its "m", then the text it applies to.
  for (const sequence of sequences) {
    const end = sequence.indexOf('m')
    const [code, , r, g, b] = sequence.slice(0, end).split(';').map(Number)
    if (code === 38) color = `rgb(${r},${g},${b})`
    else if (code === 39) color = ''
    else if (code === 1) font.add('font-weight:700')
    else if (code === 22) font.delete('font-weight:700')
    else if (code === 3) font.add('font-style:italic')
    else if (code === 23) font.delete('font-style:italic')
    else if (code === 4) font.add('text-decoration:underline')
    else if (code === 24) font.delete('text-decoration:underline')
    flush(sequence.slice(end + 1))
  }
  return out
}

/** `codeToAnsi` output in a terminal, with the start of the raw escapes underneath. */
export const terminal = async (lang: string, code: string, command: string, theme: Theme = codeTheme) => {
  const ansi = renderAnsi(code, await tokensOf(lang, code), theme)
  const raw = ansi.split('\n')[0]!.slice(0, 96).replaceAll('\x1b', '␛')
  return `<div class="term"><pre><code><span class="term-prompt">$ ${esc(command)}</span>\n${ansiToHtml(ansi)}</code></pre><p class="term-raw"><span>What the terminal receives</span><code>${esc(raw)}…</code></p></div>`
}

/** One row per token: its text, the color the theme gives it, and its scope stack. */
export const tokenRows = async (lang: string, code: string, theme: Theme = codeTheme) => {
  const tokens = await tokensOf(lang, code)
  return code.split('\n').flatMap((line, index) =>
    (tokens[index] ?? []).map((token) => ({
      line: index,
      start: token.start,
      end: token.end,
      text: line.slice(token.start, token.end),
      color: colorOf(theme, resolve(theme, token.scopeIds).fg) || theme.data.fg,
      scopes: token.scopeIds.map(scopeName),
    })),
  )
}

/** `codeToTokens` output as a table. Whitespace tokens are left out to keep it readable. */
export const tokenTable = async (lang: string, code: string, limit = Infinity) => {
  const rows = (await tokenRows(lang, code)).filter((row) => row.text.trim()).slice(0, limit)
  const body = rows
    .map(
      (row) =>
        `<tr><td class="num">${row.line + 1}:${row.start}–${row.end}</td><td><code style="color:${esc(row.color)}">${esc(row.text)}</code></td><td class="scopes">${row.scopes
          .slice(1)
          .map((s, i, all) => (i === all.length - 1 ? `<b>${esc(s)}</b>` : esc(s)))
          .join(' ')}</td></tr>`,
    )
    .join('')
  return `<div class="token-table"><table><thead><tr><th>Line:range</th><th>Text</th><th>Scopes, innermost in bold</th></tr></thead><tbody>${body}</tbody></table></div>`
}

/** Every token as its own span carrying its scope stack, for the explorer on the Concepts page. */
export const scopeExplorer = async (lang: string, code: string, theme: Theme = codeTheme) => {
  const rows = await tokenRows(lang, code, theme)
  const lines = code.split('\n').map((_, index) =>
    rows
      .filter((row) => row.line === index)
      .map((row) =>
        row.text.trim()
          ? `<span class="tok" style="color:${esc(row.color)}" data-color="${esc(row.color)}" data-scopes="${esc(row.scopes.join(' '))}">${esc(row.text)}</span>`
          : esc(row.text),
      )
      .join(''),
  )
  const bg = theme.data.replace?.[theme.data.bg.toLowerCase()] ?? theme.data.bg
  return `<pre class="shiki" style="background-color:${esc(bg)};color:${esc(theme.data.fg)}" tabindex="0"><code>${lines
    .map((line) => `<span class="line">${line}</span>`)
    .join('\n')}</code></pre>`
}

/** Class mode: markup with class names, plus the stylesheet that colors them. */
export const classOutput = async (lang: string, code: string) => {
  const { html, css = '' } = renderHtml(code, await tokensOf(lang, code), {
    theme: codeTheme,
    classMode: true,
    tabindex: false,
  })
  return { markup: await highlight('html', html), css: await highlight('css', css.trim()) }
}
