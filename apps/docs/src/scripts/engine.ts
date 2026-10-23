import { createLoader, tokenize } from '@hilite/core'
import { createTheme, renderHtml } from '@hilite/render'
import type { Theme, Transformer } from '@hilite/render'
import aliases from '../../../../dist/aliases.js'
import deps from '../../../../dist/deps.js'
import langs from '../../../../dist/langs/index.js'
import themes from '../../../../dist/themes/index.js'

interface Fetch {
  kind: 'language' | 'theme'
  name: string
}

// Every chunk the page fetched, in order, so the landing page can list them as they arrive.
const fetches: Fetch[] = []
const listeners = new Set<(fetch: Fetch) => void>()
const report = (fetch: Fetch) => {
  fetches.push(fetch)
  for (const listener of listeners) listener(fetch)
}
/** Calls `listener` for every chunk fetched so far and every one after. */
export const onFetch = (listener: (fetch: Fetch) => void) => {
  fetches.forEach(listener)
  listeners.add(listener)
}

// Every language and theme is its own chunk, so the browser only fetches the ones in use.
const tracked = Object.fromEntries(
  Object.entries(langs).map(([name, load]) => [
    name,
    () => {
      report({ kind: 'language', name })
      return load()
    },
  ]),
)
const loader = createLoader({ langs: tracked, deps, aliases })
const loaded = new Map<string, Promise<Theme>>()

const themeFor = (name: string) => {
  let value = loaded.get(name)
  if (!value) {
    const load = themes[name]
    if (!load) throw new Error(`unknown theme "${name}"`)
    report({ kind: 'theme', name })
    loaded.set(name, (value = load().then((module) => createTheme(module.default))))
  }
  return value
}

/** Highlights `code` in the browser with the same tokenizer and renderer the docs describe. */
export const highlightCode = async (
  code: string,
  lang: string,
  theme: string,
  focusable = true,
  transformers: Transformer[] = [],
) => {
  const [grammar, colors] = await Promise.all([loader.grammar(lang), themeFor(theme)])
  return renderHtml(code, tokenize(grammar, code), { theme: colors, tabindex: focusable ? '0' : false, transformers })
    .html
}

/** One render with both themes as CSS variables, the dual-themes output. */
export const highlightDual = async (code: string, lang: string, light: string, dark: string) => {
  const [grammar, lightTheme, darkTheme] = await Promise.all([loader.grammar(lang), themeFor(light), themeFor(dark)])
  return renderHtml(code, tokenize(grammar, code), { themes: { light: lightTheme, dark: darkTheme }, tabindex: false })
    .html
}
