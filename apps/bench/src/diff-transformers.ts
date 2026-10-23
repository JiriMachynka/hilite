import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderHtml, lineDiff, lineFocus, lineHighlight } from '@hilite/render'
import { transformerNotationDiff, transformerNotationFocus, transformerNotationHighlight } from '@shikijs/transformers'
import { createHighlighterCore } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'
import { hiliteFor } from './lib/hilite.ts'
import { shikiLangs } from './lib/reference.ts'
import { loadHiliteTheme } from './lib/themes.ts'

// Shiki marks lines through comments like `// [!code ++]`. Hilite takes line numbers, so each case
// carries the same code twice: with markers for Shiki, stripped for Hilite, plus the lines the markers hit.
const samples: Record<string, { comment: (m: string) => string; lines: string[] }> = {
  typescript: {
    comment: (m) => `// [!code ${m}]`,
    lines: [
      'const a = 1',
      'let b: number = a + 2',
      'function f(x: string) {',
      '  return x.length',
      '}',
      'export { f }',
      'f("hi")',
    ],
  },
  python: {
    comment: (m) => `# [!code ${m}]`,
    lines: ['import os', 'def f(x):', '    return x + 1', 'class A:', '    pass', 'print(f(2))', 'a = [1, 2]'],
  },
  rust: {
    comment: (m) => `// [!code ${m}]`,
    lines: [
      'fn main() {',
      '    let x = 5;',
      '    println!("{}", x);',
      '}',
      'struct A { b: u8 }',
      'impl A {}',
      'use std::fmt;',
    ],
  },
  css: {
    comment: (m) => `/* [!code ${m}] */`,
    lines: [
      'a {',
      '  color: red;',
      '  margin: 0 auto;',
      '}',
      'b > c { padding: 1px }',
      '@media (min-width: 1px) {',
      '}',
    ],
  },
}

// One marker per line: 0 plain, 1 add, 2 remove, 3 highlight, 4 focus, repeating.
const kinds = ['', '++', '--', 'highlight', 'focus']
const engine = createOnigurumaEngine(import('shiki/wasm'))
const dark = await loadHiliteTheme('github-dark')

let all = 0
let ok = 0
for (const [lang, { comment, lines }] of Object.entries(samples)) {
  const shiki = await createHighlighterCore({
    themes: [import('@shikijs/themes/github-dark')],
    langs: shikiLangs(lang),
    engine,
  })
  const hilite = hiliteFor(lang)
  // Rotate the marker pattern so every line takes every role across the cases.
  for (let shift = 0; shift < kinds.length; shift++) {
    const marked = lines.map((l, i) => {
      const kind = kinds[(i + shift) % kinds.length]!
      return kind ? `${l}${comment(kind)}` : l
    })
    const at = (kind: string) => lines.flatMap((_, i) => (kinds[(i + shift) % kinds.length] === kind ? [i + 1] : []))
    const code = lines.join('\n')
    const want = shiki.codeToHtml(marked.join('\n'), {
      lang,
      theme: 'github-dark',
      transformers: [transformerNotationDiff(), transformerNotationHighlight(), transformerNotationFocus()],
    })
    const got = renderHtml(code, hilite.tokens(code), {
      theme: dark,
      transformers: [
        lineDiff({ added: at('++'), removed: at('--') }),
        lineHighlight(at('highlight')),
        lineFocus(at('focus')),
      ],
    }).html
    all++
    if (want === got) ok++
    else {
      let i = 0
      while (want[i] === got[i]) i++
      console.log(
        `  [${lang}/shift ${shift}]\n    ${want.slice(Math.max(0, i - 80), i + 100)}\n    ${got.slice(Math.max(0, i - 80), i + 100)}`,
      )
    }
  }
  shiki.dispose()
  console.log(lang.padEnd(12), 'done')
}
console.log(`\nbyte-identical: ${ok}/${all}`)

// Comment markers: the same marked code goes to both sides, so this checks the parser as well as the classes.
import { notationDiff, notationFocus, notationHighlight } from '@hilite/render'

