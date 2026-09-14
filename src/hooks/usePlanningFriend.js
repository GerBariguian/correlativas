import { useEffect, useState } from 'react'
import { auth } from '../firebase'
import { loadSocialProfiles, subscribeFriendships } from '../services/friends'
import { subscribePlanningComparison } from '../services/planning'

export default function usePlanningFriend(user, career, selectedId, attempt) {
  const [friends, setFriends] = useState({ user: null, ids: [], profiles: {}, state: 'loading' })
  const [comparison, setComparison] = useState({ key: null, state: 'loading' })
  useEffect(() => {
    let cancelled = false
    let version = 0
    const stop = subscribeFriendships(user.uid, async (relationships) => {
      const request = ++version
      const ids = relationships.filter((item) => item.status === 'accepted')
        .map((item) => item.participants.find((uid) => uid !== user.uid))
      if (cancelled || auth.currentUser !== user) return
      setFriends({ user, ids, profiles: {}, state: 'ready' })
      try {
        const profiles = await loadSocialProfiles(ids)
        if (!cancelled && auth.currentUser === user && request === version) setFriends({ user, ids, profiles, state: 'ready' })
      } catch {
        if (!cancelled && auth.currentUser === user && request === version) setFriends({ user, ids, profiles: {}, state: 'error' })
      }
    }, () => {
      version++
      if (!cancelled && auth.currentUser === user) setFriends({ user, ids: [], profiles: {}, state: 'error' })
    })
    return () => { cancelled = true; stop() }
  }, [user, attempt])

  const accepted = friends.user === user && friends.state === 'ready' && friends.ids.includes(selectedId)
  const key = `${user.uid}:${career.id}:${selectedId}:${attempt}`
  useEffect(() => {
    if (!selectedId || !accepted) return
    let cancelled = false
    setComparison({ key, state: 'loading' })
    const stop = subscribePlanningComparison(selectedId, career, (result) => {
      if (!cancelled && auth.currentUser === user) setComparison({ key, ...result })
    })
    return () => { cancelled = true; stop() }
  }, [user, career, selectedId, accepted, key])

  return {
    friends: friends.user === user ? friends : { ids: [], profiles: {}, state: 'loading' },
    comparison: !accepted ? { state: 'unavailable' } : comparison.key === key ? comparison : { state: 'loading' },
  }
}
