import { useEffect, useState } from 'react'
import { auth } from '../firebase'
import { createActivitySession } from '../activitySession'
import { activityRepository, activityNow } from '../services/activity'
import { loadSocialProfiles } from '../services/friends'

const initial = () => ({ recent: { status: 'loading', items: [], diagnostics: [] }, unread: { status: 'loading', items: [], diagnostics: [] }, badge: null })
// App owns this hook once. Bell and future page only consume its returned session.
export default function useActivity(user) {
  const [result, setResult] = useState(null)
  useEffect(() => {
    if (!user) return
    let live = true
    const controller = createActivitySession({ repository: activityRepository, now: activityNow })
    const requested = new Set(), actors = {}
    const current = () => live && auth.currentUser === user
    const publish = () => {
      if (!current()) return
      const state = controller.getState()
      setResult({ user, controller, state, actors: { ...actors } })
      for (const item of state.recent.items) {
        if (requested.has(item.actorUid)) continue
        requested.add(item.actorUid)
        loadSocialProfiles([item.actorUid]).then(profiles => {
          if (!current()) return
          const name = profiles[item.actorUid]?.name
          if (typeof name === 'string' && name.trim()) actors[item.actorUid] = name.trim()
          publish()
        }).catch(() => {}) // Generic actor fallback; no private error details or retry loop.
      }
    }
    const stop = controller.observe(publish)
    controller.setUser(user)
    publish()
    return () => { live = false; stop(); controller.dispose() }
  }, [user])
  if (!user || result?.user !== user) return { state: initial(), actors: {}, controller: null }
  return { state: result.state, actors: result.actors, controller: result.controller }
}