// Shiki leaves a stray newline before `</code>` when the removed marker line was the last line; Hilite does not.
const cases: { lang: string; label: string; code: string; strayNewline?: true }[] = [
  {
    lang: 'typescript',
    label: 'trailing',
    code: 'const a = 1 // [!code ++]\nconst b = 2 // [!code --]\nconst c = 3 // [!code highlight]\nconst d = 4 // [!code focus]\nconst e = 5',
  },
  { lang: 'typescript', label: 'no space', code: 'const a = 1// [!code ++]\nconst b = 2' },
  { lang: 'typescript', label: 'alias hl', code: 'const a = 1 // [!code hl]\nconst b = 2' },
  { lang: 'typescript', label: 'range', code: 'const a = 1 // [!code ++:3]\nconst b = 2\nconst c = 3\nconst d = 4' },
  { lang: 'typescript', label: 'range past end', code: 'const a = 1\nconst b = 2 // [!code focus:5]' },
  { lang: 'typescript', label: 'standalone', code: '// [!code ++]\nconst a = 1\nconst b = 2' },
  {
    lang: 'typescript',
    label: 'standalone range',
    code: '// [!code highlight:2]\nconst a = 1\nconst b = 2\nconst c = 3',
  },
  { lang: 'typescript', label: 'standalone last', code: 'const a = 1\n// [!code ++]', strayNewline: true },
  { lang: 'typescript', label: 'two markers', code: 'const a = 1 // [!code ++] [!code focus]\nconst b = 2' },
  { lang: 'typescript', label: 'two markers, hash', code: 'const a = 1 // [!code highlight] [!code --]\nconst b = 2' },
  { lang: 'typescript', label: 'comment text kept', code: 'const a = 1 // keep me [!code ++]\nconst b = 2' },
  { lang: 'typescript', label: 'comment text first', code: 'const a = 1 // [!code ++] keep me\nconst b = 2' },
  { lang: 'typescript', label: 'string with slashes', code: 'const a = "http://x" // [!code ++]\nconst b = 2' },
  { lang: 'typescript', label: 'block comment', code: 'const a = 1 /* [!code ++] */\nconst b = 2' },
  { lang: 'typescript', label: 'jsdoc line', code: '/**\n * text [!code ++]\n */\nconst b = 2' },
  { lang: 'typescript', label: 'unknown marker', code: 'const a = 1 // [!code nope]\nconst b = 2' },
  { lang: 'typescript', label: 'overlap', code: 'const a = 1 // [!code ++:2]\nconst b = 2 // [!code ++]\nconst c = 3' },
  {
    lang: 'typescript',
    label: 'standalone then marker',
    code: '// [!code --]\nconst a = 1 // [!code ++]\nconst b = 2',
  },
  { lang: 'python', label: 'hash', code: 'x = 1  # [!code ++]\ny = 2  # [!code --]\nz = 3' },
  { lang: 'python', label: 'hash standalone', code: '# [!code focus]\nx = 1\ny = 2' },
  { lang: 'css', label: 'block', code: 'a { /* [!code ++] */\n  color: red; /* [!code --] */\n}' },
  { lang: 'rust', label: 'trailing', code: 'fn main() { // [!code highlight]\n    let x = 5; // [!code ++]\n}' },
  { lang: 'html', label: 'html comment', code: '<div> <!-- [!code ++] -->\n  <p>hi</p> <!-- [!code --] -->\n</div>' },
  { lang: 'yaml', label: 'yaml', code: 'a: 1 # [!code ++]\nb: 2 # [!code --]\nc: 3' },
  { lang: 'rust', label: 'split comment, text after', code: 'let a = 1; // [!code ++] keep me\nlet b = 2;' },
  { lang: 'rust', label: 'split comment, text before', code: 'let a = 1; // keep me [!code ++]\nlet b = 2;' },
  { lang: 'rust', label: 'split comment, two markers', code: 'let a = 1; // [!code ++] [!code focus]\nlet b = 2;' },
  { lang: 'rust', label: 'split comment alone', code: '// [!code --]\nlet a = 1;\nlet b = 2;' },
  { lang: 'go', label: 'split', code: 'a := 1 // [!code highlight]\nb := 2 // [!code --]' },
  { lang: 'php', label: 'split', code: '<?php\n$a = 1; // [!code ++]\n$b = 2;' },
  { lang: 'lua', label: 'dashes', code: 'a = 1 -- [!code ++]\nb = 2 -- [!code focus]' },
  { lang: 'ruby', label: 'hash', code: 'a = 1 # [!code ++]\nb = 2 # [!code hl]' },
  { lang: 'toml', label: 'hash', code: 'a = 1 # [!code ++]\nb = 2' },
  { lang: 'jsonc', label: 'line comment', code: '{\n  "a": 1, // [!code ++]\n  "b": 2 // [!code --]\n}' },
  { lang: 'tsx', label: 'jsx child', code: 'const a = <p>x</p> // [!code ++]\nconst b = 2' },
  { lang: 'vue', label: 'html comment', code: '<template>\n  <p>a</p> <!-- [!code ++] -->\n</template>' },
  { lang: 'ini', label: 'semicolon', code: 'a=1 ; [!code ++]\nb=2' },
  { lang: 'typescript', label: 'two comment openers', code: 'const a = 1 // note // [!code ++]\nconst b = 2' },
  { lang: 'typescript', label: 'dangling opener', code: 'const a = 1 // [!code ++] //\nconst b = 2' },
  { lang: 'rust', label: 'two comment openers', code: 'let a = 1; // note // [!code --]\nlet b = 2;' },
  { lang: 'python', label: 'two comment openers', code: 'a = 1 # note # [!code hl]\nb = 2' },
  { lang: 'sql', label: 'sql dashes', code: 'select 1 -- [!code ++]\nfrom t -- [!code highlight]\nwhere x' },
]

