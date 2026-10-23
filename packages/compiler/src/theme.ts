import { normalizeTheme } from 'shiki/core'
import type { ThemeRegistrationAny } from 'shiki/core'

/** Mirrors `ThemeData` in @hilite/render, kept structural so the compiler does not depend on it. */
export interface CompactTheme {
  name: string
  type: string
  fg: string
  bg: string
  rules: [string[], string, string, string][]
  replace?: Record<string, string>
}

/** Keep only what token coloring reads: tokenColors, fg and bg. The ~100 UI `colors` keys are dropped. */
export const compileTheme = (raw: ThemeRegistrationAny): CompactTheme => {
  const theme = normalizeTheme(raw)
  const rules: CompactTheme['rules'] = []
  for (const setting of theme.settings ?? []) {
    if (!setting.settings) continue
    const { foreground = '', background = '', fontStyle } = setting.settings
    // Array entries are taken as written; a string is split on commas like vscode-textmate does.
    const scope = Array.isArray(setting.scope)
      ? setting.scope
      : typeof setting.scope === 'string'
        ? setting.scope.replace(/^,+/, '').replace(/,+$/, '').split(',')
        : ['']
    rules.push([scope, foreground, background, typeof fontStyle === 'string' ? fontStyle || 'none' : ''])
  }
  const compact: CompactTheme = {
    name: theme.name ?? '',
    type: theme.type ?? 'dark',
    fg: theme.fg ?? '',
    bg: theme.bg ?? '',
    rules,
  }
  if (theme.colorReplacements && Object.keys(theme.colorReplacements).length) compact.replace = theme.colorReplacements
  return compact
}
