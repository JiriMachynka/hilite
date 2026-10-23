import type { Token } from '@hilite/core'
import { resolve } from './theme.ts'
import type { Attrs, Theme } from './theme.ts'
import { Font } from './theme.ts'

export interface Styled {
  content: string
  offset: number
  color: string
  font: number
}

const lower = (color: string) => color.toLowerCase()

/** Color string for an id, with CSS-variable placeholders swapped back. */
export const colorOf = (theme: Theme, id: number) => {
  const color = theme.colors[id] ?? ''
  return theme.data.replace?.[lower(color)] ?? color
}

const same = (a: Attrs, b: Attrs) => a.type === b.type && a.font === b.font && a.fg === b.fg && a.bg === b.bg

/** Tokens with identical style metadata are one token, which is what Shiki's tokenizer hands to the renderer. */
export const styleLine = (theme: Theme, line: string, tokens: Token[]): Styled[] => {
  const out: Styled[] = []
  let last: Attrs | null = null
  for (const token of tokens) {
    const attrs = resolve(theme, token.scopeIds)
    const content = line.slice(token.start, token.end)
    const previous = out[out.length - 1]
    if (previous && last && same(last, attrs)) previous.content += content
    else out.push({ content, offset: token.start, color: colorOf(theme, attrs.fg), font: attrs.font })
    last = attrs
  }
  return out
}

export const splitLines = (code: string) => code.split(/\r?\n/)

export const fontStyles = (font: number) => {
  const style: [string, string][] = []
  if (font & Font.Italic) style.push(['font-style', 'italic'])
  if (font & Font.Bold) style.push(['font-weight', 'bold'])
  const decorations = [
    font & Font.Underline ? 'underline' : '',
    font & Font.Strikethrough ? 'line-through' : '',
  ].filter(Boolean)
  if (decorations.length) style.push(['text-decoration', decorations.join(' ')])
  return style
}
