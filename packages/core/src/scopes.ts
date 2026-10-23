export interface Scope {
  /** Scope string ids from the root down to this node. Shared, never mutate. */
  readonly ids: number[]
  readonly parent: Scope | null
  kids: Map<number, Scope>
  names?: string[]
}

const table: string[] = []
const idOf = new Map<string, number>()

export const scopeName = (id: number) => table[id]!

const intern = (name: string) => {
  let id = idOf.get(name)
  if (id === undefined) {
    id = table.push(name) - 1
    idOf.set(name, id)
  }
  return id
}

export const emptyScope: Scope = { ids: [], parent: null, kids: new Map() }

const child = (parent: Scope, id: number) => {
  let node = parent.kids.get(id)
  if (!node) {
    node = { ids: [...parent.ids, id], parent, kids: new Map() }
    parent.kids.set(id, node)
  }
  return node
}

/** Push a possibly space separated list of scope names. */
export const pushScope = (parent: Scope, name: string | null) => {
  if (!name) return parent
  for (const part of name.split(' ')) parent = child(parent, intern(part))
  return parent
}

export const scopeNames = (scope: Scope) => (scope.names ??= scope.ids.map(scopeName))
