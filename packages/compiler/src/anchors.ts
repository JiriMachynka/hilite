const NEVER = '￿'

/** `\z` has no direct Oniguruma-to-JS form, vscode-textmate rewrites it before anything else. */
export const rewriteEndOfString = (source: string) => {
  let out = ''
  let last = 0
  for (let pos = 0; pos < source.length; pos++) {
    if (source[pos] !== '\\') continue
    if (source[pos + 1] === 'z') {
      out += `${source.slice(last, pos)}$(?!\\n)(?<!\\n)`
      last = pos + 2
    }
    pos++
  }
  return last === 0 ? source : out + source.slice(last)
}

export const hasAnchor = (source: string) => {
  for (let pos = 0; pos < source.length; pos++) {
    if (source[pos] !== '\\') continue
    const next = source[pos + 1]
    if (next === 'A' || next === 'G') return true
    pos++
  }
  return false
}

/** Same substitution vscode-textmate does: a disallowed anchor becomes a char that never occurs. */
export const resolveAnchors = (source: string, allowA: boolean, allowG: boolean) => {
  let out = ''
  for (let pos = 0; pos < source.length; pos++) {
    const ch = source[pos]!
    out += ch
    if (ch !== '\\' || pos + 1 >= source.length) continue
    const next = source[pos + 1]!
    out += next === 'A' ? (allowA ? 'A' : NEVER) : next === 'G' ? (allowG ? 'G' : NEVER) : next
    pos++
  }
  return out
}

export const backReference = /\\(\d+)/g
