import buildReport from '../../../../dist/report.json'
import compareReport from '../../../../reports/compare.json'
import conversion from '../../../../reports/conversion.txt?raw'
import htmlReport from '../../../../reports/html.json'
import sizesReport from '../../../../reports/sizes.json'
import speedReport from '../../../../reports/speed.json'
import themesReport from '../../../../reports/themes.json'
import tokensReport from '../../../../reports/tokens.json'
import transformersReport from '../../../../reports/transformers.json'

interface Pair {
  brotli: number
  bytes: number
}
export const sizes: { core: Pair; render: Pair; coreAndRender: Pair; fiveLanguages: Pair & { theme: number } } =
  sizesReport
export const tokens: { tokens: number; matched: number; lines: number; linesMatched: number; languages: number } =
  tokensReport
export const html: { ok: number; all: number; languages: number } = htmlReport
export const themeDiff: { themes: number; ok: number; all: number } = themesReport
export const transformers: {
  lines: { ok: number; all: number }
  notation: { ok: number; all: number; cases: number; themes: number }
} = transformersReport
export const speed: { engine: string; init: number; first: number; warm: number }[] = speedReport
export const build: {
  languages: {
    name: string
    displayName: string
    aliases: string[]
    brotli: number
    shikiBrotli: number
    patterns: number
    failures: { source: string }[]
  }[]
  themes: { name: string; displayName: string; type: string; brotli: number }[]
  dictionary?: { heldOut: { mean: number }; inSample: { mean: number }; dictionaryBytes: number }
} = buildReport
export const compare: {
  sizes: { shikiJs: number; shikiOnig: number; hljs: number; prism: number; starry: number; starryWasm: number }
  inventory: {
    hljsLanguages: number
    hljsThemes: number
    prismLanguages: number
    prismThemes: number
    starryGrammars: number
    starryThemes: number
    versions: Record<string, string>
  }
} = compareReport

// The mutation report is optional: the page drops its row when the check has not been run.
const mutationReports = import.meta.glob<{ killed: number; total: number }>('../../../../reports/mutation.json', {
  eager: true,
  import: 'default',
})
export const mutation = Object.values(mutationReports)[0] ?? null

export const langInfo = new Map(build.languages.map((l) => [l.name, l]))
const themeInfo = new Map(build.themes.map((t) => [t.name, t]))
/** `TypeScript` rather than `typescript`. */
export const langName = (id: string) => langInfo.get(id)?.displayName ?? id
/** `GitHub Dark` rather than `github-dark`. */
export const themeLabel = (id: string) => themeInfo.get(id)?.displayName ?? id

// Same five languages as everywhere else: typescript, python, rust, css, json.
export const SHIKI = {
  onigKb: Math.round(compare.sizes.shikiOnig / 1024),
  jsKb: Math.round(compare.sizes.shikiJs / 1024),
}

export const meanRatio = build.languages.reduce((s, l) => s + l.brotli / l.shikiBrotli, 0) / build.languages.length
export const totalPatterns = Number(conversion.match(/unique patterns: (\d+)/)?.[1])
export const cleanPatterns = Number(conversion.match(/clean: (\d+)/)?.[1])
export const capMapPatterns = Number(conversion.match(/capture-map: (\d+)/)?.[1])
export const clipPatterns = Number(conversion.match(/clip-search: (\d+)/)?.[1])
// Counted from the build itself: the standalone converter report also trips on one ahk2 pattern the build rewrites first.
export const failedPatterns = build.languages.reduce((sum, l) => sum + l.failures.length, 0)

const byEngineMap = Object.fromEntries(speed.map((s) => [s.engine, s]))
const engine = (name: string) => {
  const found = byEngineMap[name]
  if (!found) throw new Error(`reports/speed.json has no "${name}" engine`)
  return found
}
export const byEngine = {
  hilite: engine('hilite'),
  js: engine('js'),
  onig: engine('onig'),
  starry: engine('starry'),
  hljs: engine('hljs'),
  prism: engine('prism'),
}

// Claims on the comparison page are written as prose, so fail the build if the numbers stop backing them.
if ([byEngine.js, byEngine.onig, byEngine.starry].some((e) => byEngine.hilite.warm >= e.warm))
  throw new Error('Hilite is no longer the fastest warm TextMate engine: rewrite comparison.mdx')
if (compare.sizes.shikiJs <= sizes.fiveLanguages.brotli || compare.sizes.starry <= sizes.fiveLanguages.brotli)
  throw new Error('Hilite is no longer the smallest TextMate bundle: rewrite comparison.mdx')
if (byEngine.prism.warm * 2 >= byEngine.hilite.warm || byEngine.hljs.warm * 2 >= byEngine.hilite.warm)
  throw new Error('Prism and highlight.js are no longer several times faster: rewrite comparison.mdx')
if (byEngine.starry.first >= byEngine.hilite.first)
  throw new Error('starry-night no longer starts faster: rewrite comparison.mdx')
