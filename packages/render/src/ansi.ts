import type { Token } from '@hilite/core'
import { splitLines, styleLine } from './style.ts'
import { Font } from './theme.ts'
import type { Theme } from './theme.ts'

const rgba = (hex: string) => {
  let digits = hex.replace('#', '')
  if (digits.length === 3 || digits.length === 4) digits = [...digits].map((c) => c + c).join('')
  if (digits.length === 6) digits += 'ff'
  const n = (at: number) => parseInt(digits.slice(at, at + 2), 16)
  return { r: n(0), g: n(2), b: n(4), a: n(6) / 255 }
}

/** The terminal has no alpha channel, so the color is flattened onto black or white like Shiki's CLI does. */
const flatten = (hex: string, type: string) => {
  const { r, g, b, a } = rgba(hex)
  const mix = type === 'dark' ? (c: number) => c * a : (c: number) => c * a + 255 * (1 - a)
  return [r, g, b].map(mix).map((c) => Math.round(c))
}

const wrap = (open: number | string, close: number, text: string) => `\x1b[${open}m${text}\x1b[${close}m`

/** Truecolor ANSI escape sequences, one line per source line. */
export const renderAnsi = (code: string, tokens: Token[][], theme: Theme) => {
  return splitLines(code)
    .map((line, index) => {
      if (line === '') return ''
      return styleLine(theme, line, tokens[index] ?? [])
        .map((token) => {
          let text = token.content
          const color = token.color || theme.data.fg
          if (color && text) text = wrap(`38;2;${flatten(color, theme.data.type).join(';')}`, 39, text)
          if (token.font & Font.Bold) text = wrap(1, 22, text)
          if (token.font & Font.Italic) text = wrap(3, 23, text)
          if (token.font & Font.Underline) text = wrap(4, 24, text)
          if (token.font & Font.Strikethrough) text = wrap(9, 29, text)
          return text
        })
        .join('')
    })
    .join('\n')
    .concat('\n')
}
