type Matcher = (scopes: string[]) => boolean

const isIdentifier = (token: string | null) => !!token && /[\w.:]+/.test(token)

const matchesScope = (scope: string, name: string) =>
  scope === name || (scope.length > name.length && scope.startsWith(name) && scope[name.length] === '.')

/** Each identifier has to match some scope, in order. */
const matchesName = (identifiers: string[], scopes: string[]) => {
  if (scopes.length < identifiers.length) return false
  let from = 0
  return identifiers.every((identifier) => {
    for (let i = from; i < scopes.length; i++) {
      if (matchesScope(scopes[i]!, identifier)) {
        from = i + 1
        return true
      }
    }
    return false
  })
}

/** Parses an injection selector such as `L:meta.tag -meta.attribute, source.js`. */
export const parseSelector = (selector: string) => {
  const tokens = selector.match(/([LR]:|[\w.:][\w.:-]*|[,|\-()])/g) ?? []
  let at = 0
  const peek = () => tokens[at] ?? null
  const advance = () => void at++

  const operand = (): Matcher | null => {
    if (peek() === '-') {
      advance()
      const negated = operand()
      return (scopes) => !!negated && !negated(scopes)
    }
    if (peek() === '(') {
      advance()
      const inner = alternatives()
      if (peek() === ')') advance()
      return inner
    }
    if (isIdentifier(peek())) {
      const identifiers: string[] = []
      do {
        identifiers.push(peek()!)
        advance()
      } while (isIdentifier(peek()))
      return (scopes) => matchesName(identifiers, scopes)
    }
    return null
  }
  const conjunction = (): Matcher => {
    const parts: Matcher[] = []
    for (let part = operand(); part; part = operand()) parts.push(part)
    return (scopes) => parts.every((part) => part(scopes))
  }
  const alternatives = (): Matcher => {
    const parts: Matcher[] = []
    for (let part = conjunction(); ; part = conjunction()) {
      parts.push(part)
      if (peek() !== '|' && peek() !== ',') break
      do advance()
      while (peek() === '|' || peek() === ',')
    }
    return (scopes) => parts.some((part) => part(scopes))
  }

  const results: { matches: Matcher; priority: number }[] = []
  for (let token = peek(); token !== null; token = peek()) {
    let priority = 0
    if (token.length === 2 && token[1] === ':') {
      priority = token[0] === 'R' ? 1 : -1
      advance()
    }
    results.push({ matches: conjunction(), priority })
    if (peek() !== ',') break
    advance()
  }
  return results
}
