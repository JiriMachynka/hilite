const root = document.body.dataset.root ?? ''

// Copy buttons ------------------------------------------------------------------------------------
for (const button of document.querySelectorAll<HTMLButtonElement>('.panel .copy')) {
  button.addEventListener('click', async () => {
    // Tabbed panels hold several blocks; copy the one on show.
    const blocks = [...(button.parentElement?.querySelectorAll('pre') ?? [])]
    const text = blocks.find((pre) => !pre.closest('[hidden]'))?.textContent ?? ''
    await navigator.clipboard.writeText(text)
    button.textContent = 'Copied'
    setTimeout(() => (button.textContent = 'Copy'), 1500)
  })
}

// Mobile menu --------------------------------------------------------------------------------------
const menu = document.querySelector<HTMLButtonElement>('#menu-open')
const side = document.querySelector<HTMLElement>('#sidebar')
if (menu && side) {
  const set = (open: boolean) => {
    side.classList.toggle('open', open)
    menu.setAttribute('aria-expanded', String(open))
  }
  menu.addEventListener('click', () => set(!side.classList.contains('open')))
  side.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) set(false)
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && side.classList.contains('open')) {
      set(false)
      menu.focus()
    }
  })
}

// Active heading in "On this page" -----------------------------------------------------------------
const links = [...document.querySelectorAll<HTMLAnchorElement>('.outline a')]
const headings = links.map((link) => document.getElementById(link.hash.slice(1))).filter((el) => el !== null)
if (headings.length) {
  const mark = () => {
    let current = headings[0]!
    for (const heading of headings) if (heading.getBoundingClientRect().top <= 120) current = heading
    for (const link of links) {
      if (link.hash === `#${current.id}`) link.setAttribute('aria-current', 'location')
      else link.removeAttribute('aria-current')
    }
  }
  document.addEventListener('scroll', mark, { passive: true })
  mark()
}

// Search -------------------------------------------------------------------------------------------
interface Entry {
  title: string
  path: string
  group: string
  text: string
}

const dialog = document.querySelector<HTMLDialogElement>('#search')
const input = document.querySelector<HTMLInputElement>('#search-input')
const results = document.querySelector<HTMLUListElement>('#search-results')
const openers = document.querySelectorAll<HTMLButtonElement>('.search-open')

if (dialog && input && results) {
  let entries: Promise<Entry[]> | undefined
  let shown: Entry[] = []
  let active = 0

  const draw = () => {
    results.replaceChildren(
      ...shown.map((entry, index) => {
        const item = document.createElement('li')
        item.role = 'option'
        item.ariaSelected = String(index === active)
        const link = document.createElement('a')
        link.href = root + entry.path
        link.textContent = entry.title
        const group = document.createElement('small')
        group.textContent = entry.group
        link.append(group)
        item.append(link)
        return item
      }),
    )
  }

  const run = async () => {
    entries ??= fetch(`${root}search.json`).then((response) => response.json())
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean)
    active = 0
    if (!words.length) {
      shown = []
      return draw()
    }
    const score = (entry: Entry) => {
      const title = entry.title.toLowerCase()
      const text = `${title} ${entry.text.toLowerCase()} ${entry.group.toLowerCase()}`
      if (!words.every((word) => text.includes(word))) return 0
      return words.reduce((sum, word) => sum + (title.startsWith(word) ? 3 : title.includes(word) ? 2 : 1), 0)
    }
    shown = (await entries)
      .map((entry) => ({ entry, rank: score(entry) }))
      .filter(({ rank }) => rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 8)
      .map(({ entry }) => entry)
    draw()
  }

  const open = () => {
    if (!dialog.open) dialog.showModal()
    input.select()
  }
  for (const opener of openers) opener.addEventListener('click', open)
  // The markup says Ctrl K; Apple keyboards get ⌘K.
  if (/Mac|iPhone|iPad/.test(navigator.userAgent)) {
    for (const key of document.querySelectorAll('.search-open kbd')) key.textContent = '⌘K'
  }
  document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      open()
    }
  })
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
  input.addEventListener('input', run)
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      active = Math.max(0, Math.min(shown.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)))
      draw()
    } else if (event.key === 'Enter') {
      const pick = shown[active]
      if (!pick) return
      event.preventDefault()
      location.href = root + pick.path
    }
  })
}
