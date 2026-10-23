// Decoded shape of a compiled language. The compiler writes it, the tokenizer reads it.

/** Rule kinds, stored in slot 0 of every rule record. */
export const enum Kind {
  Match = 0,
  Include = 1,
  BeginEnd = 2,
  BeginWhile = 3,
}

/** Words per rule record in `Lang.rules`. */
export const RULE_STRIDE = 8

/** Rule record slots. */
export const enum Slot {
  Kind = 0,
  Name = 1,
  ContentName = 2,
  /** match / begin regex id */
  Regex = 3,
  /** end / while regex id */
  Regex2 = 4,
  /** captures / beginCaptures table id */
  Caps = 5,
  /** endCaptures / whileCaptures table id */
  Caps2 = 6,
  /** child rule list id << 1, low bit = applyEndPatternLast */
  Patterns = 7,
}

/** Which record slots a rule of each kind actually uses, in column order. */
export const FIELDS: Slot[][] = [
  [Slot.Name, Slot.Regex, Slot.Caps],
  [Slot.Name, Slot.ContentName, Slot.Patterns],
  [Slot.Name, Slot.ContentName, Slot.Regex, Slot.Regex2, Slot.Caps, Slot.Caps2, Slot.Patterns],
  [Slot.Name, Slot.ContentName, Slot.Regex, Slot.Regex2, Slot.Caps, Slot.Caps2, Slot.Patterns],
]

/** One capture group's rule: name id, contentName id (both 1-based into `names`, 0 = none), retokenize rule id (0 = none). */
export type Cap = [name: number, contentName: number, retokenize: number]

export const enum Mode {
  Search = 0,
  /** Must match exactly at the search start (`\G` as a leading anchor). */
  Sticky = 1,
  /** `\G` somewhere inside: run against `text.slice(pos)` with `^` standing in for it. */
  Clip = 2,
}

export interface Conv {
  /** JS regex source, run with the `u` flag, or `v` when `set` is true. */
  src: string
  mode: Mode
  /** Needs `v` flag class-set syntax or semantics; `u` is much cheaper to compile, so this is the exception. */
  set: boolean
  /** Case-insensitive as a whole, run with the `i` flag. Partial `(?i:…)` is already spelled out in `src`. */
  fold: boolean
  /** Raw JS capture groups, needed to place alternatives inside one combined regex. */
  groups: number
  /** `\N` backreferences inside the source, which must be shifted when combined. */
  refs: boolean
  /** Oniguruma group -> JS groups, only when atomic/possessive emulation shuffled them. */
  map?: number[][]
}

export interface Regex {
  /** Conv ids indexed by `allowA | allowG << 1`; a single entry when the source has no anchors. */
  conv: number[]
  /** End/while pattern that has `\N` placeholders for begin captures. */
  refs: boolean
}

export interface Lang {
  /** Root scope name, e.g. `source.ts`. */
  scope: string
  /** Scope names of languages this one includes rules from. */
  deps: string[]
  names: string[]
  regexes: Regex[]
  convs: Conv[]
  /** Flat rule records, id `n` starts at `n * RULE_STRIDE`; record 0 is unused. */
  rules: number[]
  /** Child rule lists. Entry 0 is the empty list. */
  lists: number[][]
  /** Capture tables indexed by group number; null where a group has no rule. Entry 0 is empty. */
  caps: (Cap | null)[][]
  /** Negative ids in rules/lists point here: `-(i + 1)` -> [scopeName, repositoryName]. */
  externals: [string, string][]
  /** Repository name -> rule id; `''` is the grammar itself. */
  exports: Record<string, number>
  /** Selector -> rule id, for the grammar's own `injections`. */
  injections: [string, number][]
  /** Set on injection grammars. */
  injectTo?: string[]
  injectionSelector?: string
}
