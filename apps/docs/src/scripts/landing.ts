import { highlightCode, highlightDual, onFetch } from './engine.ts'
import { tabs } from './tabs.ts'

const smooth = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

// Languages: picking a name fetches its grammar chunk and a sample, then highlights it in the panel beside.
const tryRoot = document.querySelector<HTMLElement>('[data-try]')
if (tryRoot) {
  const panel = tryRoot.querySelector<HTMLElement>('.try-out')!
  const code = panel.querySelector<HTMLElement>('.try-code')!
  const name = panel.querySelector<HTMLElement>('.try-name')!
  const stat = panel.querySelector<HTMLElement>('.try-stat')!
  const buttons = [...tryRoot.querySelectorAll<HTMLButtonElement>('button[data-lang]')]
  const list = tryRoot.querySelector<HTMLElement>('.specimen')!
  const more = tryRoot.querySelector<HTMLButtonElement>('.specimen-more')!
  const label = more.textContent!.trim()
  let run = 0

  more.addEventListener('click', () => {
    const open = more.getAttribute('aria-expanded') !== 'true'
    more.setAttribute('aria-expanded', String(open))
    list.toggleAttribute('data-open', open)
    more.textContent = open ? 'Show fewer' : label
    if (!open) list.scrollIntoView({ block: 'nearest', behavior: smooth })
  })
  tryRoot.addEventListener('click', async (event) => {
    if (!(event.target instanceof Element)) return
    const button = event.target.closest<HTMLButtonElement>('button[data-lang]')
    if (!button) return
    const lang = button.dataset.lang!
    for (const other of buttons) other.setAttribute('aria-pressed', String(other === button))
    const mine = ++run
    const started = performance.now()
    const sample = await (await fetch(`samples/${lang}.txt`)).text()
    const html = await highlightCode(sample, lang, 'github-dark')
    if (mine !== run) return
    code.innerHTML = html
    name.textContent = button.textContent!.trim()
    stat.textContent = `${button.dataset.kb} KB, ready in ${(performance.now() - started).toFixed(0)} ms`
    panel.scrollIntoView({ block: 'nearest', behavior: smooth })
  })
}

// Themes: the range input moves the divider, the selects re-render both halves with a new pair.
const split = document.querySelector<HTMLElement>('[data-split]')
if (split) {
  const code = split.querySelector<HTMLElement>('.split-code')!
  const range = split.querySelector<HTMLInputElement>('.split-range')!
  const halves = [...split.querySelectorAll<HTMLElement>('.half')]
  const [light, dark] = [...split.querySelectorAll<HTMLSelectElement>('select[data-side]')]
  const sample = halves[0]!.querySelector('pre')!.textContent!
  let run = 0

  range.addEventListener('input', () => {
    // Dragging should follow the pointer, not ease after it like the reveal does.
    code.dataset.live = ''
    code.style.setProperty('--split', `${range.value}%`)
  })
  split.addEventListener('change', async () => {
    const mine = ++run
    const html = await highlightDual(sample, 'typescript', light!.value, dark!.value)
    if (mine !== run) return
    for (const half of halves) half.innerHTML = html
  })
}

