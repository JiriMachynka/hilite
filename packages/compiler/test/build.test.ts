import { expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileLanguage, toModule } from '../src/build.ts'
import { loadRegistry } from '../src/registry.ts'

const registry = await loadRegistry()

test('a module gives back exactly the text it wraps', async () => {
  for (const text of ['a`b', '``', '${x}', '$${x}', '\\${2}', '\\\\${2}', '\\`', '\\\\`', 'end\\', 'end\\\\']) {
    // A fresh directory each time: Bun caches directory listings between imports.
    const file = join(mkdtempSync(join(tmpdir(), 'hilite-module-')), 'blob.js')
    writeFileSync(file, toModule(text))
    const module: { default: string } = await import(file)
    expect(module.default).toBe(text)
  }
})

// Inline modifiers such as `(?i:…)`, and one group name used by two combined alternatives, need Node 23 or
// Chrome 125, newer than what the package supports.
const tooNew = /\(\?(?:[imsx]+(?:-[imsx]*)?|-[imsx]+):|\(\?<[A-Za-z_$]/

test('no language compiles to regex syntax newer than Node 20', () => {
  const found: string[] = []
  for (const name of registry.sources.keys()) {
    for (const conv of compileLanguage(registry, name).lang.convs) {
      if (tooNew.test(conv.src.replace(/\\[^]/g, ''))) found.push(`${name}: ${conv.src.slice(0, 80)}`)
    }
  }
  expect(found).toEqual([])
}, 120_000)
