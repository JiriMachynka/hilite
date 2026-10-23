export { createHighlighter as createHighlighterCore } from '@hilite/highlight'
export type { CodeToHtmlOptions, HighlighterOptions } from '@hilite/highlight'
export { createLoader, tokenize, scopeName } from '@hilite/core'
export {
  createTheme,
  renderHtml,
  renderAnsi,
  lineHighlight,
  lineDiff,
  lineFocus,
  notationDiff,
  notationHighlight,
  notationFocus,
} from '@hilite/render'
