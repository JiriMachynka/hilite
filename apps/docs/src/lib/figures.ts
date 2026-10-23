import {
  build,
  byEngine,
  compare,
  html,
  langName,
  meanRatio,
  mutation,
  SHIKI,
  sizes,
  speed,
  themeDiff,
  themeLabel,
  tokens,
  transformers,
} from './data.ts'
import { langIcon, swatch } from './highlight.ts'
import { esc, int, kb, ms, table } from './html.ts'

const barRow = (what: string, note: string, value: number, max: number, label: string, mine = false) =>
  `<div class="bar-row"><div class="what">${esc(what)}<small>${esc(note)}</small></div><div class="track"><div class="fill${mine ? ' mine' : ''}" style="width:${((value / max) * 100).toFixed(2)}%"></div><span class="val">${esc(label)}</span></div></div>`

const hiliteKb = sizes.fiveLanguages.brotli / 1024
export const sizeFigure = [
  barRow('Shiki + Oniguruma', 'core, wasm and 5 languages', SHIKI.onigKb, SHIKI.onigKb, `${SHIKI.onigKb} KB`),
  barRow('Shiki + JavaScript engine', 'core, engine and 5 languages', SHIKI.jsKb, SHIKI.onigKb, `${SHIKI.jsKb} KB`),
  barRow(
    'Hilite',
    'tokenizer, renderer, 5 languages, theme',
    hiliteKb,
    SHIKI.onigKb,
    `${hiliteKb.toFixed(1)} KB`,
    true,
  ),
].join('')

const engines = ['hilite', 'onig', 'js'] as const
const names = { hilite: 'Hilite', onig: 'Shiki + Oniguruma', js: 'Shiki + JavaScript engine' }
const maxFirst = Math.max(...speed.map((s) => s.first))
const maxWarm = Math.max(...speed.map((s) => s.warm))
export const speedFigure =
  `<p class="group-title">First run, fresh process</p>` +
  engines
    .map((e) => barRow(names[e], '', byEngine[e].first, maxFirst, ms(byEngine[e].first), e === 'hilite'))
    .join('') +
  `<p class="group-title">Warm run, same input again</p>` +
  engines.map((e) => barRow(names[e], '', byEngine[e].warm, maxWarm, ms(byEngine[e].warm), e === 'hilite')).join('')

const engineCols = [
  ['hilite', 'Hilite'],
  ['js', 'Shiki, JS engine'],
  ['onig', 'Shiki, Oniguruma'],
  ['starry', 'starry-night'],
  ['hljs', 'highlight.js'],
  ['prism', 'Prism'],
] as const

type Cell = string | { text: string; rank: number }
const rankRow = (label: string, cells: { text: string; rank: number }[]): [string, Cell[]] => [label, cells]
export const kbText = (bytes: number) => `${kb(bytes)} KB`
const best = (cells: Cell[]) => Math.min(...cells.map((c) => (typeof c === 'string' ? Infinity : c.rank)))

const compareRows: [string, Cell[]][] = [
  ['Grammars', ['TextMate', 'TextMate', 'TextMate', 'TextMate', 'Hand-written regexes', 'Hand-written regexes']],
  [
    'Regex engine',
    [
      'JavaScript, converted at build time',
      'JavaScript, converted at run time',
      'Oniguruma in WebAssembly',
      'Oniguruma in WebAssembly',
      'JavaScript',
      'JavaScript',
    ],
  ],
  ['Needs WebAssembly', ['No', 'No', 'Yes', 'Yes', 'No', 'No']],
  rankRow('Bundle, 5 languages (brotli)', [
    { text: `${kbText(sizes.fiveLanguages.brotli)}, theme included`, rank: sizes.fiveLanguages.brotli },
    { text: `${kbText(compare.sizes.shikiJs)}, theme included`, rank: compare.sizes.shikiJs },
    { text: `${kbText(compare.sizes.shikiOnig)}, theme included`, rank: compare.sizes.shikiOnig },
    {
      text: `${kbText(compare.sizes.starry)} + ${kbText(compare.sizes.starryWasm)} wasm`,
      rank: compare.sizes.starry + compare.sizes.starryWasm,
    },
    { text: kbText(compare.sizes.hljs), rank: compare.sizes.hljs },
    { text: kbText(compare.sizes.prism), rank: compare.sizes.prism },
  ]),
  rankRow(
    '2,000 lines, first run',
    engineCols.map(([key]) => ({ text: ms(byEngine[key].first), rank: byEngine[key].first })),
  ),
  rankRow(
    '2,000 lines, warm',
    engineCols.map(([key]) => ({ text: ms(byEngine[key].warm), rank: byEngine[key].warm })),
  ),
  [
    'Languages',
    [
      `${build.languages.length}`,
      `${build.languages.length}`,
      `${build.languages.length}`,
      `${int(compare.inventory.starryGrammars)} grammars`,
      `${compare.inventory.hljsLanguages}`,
      `${compare.inventory.prismLanguages}`,
    ],
  ],
  [
    'Themes',
    [
      `${build.themes.length}`,
      `${build.themes.length}`,
      `${build.themes.length}`,
      `${compare.inventory.starryThemes} CSS`,
      `${compare.inventory.hljsThemes} CSS`,
      `${compare.inventory.prismThemes} CSS`,
    ],
  ],
  ['Uses VS Code themes', ['Yes', 'Yes', 'Yes', 'No', 'No', 'No']],
  [
    'Diff, highlight and focus lines',
    ['Built in', '@shikijs/transformers', '@shikijs/transformers', 'No', 'No', 'Plugins'],
  ],
  ['Terminal (ANSI) output', ['Built in', '@shikijs/cli', '@shikijs/cli', 'No', 'No', 'No']],
  ['HTML identical to Shiki', [`${int(html.ok)} of ${int(html.all)}`, 'Reference', 'Reference', 'No', 'No', 'No']],
]

