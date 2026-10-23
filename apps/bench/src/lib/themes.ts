import { compileTheme } from '@hilite/compiler'
import { createTheme } from '@hilite/render'
import { createCssVariablesTheme } from 'shiki/core'

export const loadHiliteTheme = async (name: string) => {
  const raw = (await import(`@shikijs/themes/${name}`)).default
  return createTheme(compileTheme(raw))
}

export const cssVariablesTheme = createCssVariablesTheme()
export const hiliteCssVariablesTheme = () => createTheme(compileTheme(cssVariablesTheme))
