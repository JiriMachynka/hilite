// The scope explorer: pointing at a token, or moving with the arrow keys, shows its text, color and scope stack.
const steps = new Map([
  ['ArrowRight', 1],
  ['ArrowDown', 1],
  ['ArrowLeft', -1],
  ['ArrowUp', -1],
])
for (const root of document.querySelectorAll<HTMLElement>('[data-explorer]')) {
  const pre = root.querySelector<HTMLElement>('pre')!
  const tokens = [...root.querySelectorAll<HTMLElement>('.tok')]
  const text = root.querySelector<HTMLElement>('.readout-text code')!
  const swatch = root.querySelector<HTMLElement>('.readout-swatch')!
  const color = root.querySelector<HTMLElement>('.readout-color')!
  const stack = root.querySelector<HTMLElement>('.readout-stack')!
  let current = -1
  // Always list as many rows as the deepest stack has, so pointing at a shallow token does not shrink the readout.
  const depth = Math.max(...tokens.map((token) => (token.dataset.scopes ?? '').split(' ').length))

  const show = (index: number) => {
    const token = tokens[index]
    if (!token) return
    tokens[current]?.classList.remove('on')
    token.classList.add('on')
    current = index
    text.textContent = token.textContent
    swatch.style.background = token.dataset.color ?? ''
    color.textContent = `${token.dataset.color} in GitHub Dark`
    const scopes = (token.dataset.scopes ?? '').split(' ')
    stack.replaceChildren(
      ...Array.from({ length: depth }, (_, i) => {
        const item = document.createElement('li')
        const scope = scopes[i]
        if (scope) {
          item.textContent = scope
          item.title = scope
          if (i === scopes.length - 1) item.className = 'inner'
        } else item.className = 'empty'
        return item
      }),
    )
  }

  root.addEventListener('pointerover', (event) => {
    const token = event.target instanceof Element ? event.target.closest<HTMLElement>('.tok') : null
    if (token) show(tokens.indexOf(token))
  })
  pre.addEventListener('keydown', (event) => {
    const step = steps.get(event.key)
    if (!step) return
    event.preventDefault()
    show(Math.min(tokens.length - 1, Math.max(0, current + step)))
  })
  show(tokens.findIndex((token) => token.dataset.scopes?.includes('entity.name.function')))
}