export const comparisonTable = `<div class="table-scroll"><table class="compare"><thead><tr><th></th>${engineCols
  .map(([key, name]) => `<th${key === 'hilite' ? ' class="us"' : ''}>${esc(name)}</th>`)
  .join('')}</tr></thead><tbody>${compareRows
  .map(([label, cells]) => {
    const top = best(cells)
    return `<tr><th scope="row">${esc(label)}</th>${cells
      .map((cell, i) => {
        const text = typeof cell === 'string' ? cell : cell.text
        const win = typeof cell !== 'string' && cell.rank === top
        return `<td class="${engineCols[i]?.[0] === 'hilite' ? 'us ' : ''}${win ? 'best' : ''}">${esc(text)}</td>`
      })
      .join('')}</tr>`
  })
  .join('')}</tbody></table></div>`
const v = compare.inventory.versions
export const comparisonNotes = `Versions: Shiki ${v.shiki}, highlight.js ${v['highlight.js']}, Prism ${v.prismjs}, starry-night ${v['@wooorm/starry-night']}. Speed is the 2,000 line JavaScript file, each library's own HTML output (starry-night through hast-util-to-html), median of five fresh Bun processes. Sizes are minified and brotli-compressed with the same five languages; Prism, highlight.js and starry-night sizes leave out their CSS themes. Orange marks the best value in a row.`

const accuracyRows: [string, string, string][] = [
  [
    'Tokens vs Shiki + Oniguruma',
    `${int(tokens.matched)} of ${int(tokens.tokens)}`,
    `${tokens.languages} languages, sample, truncated, CRLF, empty and edge inputs`,
  ],
  [
    'HTML vs Shiki',
    `${int(html.ok)} of ${int(html.all)}`,
    'byte for byte: single theme, light and dark pair, CSS variables',
  ],
  [
    'Themes',
    `${int(themeDiff.ok)} of ${int(themeDiff.all)}`,
    `${themeDiff.themes} bundled themes, alone and paired, six languages`,
  ],
  [
    'Line transformers',
    `${int(transformers.lines.ok)} of ${int(transformers.lines.all)}`,
    'lineHighlight, lineDiff and lineFocus against @shikijs/transformers',
  ],
  [
    'Comment transformers',
    `${int(transformers.notation.ok)} of ${int(transformers.notation.all)}`,
    `[!code ++], --, highlight and focus: ${transformers.notation.cases} cases, ${transformers.notation.themes} themes`,
  ],
]
if (mutation)
  accuracyRows.push([
    'Mutation check',
    `${mutation.killed} of ${mutation.total}`,
    'deliberate bugs in the tokenizer and renderer, each caught by a test',
  ])
export const accuracyTable = `<table><thead><tr><th>Check</th><th class="r">Identical</th><th>Covers</th></tr></thead><tbody>${accuracyRows
  .map(([a, b, c]) => `<tr><td>${esc(a)}</td><td class="r">${b}</td><td>${esc(c)}</td></tr>`)
  .join('')}</tbody></table>`

export const compatTable = table(
  ['Check', 'Result', 'Covers'],
  accuracyRows.map(([a, b, c]) => [esc(a), `<span class="num">${esc(b)}</span>`, esc(c)]),
)

