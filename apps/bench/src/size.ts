import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { brotliCompressSync } from 'node:zlib'

const root = join(import.meta.dir, '../../..')
const dist = join(root, 'dist')
const scratch = join(import.meta.dir, '../.scratch')

const br = (text: string | Uint8Array) => brotliCompressSync(Buffer.from(text)).length

/** Minified browser bundle of an entry point, as text. */
export const bundle = async (entry: string) => {
  const result = await Bun.build({ entrypoints: [entry], minify: true, target: 'browser', format: 'esm' })
  if (!result.success) throw new Error(result.logs.join('\n'))
  return (await Promise.all(result.outputs.map((o) => o.text()))).join('\n')
}

export const measureBundle = async (source: string) => {
  mkdirSync(scratch, { recursive: true })
  const entry = join(scratch, 'entry.ts')
  writeFileSync(entry, source)
  try {
    const code = await bundle(entry)
    return { bytes: code.length, brotli: br(code) }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

export interface Sizes {
  core: { bytes: number; brotli: number }
  render: { bytes: number; brotli: number }
  coreAndRender: { bytes: number; brotli: number }
  fiveLanguages: { bytes: number; brotli: number; languages: number; theme: number }
  languages: { name: string; brotli: number; shikiBrotli: number }[]
  themes: { name: string; brotli: number }[]
}

export const FIVE = ['typescript', 'python', 'rust', 'css', 'json']

export const measure = async (): Promise<Sizes> => {
  const report: {
    languages: { name: string; brotli: number; shikiBrotli: number }[]
    themes: { name: string; brotli: number }[]
  } = JSON.parse(readFileSync(join(dist, 'report.json'), 'utf8'))
  const core = await measureBundle(`export * from '${join(root, 'packages/core/src/index.ts')}'`)
  const render = await measureBundle(`export * from '${join(root, 'packages/render/src/index.ts')}'`)
  const imports = FIVE.map(
    (name, i) => `import l${i} from '${relative(scratch, join(dist, 'langs', `${name}.js`))}'`,
  ).join('\n')
  const both = await measureBundle(
    [
      `import * as core from '${join(root, 'packages/core/src/index.ts')}'`,
      `import * as render from '${join(root, 'packages/render/src/index.ts')}'`,
      `export const hilite = { core, render }`,
    ].join('\n'),
  )
  const five = await measureBundle(
    [
      imports,
      `import theme from '${relative(scratch, join(dist, 'themes', 'github-dark.js'))}'`,
      `import * as core from '${join(root, 'packages/core/src/index.ts')}'`,
      `import * as render from '${join(root, 'packages/render/src/index.ts')}'`,
      `export const hilite = { core, render, theme, langs: [${FIVE.map((_, i) => `l${i}`).join(', ')}] }`,
    ].join('\n'),
  )
  const theme = report.themes.find((t) => t.name === 'github-dark')!.brotli
  return {
    core,
    render,
    coreAndRender: both,
    fiveLanguages: { ...five, languages: FIVE.length, theme },
    languages: report.languages,
    themes: report.themes,
  }
}

if (import.meta.main) {
  const sizes = await measure()
  mkdirSync(join(root, 'reports'), { recursive: true })
  writeFileSync(join(root, 'reports/sizes.json'), JSON.stringify(sizes, null, 2))
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`
  console.log('core (tokenizer only)      ', kb(sizes.core.bytes), 'min,', kb(sizes.core.brotli), 'br')
  console.log(
    'render (html, ansi, theme) ',
    kb(sizes.render.bytes),
    'min,',
    kb(sizes.render.brotli),
    'br (includes the core pieces it imports)',
  )
  console.log(
    'core + render              ',
    kb(sizes.coreAndRender.bytes),
    'min,',
    kb(sizes.coreAndRender.brotli),
    'br',
  )
  console.log(
    '5 langs + github-dark      ',
    kb(sizes.fiveLanguages.bytes),
    'min,',
    kb(sizes.fiveLanguages.brotli),
    'br  (single bundle: core + render + languages + theme)',
  )
}
