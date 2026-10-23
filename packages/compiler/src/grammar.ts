import { readdirSync } from 'node:fs'
import { join } from 'node:path'

export interface RawRule {
  include?: string
  name?: string
  contentName?: string
  match?: string
  begin?: string
  end?: string
  while?: string
  captures?: RawCaptures
  beginCaptures?: RawCaptures
  endCaptures?: RawCaptures
  whileCaptures?: RawCaptures
  patterns?: RawRule[]
  repository?: Record<string, RawRule>
  applyEndPatternLast?: boolean
}

export type RawCaptures = Record<string, RawRule>

export interface RawGrammar {
  name: string
  scopeName: string
  patterns: RawRule[]
  repository?: Record<string, RawRule>
  injections?: Record<string, RawRule>
  injectionSelector?: string
}

export const grammarsDir = join(import.meta.dir, '../node_modules/tm-grammars/grammars')

export const listGrammarNames = () =>
  readdirSync(grammarsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .sort()

export const loadGrammar = async (name: string) => {
  const grammar: RawGrammar = await Bun.file(join(grammarsDir, `${name}.json`)).json()
  return grammar
}

export type PatternKind = 'match' | 'begin' | 'end' | 'while'

export interface FoundPattern {
  kind: PatternKind
  source: string
}

const captureKeys = ['captures', 'beginCaptures', 'endCaptures', 'whileCaptures'] as const

/** Every regex string the tokenizer can run, in document order, duplicates kept. */
export const collectPatterns = (grammar: RawGrammar) => {
  const found: FoundPattern[] = []

  const visit = (rule: RawRule | null) => {
    if (!rule) return
    if (typeof rule.match === 'string') found.push({ kind: 'match', source: rule.match })
    if (typeof rule.begin === 'string') {
      found.push({ kind: 'begin', source: rule.begin })
      // vscode-textmate falls back to an unmatchable end when it is missing
      found.push({ kind: 'end', source: rule.end ?? '￿' })
    }
    if (typeof rule.while === 'string') found.push({ kind: 'while', source: rule.while })
    for (const key of captureKeys) {
      const captures = rule[key]
      if (captures) for (const capture of Object.values(captures)) visit(capture)
    }
    if (rule.patterns) for (const child of rule.patterns) visit(child)
    if (rule.repository) for (const child of Object.values(rule.repository)) visit(child)
  }

  for (const child of grammar.patterns) visit(child)
  if (grammar.repository) for (const child of Object.values(grammar.repository)) visit(child)
  if (grammar.injections) for (const child of Object.values(grammar.injections)) visit(child)
  return found
}
