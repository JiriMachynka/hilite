import { createLoader, tokenize } from '@hilite/core'
import type { LoaderOptions, TokenizeOptions } from '@hilite/core'
import { createTheme, renderAnsi, renderHtml } from '@hilite/render'
import type { HtmlOptions, Rendered, Theme, ThemeData } from '@hilite/render'

type ThemeModules<T extends string> = Record<T, () => Promise<{ default: ThemeData }>>

export interface HighlighterOptions<L extends string, T extends string> extends LoaderOptions {
  langs: Record<L, LoaderOptions['langs'][string]>
  /** One `import()` per theme, as written by the compiler's `themes/index.js`. */
  themes: ThemeModules<T>
}

type Rest = Omit<HtmlOptions, 'theme' | 'themes'> & {
  /** Milliseconds one line may take before the rest of it is left unstyled. Default 500, 0 for no limit. */
  tokenizeTimeLimit?: number
  /** Lines at least this long are not tokenized. Default 20000, 0 for no limit. */
  tokenizeMaxLineLength?: number
}

export type CodeToHtmlOptions<L extends string, T extends string> = Rest & { lang: L } & (
    | { theme: T; themes?: undefined }
    | { themes: Record<string, T>; theme?: undefined }
  )

/** Shiki-shaped entry point: names in, markup out. Languages and themes load on first use. */
export const createHighlighter = <L extends string, T extends string>(options: HighlighterOptions<L, T>) => {
  const loader = createLoader(options)
  const themes = new Map<string, Promise<Theme>>()
  const theme = (name: T) => {
    let promise = themes.get(name)
    if (!promise) {
      const load = options.themes[name]
      if (!load) throw new Error(`unknown theme "${name}"`)
      themes.set(name, (promise = load().then((module) => createTheme(module.default))))
    }
    return promise
  }

  const codeToTokens = async (code: string, lang: L, options?: TokenizeOptions) =>
    tokenize(await loader.grammar(lang), code, options)

  const codeToRendered = async (
    code: string,
    {
      lang,
      theme: single,
      themes: several,
      tokenizeTimeLimit,
      tokenizeMaxLineLength,
      ...rest
    }: CodeToHtmlOptions<L, T>,
  ): Promise<Rendered> => {
    const [tokens, resolved, resolvedSet] = await Promise.all([
      codeToTokens(code, lang, { timeLimit: tokenizeTimeLimit, maxLineLength: tokenizeMaxLineLength }),
      single === undefined ? undefined : theme(single),
      several === undefined
        ? undefined
        : Promise.all(Object.entries(several).map(async ([key, name]) => [key, await theme(name)] as const)),
    ])
    return renderHtml(code, tokens, {
      ...rest,
      theme: resolved,
      themes: resolvedSet && Object.fromEntries(resolvedSet),
    })
  }

  return {
    codeToTokens,
    codeToRendered,
    codeToHtml: async (code: string, opts: CodeToHtmlOptions<L, T>) => (await codeToRendered(code, opts)).html,
    codeToAnsi: async (code: string, opts: { lang: L; theme: T }) =>
      renderAnsi(code, await codeToTokens(code, opts.lang), await theme(opts.theme)),
  }
}
