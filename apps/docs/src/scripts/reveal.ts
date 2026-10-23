// Landing sections below the fold fade up once as they scroll in. Ones already on screen at load are left alone.
// Each fires a `reveal` event so its own script can play an intro.
const targets = document.querySelectorAll<HTMLElement>('.headline, .fig, .compare-block')

if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.setAttribute('data-reveal', 'in')
        observer.unobserve(entry.target)
        entry.target.dispatchEvent(new Event('reveal'))
      }
    },
    { rootMargin: '0px 0px -10% 0px' },
  )
  for (const target of targets) {
    if (target.getBoundingClientRect().top < innerHeight) continue
    target.setAttribute('data-reveal', '')
    observer.observe(target)
  }
}
