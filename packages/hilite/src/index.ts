import { createHighlighterCore } from './core.ts'
import aliases from './data/aliases.js'
import deps from './data/deps.js'
import info from './data/info.js'
import langs from './data/langs/index.js'
import themes from './data/themes/index.js'

export * from './core.ts'

export const bundledLanguages = Object.keys(langs)
export const bundledThemes = Object.keys(themes)
export const bundledLanguagesInfo = info.languages
export const bundledThemesInfo = info.themes

/** A highlighter that knows every bundled language and theme and loads each on first use. */
export const createHighlighter = () => createHighlighterCore({ langs, deps, aliases, themes })

type Highlighter = ReturnType<typeof createHighlighter>

let shared: Highlighter | undefined
const highlighter = () => (shared ??= createHighlighter())

export const codeToHtml = (...args: Parameters<Highlighter['codeToHtml']>) => highlighter().codeToHtml(...args)
export const codeToRendered = (...args: Parameters<Highlighter['codeToRendered']>) =>
  highlighter().codeToRendered(...args)
export const codeToAnsi = (...args: Parameters<Highlighter['codeToAnsi']>) => highlighter().codeToAnsi(...args)
export const codeToTokens = (...args: Parameters<Highlighter['codeToTokens']>) => highlighter().codeToTokens(...args)
