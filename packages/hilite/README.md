<p align="center">
  <img src="https://raw.githubusercontent.com/JiriMachynka/hilite/main/packages/hilite/banner.svg" alt="Hilite: VS Code highlighting. No WebAssembly." width="100%">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/hilite"><img alt="npm" src="https://img.shields.io/npm/v/hilite?color=f5683d&labelColor=0e1218"></a>
  <a href="https://www.npmjs.com/package/hilite"><img alt="downloads" src="https://img.shields.io/npm/dm/hilite?color=f5683d&labelColor=0e1218"></a>
  <img alt="tokenizer size" src="https://img.shields.io/badge/tokenizer-4.9%20KB%20brotli-f5683d?labelColor=0e1218">
  <img alt="types" src="https://img.shields.io/badge/types-included-f5683d?labelColor=0e1218">
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/npm/l/hilite?color=f5683d&labelColor=0e1218"></a>
</p>

Syntax highlighting with the TextMate grammars and themes VS Code uses, on the JavaScript regex engine. No WebAssembly, nothing to configure.

- **Tiny.** The tokenizer is 4.9 KB brotli. Tokenizer, renderer, five languages and a theme come to 36.6 KB, against 80 KB for Shiki's JavaScript engine and 211 KB with Oniguruma.
- **Same output as Shiki.** HTML is byte-identical to Shiki's `codeToHtml`, and tokens match Shiki with Oniguruma on 260 languages.
- **Fast when warm.** A 2,000-line file highlights in 48 ms, against 85 ms for Shiki's JavaScript engine.
- **Loads what you show.** 260 languages and 65 themes are included. Each loads the first time it is used, as its own file.
- **Typed.** Language and theme names are typed, so a typo is a compile error.

## Install

```sh
npm install hilite
```

```sh
bun add hilite
pnpm add hilite
yarn add hilite
```

## Quick start

```ts
import { codeToHtml } from 'hilite'

const html = await codeToHtml('const answer: number = 42', {
  lang: 'ts',
  theme: 'github-dark',
})
```

The result is a `<pre>` with inline colors. Put it on the page as it is.

## Light and dark

```ts
await codeToHtml(code, { lang: 'ts', themes: { light: 'github-light', dark: 'github-dark' } })
```

Colors come out as CSS variables, the same ones Shiki writes.

## Diff, highlight and focus

```ts
import { codeToHtml, notationDiff, notationHighlight, notationFocus } from 'hilite'

await codeToHtml(code, {
  lang: 'ts',
  theme: 'github-dark',
  transformers: [notationDiff(), notationHighlight(), notationFocus()],
})
// const a = 1 // [!code ++]
```

`lineDiff`, `lineHighlight` and `lineFocus` do the same by line number.

## Terminal output and tokens

```ts
import { codeToAnsi, codeToTokens } from 'hilite'

console.log(await codeToAnsi(code, { lang: 'py', theme: 'nord' }))
const lines = await codeToTokens(code, 'py')
```

## Names for pickers

`bundledLanguagesInfo` and `bundledThemesInfo` list every id next to the name to show people (`typescript` and `TypeScript`, `github-dark` and `GitHub Dark`), plus each language's aliases and each theme's light or dark type.

## Pick your own languages

`hilite/core` is the same engine without the bundled maps. Name only what you use and a bundler leaves the rest out.

```ts
import { createHighlighterCore } from 'hilite/core'
import deps from 'hilite/deps'

const highlighter = createHighlighterCore({
  langs: { python: () => import('hilite/langs/python') },
  themes: { nord: () => import('hilite/themes/nord') },
  deps,
})
```

## API

| Export                                                    | Returns                                          |
| --------------------------------------------------------- | ------------------------------------------------ |
| `codeToHtml(code, { lang, theme or themes, ...options })` | HTML string                                      |
| `codeToRendered(code, options)`                           | `{ html, css? }`, for `classMode`                |
| `codeToAnsi(code, { lang, theme })`                       | Truecolor terminal output                        |
| `codeToTokens(code, lang)`                                | Raw tokens per line                              |
| `createHighlighter()`                                     | A highlighter with the methods above             |
| `bundledLanguages`, `bundledThemes`                       | Every id                                         |
| `bundledLanguagesInfo`, `bundledThemesInfo`               | Ids with display names, aliases and theme types  |
| `notationDiff`, `notationHighlight`, `notationFocus`      | Transformers driven by `// [!code ...]` comments |
| `lineDiff`, `lineHighlight`, `lineFocus`                  | Transformers driven by line numbers              |

Render options: `theme`, `themes`, `defaultColor`, `cssVariablePrefix`, `colorsRendering`, `classMode`, `tabindex`, `transformers`.

## Requirements

Node 20 or newer, or a current browser (Chrome 112, Safari 17, Firefox 116): some grammars use the regular expression `v` flag. CI loads every language on Node 20, 22 and 24, and Chrome was tested; Safari and Firefox were not.

The default entry references every bundled language, so bundlers emit a file for each (about 330 files and 6 MB in esbuild and Vite). On size-limited platforms use `hilite/core` and name your languages: one language and one theme came to 3 files and about 160 KB.

## Untrusted input

Each line is limited to 500 ms of tokenizing (`tokenizeTimeLimit`, the same default as Shiki); after that the rest of the line is left unstyled. Lines of 20,000 characters or more are skipped (`tokenizeMaxLineLength`, `0` turns it off), and cap the size of code you do not control. The time limit is only checked between regex matches, so a single catastrophically backtracking match is not interrupted: a crafted grammar or input can still block the thread. If you highlight untrusted code, run it in a worker you can terminate on a deadline. Deeply nested input is still slow to render even when tokenizing is cut off, so a size cap matters.

## License

Hilite is MIT licensed, copyright Jiří Machynka (see `LICENSE`).

The bundled grammars and themes keep the licenses of the projects they came from. Most are MIT or Apache-2.0. A few are not: five grammars (ada, gnuplot, nginx, org, racket) are GPL-3.0, ahk2 is LGPL-3.0, and three (bird2, hcl, terraform) are MPL-2.0. A dozen more have licenses that automated scanners do not recognise; read by eye they are MIT, BSD or Apache-2.0. The full list, with texts, ships in the package as `dist/THIRD_PARTY_NOTICES.md`. If you embed Hilite in a closed-source product, check the languages you actually use.