const gaps: [string, string, string, string][] = [
  ['Core runtime', 'under 10 KB', `${kb(sizes.core.brotli)} KB`, 'met'],
  ['Five languages + theme', 'about 30 KB (25 to 40)', `${kb(sizes.fiveLanguages.brotli)} KB`, 'met'],
  ["Average language vs Shiki's grammar JSON", 'half the size or less', `${meanRatio.toFixed(2)}x`, 'missed'],
  [
    'First run on the 2,000 line file',
    'under 200 ms',
    ms(byEngine.hilite.first),
    byEngine.hilite.first < 200 ? 'met' : 'missed',
  ],
  [
    'Warm run',
    'no slower than Shiki + JS engine',
    `${ms(byEngine.hilite.warm)} vs ${ms(byEngine.js.warm)}`,
    byEngine.hilite.warm <= byEngine.js.warm ? 'met' : 'missed',
  ],
  ['Token match', '99% per language', `${((tokens.matched / tokens.tokens) * 100).toFixed(3)}% overall`, 'met'],
]
export const gapTable = `<table><thead><tr><th>Target</th><th>Asked for</th><th class="r">Measured</th><th></th></tr></thead><tbody>${gaps
  .map(
    ([a, b, c, d]) =>
      `<tr><td>${esc(a)}</td><td>${esc(b)}</td><td class="r">${esc(c)}</td><td>${d === 'missed' ? '<span class="miss">missed</span>' : 'met'}</td></tr>`,
  )
  .join('')}</tbody></table>`

export const langList = build.languages
  .slice()
  .sort((a, b) => langName(a.name).localeCompare(langName(b.name)))
  .map(
    (l) =>
      `<li><span class="lang">${langIcon(l.name)}<span>${esc(langName(l.name))}</span></span><span class="kb">${kb(l.brotli)}</span></li>`,
  )
  .join('')

const swatches = new Map(await Promise.all(build.themes.map(async (t) => [t.name, await swatch(t.name)] as const)))

// Each theme opens the playground with that theme picked.
const arrow = `<svg class="go" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8h10m-4-4 4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
export const themeItems = build.themes
  .map(
    (t) =>
      `<li><a href="playground.html?theme=${esc(t.name)}" title="Open ${esc(t.displayName)} in the playground">${swatches.get(t.name)}<span>${esc(t.displayName)}</span>${arrow}</a></li>`,
  )
  .join('')

const option = (kind: string, id: string, name: string, lead: string, search: string, selected: boolean) =>
  `<li role="option" id="${kind}-${esc(id)}" data-value="${esc(id)}" data-search="${esc(search.toLowerCase())}" aria-selected="${selected}">${lead}<span class="option-name">${esc(name)}</span></li>`

const langOptions = (selected: string) =>
  build.languages
    .slice()
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((l) =>
      option(
        'lang',
        l.name,
        l.displayName,
        langIcon(l.name),
        `${l.displayName} ${l.name} ${l.aliases.join(' ')}`,
        l.name === selected,
      ),
    )
    .join('')

const themeOptions = (selected: string) =>
  build.themes
    .slice()
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((t) =>
      option(
        'theme',
        t.name,
        t.displayName,
        swatches.get(t.name) ?? '',
        `${t.displayName} ${t.name} ${t.type}`,
        t.name === selected,
      ),
    )
    .join('')

/** Playground picker: a button that opens a searchable listbox. */
export const dropdownHtml = (kind: 'lang' | 'theme', label: string, placeholder: string, selected: string) => {
  const lead = kind === 'lang' ? langIcon(selected) : (swatches.get(selected) ?? '')
  const name = kind === 'lang' ? langName(selected) : themeLabel(selected)
  const options = kind === 'lang' ? langOptions : themeOptions
  return `<div class="dropdown" data-dropdown="${kind}">
  <span class="dropdown-label" id="${kind}-label">${label}</span>
  <button type="button" class="dropdown-btn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="${kind}-label ${kind}-current"><span class="dropdown-current" id="${kind}-current">${lead}<span class="option-name">${esc(name)}</span></span><svg class="chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  <div class="dropdown-panel" hidden>
    <input type="search" class="dropdown-search" role="combobox" aria-expanded="true" aria-controls="${kind}-list" aria-label="${esc(placeholder)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false">
    <ul id="${kind}-list" role="listbox" aria-label="${label}">${options(selected)}</ul>
  </div>
</div>`
}
