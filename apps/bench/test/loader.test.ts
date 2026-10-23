import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildLanguages } from '@hilite/compiler'
import { createLoader, scopeName, tokenize } from '@hilite/core'

const out = mkdtempSync(join(tmpdir(), 'hilite-loader-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

test('the generated language modules load through import() with their dependencies', async () => {
  await buildLanguages({ out, languages: ['html', 'css', 'javascript'] })
  const { default: langs } = await import(join(out, 'langs/index.js'))
  const { default: deps } = await import(join(out, 'deps.js'))
  const loader = createLoader({ langs, deps, aliases: { js: 'javascript' } })

  const grammar = await loader.grammar('html')
  const code = '<style>a { color: red }</style>\n<script>let a = 1</script>'
  const scopes = tokenize(grammar, code).flatMap((line) => line.flatMap((t) => t.scopeIds.map(scopeName)))
  // Embedded CSS and JavaScript only highlight when the html bundle pulled them in.
  expect(scopes).toContain('support.type.property-name.css')
  expect(scopes).toContain('storage.type.js')
  expect(await loader.grammar('js')).toBe(await loader.grammar('javascript'))
  await expect(loader.grammar('nope')).rejects.toThrow('unknown language')
}, 30_000)