// A theme that colours a comment's `//` differently from its text leaves the marker in a token of its own.
const notationThemes = [
  'github-dark',
  'monokai',
  'dracula',
  'one-dark-pro',
  'tokyo-night',
  'solarized-light',
  'vitesse-dark',
  'catppuccin-latte',
  'rose-pine',
  'rose-pine-dawn',
  'night-owl-light',
]
let notationOk = 0
let notationAll = 0
for (const themeName of notationThemes) {
  const hiliteTheme = await loadHiliteTheme(themeName)
  const shikis = new Map<string, Awaited<ReturnType<typeof createHighlighterCore>>>()
  for (const c of cases) {
    let shiki = shikis.get(c.lang)
    if (!shiki) {
      shiki = await createHighlighterCore({
        themes: [import(`@shikijs/themes/${themeName}`)],
        langs: shikiLangs(c.lang),
        engine,
      })
      shikis.set(c.lang, shiki)
    }
    const shikiHtml = shiki.codeToHtml(c.code, {
      lang: c.lang,
      theme: themeName,
      transformers: [transformerNotationDiff(), transformerNotationHighlight(), transformerNotationFocus()],
    })
    const want = c.strayNewline ? shikiHtml.replace('\n</code>', '</code>') : shikiHtml
    const got = renderHtml(c.code, hiliteFor(c.lang).tokens(c.code), {
      theme: hiliteTheme,
      transformers: [notationDiff(), notationHighlight(), notationFocus()],
    }).html
    notationAll++
    if (want === got) notationOk++
    else {
      let i = 0
      while (want[i] === got[i]) i++
      console.log(
        `  [${themeName}/${c.lang}/${c.label}]\n    ${want.slice(Math.max(0, i - 80), i + 120)}\n    ${got.slice(Math.max(0, i - 80), i + 120)}`,
      )
    }
  }
  for (const h of shikis.values()) h.dispose()
}
console.log(
  `\nnotation byte-identical: ${notationOk}/${notationAll} (${cases.length} cases x ${notationThemes.length} themes)`,
)

mkdirSync(join(import.meta.dir, '../../../reports'), { recursive: true })
writeFileSync(
  join(import.meta.dir, '../../../reports/transformers.json'),
  JSON.stringify(
    {
      lines: { ok, all },
      notation: { ok: notationOk, all: notationAll, cases: cases.length, themes: notationThemes.length },
    },
    null,
    2,
  ),
)
