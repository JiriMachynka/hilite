/**
 * Wires a tablist: click or arrow keys pick a tab and show its panel. Returns `select` so callers can pick one by code.
 * `onSelect` runs only when the user picks, not when `select` is called.
 */
export const tabs = (root: HTMLElement, onSelect?: (tab: HTMLButtonElement) => void) => {
  const list = [...root.querySelectorAll<HTMLButtonElement>('[role=tab]')]
  const select = (tab: HTMLButtonElement) => {
    for (const other of list) {
      const on = other === tab
      other.setAttribute('aria-selected', String(on))
      other.tabIndex = on ? 0 : -1
      document.getElementById(other.getAttribute('aria-controls')!)!.hidden = !on
    }
  }
  const pick = (tab: HTMLButtonElement) => {
    select(tab)
    onSelect?.(tab)
  }
  for (const tab of list) tab.addEventListener('click', () => pick(tab))
  root.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step || !(event.target instanceof HTMLButtonElement)) return
    const next = list[(list.indexOf(event.target) + step + list.length) % list.length]!
    pick(next)
    next.focus()
  })
  return select
}
