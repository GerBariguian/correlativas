// Reserve the actual navigation height after wrapping, text scaling or rotation.
// Observation only: no keyboard detection, viewport resizing or gesture handlers.
export function observeNavigation(root = document.documentElement) {
  const measure = () => {
    const nav = document.querySelector('.bottom-nav')
    root.style.setProperty('--demo-bottom-nav-height', `${nav?.getBoundingClientRect().height ?? 105}px`)
  }
  const resize = new ResizeObserver(measure)
  const changes = new MutationObserver(() => {
    resize.disconnect()
    const nav = document.querySelector('.bottom-nav')
    if (nav) resize.observe(nav)
    measure()
  })
  changes.observe(document.getElementById('root'), { childList: true, subtree: true })
  measure()
  return () => { resize.disconnect(); changes.disconnect(); root.style.removeProperty('--demo-bottom-nav-height') }
}
