import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Lines (scope names, regex sources) that many languages share, most valuable last because brotli
 * finds the end of a custom dictionary cheapest.
 */
export const buildDictionary = (blobs: Map<string, string>, maxBytes = 1024 * 1024) => {
  const seen = new Map<string, number>()
  for (const text of blobs.values()) {
    const lines = text.split('\n').slice(1, -1)
    for (const line of new Set(lines)) if (line.length > 12) seen.set(line, (seen.get(line) ?? 0) + 1)
  }
  const ranked = [...seen].filter(([, n]) => n >= 2).sort((a, b) => a[1] * a[0].length - b[1] * b[0].length)
  let dictionary = ''
  for (const [line] of ranked) dictionary += `${line}\n`
  return dictionary.slice(-maxBytes)
}

/** Brotli sizes with a custom dictionary, using the `brotli` command line tool. Null when it is not installed. */
export const compressWithDictionary = (files: Map<string, string>, dictionary: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'hilite-dict-'))
  try {
    const dictPath = join(dir, 'dictionary')
    writeFileSync(dictPath, dictionary)
    const sizes = new Map<string, number>()
    for (const [name, text] of files) {
      const path = join(dir, `${name}.txt`)
      writeFileSync(path, text)
      const result = Bun.spawnSync(['brotli', '-q', '11', '-D', dictPath, '-c', path])
      if (result.exitCode !== 0) return null
      sizes.set(name, result.stdout.length)
    }
    return sizes
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export interface DictionaryReport {
  dictionaryBytes: number
  /** Mean per-language ratio to Shiki's JSON with a dictionary built from the other half of the languages. */
  heldOut: { mean: number; aggregate: number }
  /** Same, with one dictionary built from every language, including the one being compressed. */
  inSample: { mean: number; aggregate: number }
}

export const measureDictionary = (blobs: Map<string, string>, shiki: Map<string, number>): DictionaryReport | null => {
  const names = [...blobs.keys()].sort()
  const evaluate = (dictionaryOf: (name: string) => string, group: string[]) => {
    const dictionary = dictionaryOf(group[0]!)
    const sizes = compressWithDictionary(new Map(group.map((n) => [n, blobs.get(n)!])), dictionary)
    return sizes && { dictionary, sizes }
  }
  const summary = (parts: { sizes: Map<string, number> }[]) => {
    const rows = parts.flatMap((p) => [...p.sizes].map(([name, size]) => ({ size, base: shiki.get(name)! })))
    return {
      mean: rows.reduce((s, r) => s + r.size / r.base, 0) / rows.length,
      aggregate: rows.reduce((s, r) => s + r.size, 0) / rows.reduce((s, r) => s + r.base, 0),
    }
  }

  const even = names.filter((_, i) => i % 2 === 0)
  const odd = names.filter((_, i) => i % 2 === 1)
  const subset = (group: string[]) => new Map(group.map((n) => [n, blobs.get(n)!]))
  const a = evaluate(() => buildDictionary(subset(even)), odd)
  const b = evaluate(() => buildDictionary(subset(odd)), even)
  const all = evaluate(() => buildDictionary(blobs), names)
  if (!a || !b || !all) return null
  return {
    dictionaryBytes: all.dictionary.length,
    heldOut: summary([a, b]),
    inSample: summary([all]),
  }
}
