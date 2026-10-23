import { highlightCode } from './engine.ts'
import { samples } from './samples.ts'

// The hero editor: a transparent textarea over the highlighted markup, so typing edits what you see.
const stage = document.querySelector<HTMLElement>('[data-stage]')
if (stage) {
  const input = stage.querySelector<HTMLTextAreaElement>('.stage-in')!
  const out = stage.querySelector<HTMLElement>('.stage-out')!
  const stat = stage.querySelector<HTMLElement>('.stage-stat')!
  const langChips = [...stage.querySelectorAll<HTMLButtonElement>('[data-lang]')]
  const themeChips = [...stage.querySelectorAll<HTMLButtonElement>('[data-theme]')]
  const pressed = (chips: HTMLButtonElement[]) => chips.find((chip) => chip.getAttribute('aria-pressed') === 'true')
  let lang = pressed(langChips)?.dataset.lang ?? 'typescript'
  let theme = pressed(themeChips)?.dataset.theme ?? 'github-dark'
  const fetched = new Set<string>()
  let run = 0

  const render = async () => {
    const mine = ++run
    const started = performance.now()
    const first = !fetched.has(lang)
    fetched.add(lang)
    const html = await highlightCode(input.value, lang, theme, false)
    if (mine !== run) return
    out.innerHTML = html
    const pre = out.querySelector('pre')
    stage.style.setProperty('--stage-bg', pre?.style.backgroundColor ?? '')
    stage.style.setProperty('--stage-fg', pre?.style.color ?? '')
    const time = `${(performance.now() - started).toFixed(1)} ms`
    // The page's first render includes the theme download too, which says nothing about speed.
    if (mine === 1) return
    const chip = langChips.find((c) => c.dataset.lang === lang)
    stat.textContent = first && chip ? `${chip.dataset.kb} KB loaded, ${time}` : time
  }

  const pick = (chips: HTMLButtonElement[], chip: HTMLButtonElement) => {
    for (const other of chips) other.setAttribute('aria-pressed', String(other === chip))
  }
  for (const chip of langChips) {
    chip.addEventListener('click', () => {
      lang = chip.dataset.lang ?? lang
      pick(langChips, chip)
      input.value = samples[lang]?.trimEnd() ?? input.value
      input.scrollTop = 0
      render()
    })
  }
  for (const chip of themeChips) {
    chip.addEventListener('click', () => {
      theme = chip.dataset.theme ?? theme
      pick(themeChips, chip)
      render()
    })
  }
  input.addEventListener('input', render)
  input.addEventListener('scroll', () => {
    out.scrollTop = input.scrollTop
    out.scrollLeft = input.scrollLeft
  })
  render()
}
