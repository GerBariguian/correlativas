import { useEffect, useRef, useState } from 'react'
import { initialRoute, pageRoute, PAGE_TITLES } from './navigation.mjs'

const KEY = 'correlativas-navigation-2.1'
// A history entry belongs to this document session: reload never revives an old
// subject panel or reads entity data from a URL/history owned by another session.
export function useNavigation() {
  const [state, setState] = useState(() => ({ route: initialRoute(location.hash), depth: 0, scroll: 0 }))
  const current = useRef(state), session = useRef(null), movingBack = useRef(false)
  current.current = state
  useEffect(() => {
    const id = crypto.randomUUID()
    session.current = id
    history.replaceState({ owner: KEY, session: id, ...current.current }, '', `#${current.current.route.page}`)
    const oldRestoration = history.scrollRestoration
    history.scrollRestoration = 'manual'
    const pop = event => {
      movingBack.current = false
      const next = event.state
      if (next?.owner === KEY && next.session === id) {
        current.current = next
        setState(next)
      } else {
        // Browsing an earlier document session must never restore stale panels.
        const clean = { route: initialRoute(location.hash), depth: 0, scroll: 0 }
        history.replaceState({ owner: KEY, session: id, ...clean }, '', `#${clean.route.page}`)
        current.current = clean
        setState(clean)
      }
    }
    window.addEventListener('popstate', pop)
    return () => { window.removeEventListener('popstate', pop); history.scrollRestoration = oldRestoration }
  }, [])
  useEffect(() => {
    document.title = `${PAGE_TITLES[state.route.page]} · Correlativas · Demo 2.3.6`
    if (state.route.sheet || state.route.expanded) return
    const frame = requestAnimationFrame(() => {
      document.querySelector('#navigation-content')?.focus({ preventScroll: true })
      window.scrollTo({ top: state.scroll, behavior: 'instant' })
    })
    return () => cancelAnimationFrame(frame)
  }, [state])
  const back = () => {
    if (!movingBack.current && current.current.depth > 0) {
      movingBack.current = true
      history.back()
    }
  }
  const push = route => {
    if (movingBack.current || JSON.stringify(route) === JSON.stringify(current.current.route)) return
    history.replaceState({ owner: KEY, session: session.current, ...current.current, scroll: window.scrollY }, '', location.href)
    const next = { route, depth: current.current.depth + 1, scroll: 0 }
    history.pushState({ owner: KEY, session: session.current, ...next }, '', `#${route.page}`)
    current.current = next
    setState(next)
  }
  return {
    replace: page => {
      const next = { ...current.current, route: pageRoute(page), scroll: 0 }
      history.replaceState({ owner: KEY, session: session.current, ...next }, '', `#${page}`)
      current.current = next; setState(next)
    },
    route: state.route, canBack: state.depth > 0, back,
    go: (page, sheet = null) => {
      // A destination panel sits over its destination page, not over the
      // notification panel that launched it. Closing returns to that page;
      // another Back can still return to the original activity context.
      push(pageRoute(page))
      if (sheet) push(pageRoute(page, sheet))
    },
    panel: sheet => sheet ? push({ ...current.current.route, sheet, expanded: null }) : back(),
    detail: expanded => expanded ? push({ ...current.current.route, expanded }) : back(),
  }
}