// Lines: every combination is pre-rendered, the checkboxes pick which one shows.
const marks = document.querySelector<HTMLElement>('[data-marks]')
if (marks) {
  const boxes = [...marks.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
  const views = [...marks.querySelectorAll<HTMLElement>('.view')]
  const show = () => {
    const key = boxes.map((box) => (box.checked ? 1 : 0)).join('')
    for (const view of views) view.classList.toggle('on', view.dataset.key === key)
  }
  let touched = false
  marks.addEventListener('change', () => {
    touched = true
    show()
  })

  // On first scroll-in: start from the source as written, then switch the transformers on one at a time.
  marks.closest('.fig')!.addEventListener(
    'reveal',
    () => {
      for (const box of boxes) box.checked = false
      show()
      boxes.forEach((box, i) =>
        setTimeout(
          () => {
            if (touched) return
            box.checked = true
            show()
          },
          900 * (i + 1),
        ),
      )
    },
    { once: true },
  )
}

// Outputs: a tablist, arrow keys move between tabs.
const tour = document.querySelector<HTMLElement>('[data-tour]')
if (tour) tabs(tour)

// Loading: one row per chunk the engine fetched, the bar is this page's share of every language and theme.
const log = document.querySelector<HTMLElement>('[data-fetch-log]')
if (log) {
  const list = log.querySelector<HTMLElement>('.log')!
  const total = log.querySelector<HTMLElement>('.log-total')!
  const bar = log.querySelector<HTMLElement>('.log-bar span')!
  const all = Number(log.dataset.all)
  // Same unit as the sizes printed elsewhere on the site.
  const kb = (bytes: number) => (bytes / 1024).toFixed(1)
  const bytesOf = (kind: string, name: string) =>
    Number(
      document.querySelector<HTMLElement>(
        kind === 'theme' ? `option[value="${name}"][data-bytes]` : `button[data-lang="${name}"][data-bytes]`,
      )?.dataset.bytes ?? 0,
    )
  const cell = (className: string, text: string) => {
    const span = document.createElement('span')
    span.className = className
    span.textContent = text
    return span
  }
  let sum = Number(list.querySelector<HTMLElement>('li')!.dataset.bytes)
  const update = () => {
    total.textContent = `${list.children.length} files, ${kb(sum)} KB`
    bar.style.width = `${Math.max(0.5, (sum / all) * 100)}%`
  }
  onFetch(({ kind, name }) => {
    const bytes = bytesOf(kind, name)
    sum += bytes
    const row = document.createElement('li')
    row.className = 'new'
    row.append(cell('log-kind', kind), cell('log-name', name), cell('log-kb', `${kb(bytes)} KB`))
    list.append(row)
    update()
  })
  update()
}

// Types: the language string is an input; the readout says what TypeScript would.
const types = document.querySelector<HTMLElement>('[data-types]')
if (types) {
  const input = types.querySelector<HTMLInputElement>('.types-input')!
  const diag = types.querySelector<HTMLElement>('.types-diag')!
  const list = types.querySelector<HTMLElement>('.types-list')!
  const names = [...types.querySelectorAll('option')].map((option) => option.value)
  const known = new Set(names)

  // Edit distance, for the "Did you mean" TypeScript adds when a name is close enough.
  const distance = (a: string, b: string) => {
    let row = Array.from({ length: b.length + 1 }, (_, i) => i)
    for (let i = 1; i <= a.length; i++) {
      const next = [i]
      for (let j = 1; j <= b.length; j++)
        next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
      row = next
    }
    return row[b.length]!
  }

  const check = () => {
    const value = input.value
    input.style.width = `${Math.max(1, value.length)}ch`
    const valid = known.has(value)
    types.toggleAttribute('data-invalid', !valid)
    if (valid) diag.textContent = `'${value}' is a BundledLanguage.`
    else {
      const limit = Math.max(2, Math.floor(value.length * 0.34))
      const best = names
        .map((name) => ({ name, d: distance(value, name) }))
        .filter(({ d }) => d <= limit)
        .sort((a, b) => a.d - b.d)[0]
      diag.textContent = best
        ? `error TS2820: Type '"${value}"' is not assignable to type 'BundledLanguage'. Did you mean '"${best.name}"'?`
        : `error TS2322: Type '"${value}"' is not assignable to type 'BundledLanguage'.`
    }
    const matches = value ? names.filter((name) => name.startsWith(value) && name !== value).slice(0, 6) : []
    list.replaceChildren(
      ...matches.map((name) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'chip'
        button.textContent = name
        return button
      }),
    )
  }
  list.addEventListener('click', (event) => {
    if (!(event.target instanceof HTMLButtonElement)) return
    input.value = event.target.textContent ?? ''
    check()
    input.focus()
  })
  input.addEventListener('input', check)
  check()
}
