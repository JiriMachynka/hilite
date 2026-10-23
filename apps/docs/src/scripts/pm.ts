import { tabs } from './tabs.ts'

// Package manager tabs: the pick is remembered and applied to every install block on every page.
const KEY = 'hilite-pm'
const blocks = [...document.querySelectorAll<HTMLElement>('[data-pm]')].map((root) => ({
  root,
  select: tabs(root, (tab) => {
    const pm = tab.dataset.pm ?? ''
    localStorage.setItem(KEY, pm)
    for (const block of blocks) apply(block, pm)
  }),
}))
const apply = (block: (typeof blocks)[number], pm: string) => {
  const tab = block.root.querySelector<HTMLButtonElement>(`[role=tab][data-pm="${pm}"]`)
  if (tab) block.select(tab)
}
const saved = localStorage.getItem(KEY)
if (saved) for (const block of blocks) apply(block, saved)
