import { notationDiff, notationFocus, notationHighlight } from '@hilite/render'
import { highlightCode } from './engine.ts'

// Live "You write / You get" pairs: the textarea sits over its own highlighted copy, the output re-renders on each edit.
const make = new Map([
  ['diff', notationDiff],
  ['highlight', notationHighlight],
  ['focus', notationFocus],
])

for (const root of document.querySelectorAll<HTMLElement>('[data-editor]')) {
  const input = root.querySelector('textarea')!
  const source = root.querySelector<HTMLElement>('.editor-src')!
  const result = root.querySelector<HTMLElement>('.editor-result')!
  const lang = root.dataset.lang ?? 'typescript'
  const names = root.dataset.transformers?.split(',').filter(Boolean) ?? []
  let run = 0

  input.addEventListener('input', async () => {
    const mine = ++run
    const code = input.value
    const transformers = names.flatMap((name) => make.get(name)?.() ?? [])
    const [plain, marked] = await Promise.all([
      highlightCode(code, lang, 'github-dark', false),
      highlightCode(code, lang, 'github-dark', true, transformers),
    ])
    if (mine !== run) return
    source.innerHTML = plain
    result.innerHTML = marked
  })
}
