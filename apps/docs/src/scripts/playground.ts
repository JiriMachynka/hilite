import { highlightCode } from './engine.ts'
import { samples } from './samples.ts'

const input = document.querySelector<HTMLTextAreaElement>('#play-input')!
const out = document.querySelector<HTMLElement>('#play-out')!
const stat = document.querySelector<HTMLElement>('#play-stat')!
const heading = document.querySelector<HTMLElement>('#play-heading')!

let lang = 'typescript'
let theme = 'github-dark'
let themeName = 'GitHub Dark'

let run = 0
const render = async () => {
  const mine = ++run
  try {
    const started = performance.now()
    const html = await highlightCode(input.value, lang, theme)
    if (mine !== run) return
    out.innerHTML = `<div class="panel">${html}</div>`
    heading.textContent = `Output, ${themeName}`
    stat.removeAttribute('data-error')
    stat.textContent = `${input.value.split('\n').length} lines, ${(performance.now() - started).toFixed(1)} ms including any chunk download`
  } catch (error) {
    stat.setAttribute('data-error', '')
    stat.textContent = error instanceof Error ? error.message : 'Could not highlight this input'
  }
}

// A dropdown with search: a button that opens a listbox of options, filtered as you type.
const dropdown = (root: HTMLElement, onPick: (value: string, label: string) => void) => {
  const button = root.querySelector<HTMLButtonElement>('.dropdown-btn')!
  const current = root.querySelector<HTMLElement>('.dropdown-current')!
  const panel = root.querySelector<HTMLElement>('.dropdown-panel')!
  const search = root.querySelector<HTMLInputElement>('.dropdown-search')!
  const options = [...root.querySelectorAll<HTMLLIElement>('[role=option]')]
  let active = 0

  const visible = () => options.filter((option) => !option.hidden)
  const mark = (index: number) => {
    const shown = visible()
    active = Math.max(0, Math.min(shown.length - 1, index))
    for (const option of options) option.classList.remove('active')
    const option = shown[active]
    if (option) {
      option.classList.add('active')
      option.scrollIntoView({ block: 'nearest' })
      search.setAttribute('aria-activedescendant', option.id)
    }
  }
  const close = (refocus = true) => {
    panel.hidden = true
    button.setAttribute('aria-expanded', 'false')
    if (refocus) button.focus()
  }
  const open = () => {
    search.value = ''
    for (const option of options) option.hidden = false
    panel.hidden = false
    button.setAttribute('aria-expanded', 'true')
    mark(options.findIndex((option) => option.getAttribute('aria-selected') === 'true'))
    search.focus()
  }
  const pick = (option: HTMLLIElement, refocus = true) => {
    for (const other of options) other.setAttribute('aria-selected', String(other === option))
    current.innerHTML = option.innerHTML
    close(refocus)
    onPick(option.dataset.value!, option.querySelector('.option-name')!.textContent!)
  }

  button.addEventListener('click', () => (panel.hidden ? open() : close()))
  search.addEventListener('input', () => {
    const words = search.value.toLowerCase().split(/\s+/).filter(Boolean)
    for (const option of options) option.hidden = !words.every((word) => option.dataset.search!.includes(word))
    mark(0)
  })
  search.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      mark(active + (event.key === 'ArrowDown' ? 1 : -1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = visible()[active]
      if (option) pick(option)
    } else if (event.key === 'Escape') {
      close()
    } else if (event.key === 'Tab') {
      close(false)
    }
  })
  panel.addEventListener('click', (event) => {
    const option = event.target instanceof Element ? event.target.closest<HTMLLIElement>('[role=option]') : null
    if (option) pick(option)
  })
  document.addEventListener('click', (event) => {
    if (!panel.hidden && !(event.target instanceof Node && root.contains(event.target))) close(false)
  })

  /** Picks the option with this value, if there is one, without moving focus. */
  return (value: string) => {
    const option = options.find((o) => o.dataset.value === value)
    if (option) pick(option, false)
  }
}

const pickLang = dropdown(document.querySelector<HTMLElement>('[data-dropdown=lang]')!, (value) => {
  lang = value
  const sample = samples[value]
  if (sample) input.value = sample
  render()
})
const pickTheme = dropdown(document.querySelector<HTMLElement>('[data-dropdown=theme]')!, (value, label) => {
  theme = value
  themeName = label
  render()
})

input.addEventListener('input', render)
input.value = samples.typescript!
// Links such as the Themes page open the playground with `?theme=nord` or `?lang=rust` already picked.
const params = new URLSearchParams(location.search)
const [langParam, themeParam] = [params.get('lang'), params.get('theme')]
if (langParam) pickLang(langParam)
if (themeParam) pickTheme(themeParam)
render()
