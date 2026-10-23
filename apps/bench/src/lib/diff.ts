import type { Seg } from './reference.ts'

const key = (seg: Seg) => `${seg.start}:${seg.end}:${seg.scopes.join(' ')}`

/** Adjacent pieces with the same scopes are one token, however the engine happened to split them. */
export const normalize = (line: Seg[]) => {
  const out: Seg[] = []
  for (const seg of line) {
    const last = out[out.length - 1]
    if (last && last.end === seg.start && last.scopes.join(' ') === seg.scopes.join(' '))
      out[out.length - 1] = { ...last, end: seg.end }
    else out.push({ ...seg })
  }
  return out
}

export interface Score {
  tokens: number
  matched: number
  lines: number
  linesMatched: number
}

export const compare = (expected: Seg[][], actual: Seg[][]): Score => {
  const score = { tokens: 0, matched: 0, lines: 0, linesMatched: 0 }
  for (let i = 0; i < expected.length; i++) {
    const want = normalize(expected[i]!)
    const got = new Set(normalize(actual[i] ?? []).map(key))
    score.lines++
    score.tokens += want.length
    const hits = want.filter((seg) => got.has(key(seg))).length
    score.matched += hits
    if (hits === want.length && got.size === want.length) score.linesMatched++
  }
  return score
}

export const firstMismatch = (expected: Seg[][], actual: Seg[][]) => {
  for (let i = 0; i < expected.length; i++) {
    const want = normalize(expected[i]!).map(key).join(' | ')
    const got = normalize(actual[i] ?? [])
      .map(key)
      .join(' | ')
    if (want !== got) return { line: i + 1, want, got }
  }
  return null
}
