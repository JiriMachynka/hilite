import type { Transformer } from './html.ts'

const mark = (lines: number[], className: string, preClass: string): Transformer => ({
  line: (line, number) => {
    if (lines.includes(number)) line.classes.push(...className.split(' '))
  },
  pre: (attrs) => {
    if (lines.length) attrs.class += ` ${preClass}`
  },
})

/** Adds `highlighted` to the given 1-based lines. */
export const lineHighlight = (lines: number[]) => mark(lines, 'highlighted', 'has-highlighted')

/** Marks lines as added or removed, with the same classes Shiki's diff notation uses. */
export const lineDiff = ({ added = [], removed = [] }: { added?: number[]; removed?: number[] }): Transformer => ({
  line: (line, number) => {
    if (added.includes(number)) line.classes.push('diff', 'add')
    if (removed.includes(number)) line.classes.push('diff', 'remove')
  },
  pre: (attrs) => {
    if (added.length || removed.length) attrs.class += ' has-diff'
  },
})

/** Dims everything except the focused lines. */
export const lineFocus = (lines: number[]) => mark(lines, 'focused', 'has-focused')
