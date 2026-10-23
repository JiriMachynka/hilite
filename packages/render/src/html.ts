import type { Token } from '@hilite/core'
import { fontStyles, splitLines, styleLine } from './style.ts'
import type { Styled } from './style.ts'
import { Font } from './theme.ts'
import type { Theme } from './theme.ts'

export interface RenderToken {
  content: string
  offset: number
  /** Inline style declarations, in output order. */
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
  /** Attributes of the outer `<pre>`. */
  pre?: (attrs: Record<string, string>) => void
}

export interface HtmlOptions {
  theme?: Theme
  /** Several themes at once, e.g. `{ light, dark }`, shown through CSS variables. */
  themes?: Record<string, Theme>
  defaultColor?: string | false
  cssVariablePrefix?: string
  colorsRendering?: 'css-vars' | 'none'
  /** Emit `class="tN"` plus a stylesheet instead of inline styles. Single theme only. */
  classMode?: boolean
  tabindex?: string | false
  transformers?: Transformer[]
}

const escapeText = (text: string) => text.replace(/&/g, '&#x26;').replace(/</g, '&#x3C;')
const escapeAttr = (text: string) => text.replace(/&/g, '&#x26;').replace(/"/g, '&#x22;')

const decorated = Font.Underline | Font.Strikethrough
const whitespace = /^\s+$/

/** Whitespace-only tokens are folded into the token after them, as Shiki does by default. */
const mergeWhitespace = (line: RenderToken[]) => {
  const out: RenderToken[] = []
  let carry = ''
  let first = 0
  line.forEach((token, index) => {
    const mergeable = !(token.font & decorated)
    if (mergeable && whitespace.test(token.content) && line[index + 1]) {
      if (carry === '') first = token.offset
      carry += token.content
    } else if (carry) {
      if (mergeable) out.push({ ...token, offset: first, content: carry + token.content })
      else out.push({ content: carry, offset: first, style: [], classes: [], font: 0 }, token)
      carry = ''
    } else out.push(token)
  })
  return out
}

const fromStyled = (token: Styled): RenderToken => {
  const style: [string, string][] = []
  if (token.color) style.push(['color', token.color])
  style.push(...fontStyles(token.font))
  return { content: token.content, offset: token.offset, style, classes: [], font: token.font }
}

const COLOR_KEYS = ['color', 'background-color']

/** Several themes share one tokenization: each token is cut wherever any theme starts a new one. */
const align = (themes: Styled[][][]) => {
  const out = themes.map((): Styled[][] => [])
  for (let i = 0; i < themes[0]!.length; i++) {
    const lines = themes.map((t) => t[i]!)
    const outLines = out.map((t) => {
      const line: Styled[] = []
      t.push(line)
      return line
    })
    const index = lines.map(() => 0)
    const current = lines.map((l) => l[0])
    while (current.every(Boolean)) {
      const min = Math.min(...current.map((t) => t!.content.length))
      current.forEach((token, n) => {
        if (token!.content.length === min) {
          outLines[n]!.push(token!)
          current[n] = lines[n]![++index[n]!]
        } else {
          outLines[n]!.push({ ...token!, content: token!.content.slice(0, min) })
          current[n] = { ...token!, content: token!.content.slice(min), offset: token!.offset + min }
        }
      })
    }
  }
  return out
}

const styleObject = (token: Styled) => {
  const style: Record<string, string> = {}
  if (token.color) style.color = token.color
  for (const [key, value] of fontStyles(token.font)) style[key] = value
  return style
}

const themeColor = (theme: Theme, which: 'fg' | 'bg') => {
  const color = which === 'fg' ? theme.data.fg : theme.data.bg
  return theme.data.replace?.[color.toLowerCase()] ?? color
}

export interface Rendered {
  html: string
  /** Present in class mode. */
  css?: string
}

export const renderHtml = (code: string, tokens: Token[][], options: HtmlOptions): Rendered => {
  const lines = splitLines(code)
  const prefix = options.cssVariablePrefix ?? '--shiki-'
  const rendering = options.colorsRendering ?? 'css-vars'
  let preClass: string
  let preStyle: string
  let renderLines: RenderToken[][]

  if (options.themes) {
    const defaultColor = options.defaultColor === undefined ? 'light' : options.defaultColor
    const entries = Object.entries(options.themes)
      .filter(([, theme]) => theme)
      .sort(([a], [b]) => (a === defaultColor ? -1 : b === defaultColor ? 1 : 0))
    const order = entries.map(([name]) => name)
    const styled = align(
      entries.map(([, theme]) => lines.map((line, i) => (line === '' ? [] : styleLine(theme, line, tokens[i] ?? [])))),
    )
    const keyName = (idx: number, key: string) =>
      prefix + order[idx] + (key === 'color' ? '' : key === 'background-color' ? '-bg' : `-${key}`)
    renderLines = styled[0]!.map((line, lineIndex) =>
      line.map((token, tokenIndex) => {
        const variants = styled.map((t) => styleObject(t[lineIndex]![tokenIndex]!))
        const keys = new Set(variants.flatMap((v) => Object.keys(v)))
        const merged: [string, string][] = []
        variants.forEach((variant, idx) => {
          for (const key of keys) {
            const value = variant[key] || 'inherit'
            if (idx === 0 && defaultColor && COLOR_KEYS.includes(key)) {
              if (defaultColor === 'light-dark()' && variants.length > 1) {
                const light = variants[order.indexOf('light')]![key] || 'inherit'
                const dark = variants[order.indexOf('dark')]![key] || 'inherit'
                merged.push([key, `light-dark(${light}, ${dark})`])
                if (rendering === 'css-vars') merged.push([keyName(idx, key), value])
              } else merged.push([key, value])
            } else if (rendering === 'css-vars') merged.push([keyName(idx, key), value])
          }
        })
        return { content: token.content, offset: token.offset, style: merged, classes: [], font: 0 }
      }),
    )
    const rootColors = (which: 'fg' | 'bg') =>
      entries
        .map(([name, theme], idx) => {
          const value = themeColor(theme, which) || 'inherit'
          const variable = `${prefix + name}${which === 'bg' ? '-bg' : ''}:${value}`
          if (idx === 0 && defaultColor) {
            if (defaultColor === 'light-dark()' && entries.length > 1) {
              const pick = (n: string) => themeColor(options.themes![n]!, which) || 'inherit'
              return `light-dark(${pick('light')}, ${pick('dark')});${variable}`
            }
            return value
          }
          return rendering === 'css-vars' ? variable : null
        })
        .filter((part) => !!part)
        .join(';')
    const fg = rootColors('fg')
    const bg = rootColors('bg')
    preClass = `shiki shiki-themes ${entries.map(([, t]) => t.data.name).join(' ')}`
    preStyle = defaultColor ? `background-color:${bg};color:${fg}` : [fg, bg].join(';')
  } else {
    const theme = options.theme!
    renderLines = lines.map((line, i) => (line === '' ? [] : styleLine(theme, line, tokens[i] ?? []).map(fromStyled)))
    preClass = `shiki ${theme.data.name || ''}`
    preStyle = `background-color:${themeColor(theme, 'bg')};color:${themeColor(theme, 'fg')}`
  }

  const transformers = options.transformers ?? []
  let classes: Map<string, number> | undefined
  if (options.classMode) {
    classes = new Map()
    renderLines = renderLines.map((line) =>
      line.map((token) => {
        const key = token.style.map(([k, v]) => `${k}:${v}`).join(';')
        if (!key) return token
        if (!classes!.has(key)) classes!.set(key, classes!.size)
        return { ...token, style: [], classes: [`t${classes!.get(key)}`] }
      }),
    )
  }

  renderLines = renderLines.map(mergeWhitespace)
  for (const transformer of transformers) transformer.tokens?.(renderLines)

  const body = renderLines
    .map((tokens, index) => {
      const line: RenderLine = { classes: ['line'], tokens }
      for (const transformer of transformers) transformer.line?.(line, index + 1)
      const spans = line.tokens
        .map((token) => {
          const style = token.style.map(([k, v]) => `${k}:${v}`).join(';')
          const attrs =
            (token.classes.length ? ` class="${escapeAttr(token.classes.join(' '))}"` : '') +
            (style ? ` style="${escapeAttr(style)}"` : '')
          return `<span${attrs}>${escapeText(token.content)}</span>`
        })
        .join('')
      return `<span class="${escapeAttr(line.classes.join(' '))}">${spans}</span>`
    })
    .join('\n')

  const pre: Record<string, string> = { class: preClass, style: preStyle }
  const tabindex = options.tabindex === undefined ? '0' : options.tabindex
  if (tabindex !== false) pre.tabindex = tabindex
  for (const transformer of transformers) transformer.pre?.(pre)
  const attrs = Object.entries(pre)
    .map(([key, value]) => ` ${key.replace(/[^\w:.-]/g, '')}="${escapeAttr(value)}"`)
    .join('')
  const html = `<pre${attrs}><code>${body}</code></pre>`
  if (!classes) return { html }
  const css = [...classes].map(([style, index]) => `.t${index}{${style.replace(/[<>{}]/g, '')}}`).join('\n')
  return { html, css }
}
