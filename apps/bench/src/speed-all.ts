import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Every measurement gets a fresh process so the cold run really is cold.
const engines = ['hilite', 'onig', 'js', 'hljs', 'prism', 'starry']
const rounds = 5
const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1]!

const results = engines.map((engine) => {
  const runs = Array.from({ length: rounds }, () => {
    const out = Bun.spawnSync(['bun', join(import.meta.dir, 'speed.ts'), engine, 'javascript', '--json'], {
      stdout: 'pipe',
    })
    const run: { init: number; first: number; warm: number } = JSON.parse(
      out.stdout.toString().trim().split('\n').pop()!,
    )
    return run
  })
  return {
    engine,
    init: median(runs.map((r) => r.init)),
    first: median(runs.map((r) => r.first)),
    warm: median(runs.map((r) => r.warm)),
    runs,
  }
})
for (const r of results) {
  console.log(
    r.engine.padEnd(8),
    `init ${r.init.toFixed(0).padStart(4)} ms | first run ${r.first.toFixed(0).padStart(5)} ms | warm ${r.warm.toFixed(0).padStart(4)} ms   (median of ${rounds}; first runs ${r.runs.map((x) => x.first.toFixed(0)).join(', ')})`,
  )
}
mkdirSync(join(import.meta.dir, '../../../reports'), { recursive: true })
writeFileSync(join(import.meta.dir, '../../../reports/speed.json'), JSON.stringify(results, null, 2))
