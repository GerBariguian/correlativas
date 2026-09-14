import { useEffect, useState } from 'react'
import { auth } from '../firebase'
import { loadSocialProfiles, subscribeFriendships } from '../services/friends'
import { subscribePlanningComparison } from '../services/planning'

export const participantMessages = {
  loading: 'Cargando', disabled: 'No comparte progreso', incompatible: 'Otra carrera o plan',
  stale: 'Resumen inválido o desactualizado', unavailable: 'Sin acceso o conexión',
}

export default function usePlanningParticipants(user, career, selectedIds, attempt = 0) {
  const [friends, setFriends] = useState({ user: null, ids: [], profiles: {}, state: 'loading' })
  const [results, setResults] = useState({ key: '', values: {} })
  useEffect(() => {
    let live = true
    let version = 0
    const stop = subscribeFriendships(user.uid, async (items) => {
      const request = ++version
      if (!live || auth.currentUser !== user) return
      const ids = [...new Set(items.filter((r) => r.status === 'accepted').map((r) => r.participants.find((id) => id !== user.uid)))]
      setFriends((old) => ({ user, ids, profiles: old.user === user ? old.profiles : {}, state: 'ready' }))
      try {
        const profiles = await loadSocialProfiles(ids)
        if (live && request === version && auth.currentUser === user) setFriends({ user, ids, profiles, state: 'ready' })
      } catch {
        if (live && request === version && auth.currentUser === user) setFriends((old) => ({ ...old, state: 'error' }))
      }
    }, () => { version++; if (live && auth.currentUser === user) setFriends({ user, ids: [], profiles: {}, state: 'error' }) })
    return () => { live = false; stop() }
  }, [user, attempt])
  const acceptedIds = friends.user === user && friends.state === 'ready' ? friends.ids : []
  const key = JSON.stringify([user.uid, career.id, selectedIds, acceptedIds, attempt])
  useEffect(() => {
    let live = true
    setResults({ key, values: {} })
    const stops = selectedIds.filter((id) => acceptedIds.includes(id)).map((uid) => subscribePlanningComparison(uid, career, (value) => {
      if (live && auth.currentUser === user) setResults((old) => ({ key, values: { ...(old.key === key ? old.values : {}), [uid]: value } }))
    }))
    return () => { live = false; stops.forEach((stop) => stop()) }
  }, [user, career, key])
  return {
    friends: friends.user === user ? friends : { ids: [], profiles: {}, state: 'loading' },
    participants: selectedIds.map((uid) => ({ uid, name: friends.user === user ? friends.profiles[uid]?.name || uid : uid,
      ...(acceptedIds.includes(uid) ? results.key === key ? results.values[uid] || { state: 'loading' } : { state: 'loading' } : { state: 'unavailable' }) })),
  }
}
