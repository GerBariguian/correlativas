import { useEffect, useState } from 'react'
import { auth } from '../firebase'
import { friendsError, syncSocialProfile, loadSocialProfiles } from '../services/friends'

export default function useSocialProfile(user, careerId, enabled, readOnly = false) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ key: null, ready: false, error: '' })
  const key = enabled && user ? `${user.uid}:${readOnly ? 'read-only' : careerId}:${user.email}` : null

  useEffect(() => {
    if (!key) return
    let cancelled = false
    setState({ key, ready: false, error: '' })
    const prepare = readOnly ? loadSocialProfiles([user.uid]).then(profiles => {
      if (!profiles[user.uid]) throw new Error('El perfil social todavía no está disponible para esta cuenta.')
    }) : syncSocialProfile(user, careerId)
    prepare.then(() => {
      if (!cancelled && auth.currentUser === user) setState({ key, ready: true, error: '' })
    }).catch((error) => {
      if (!cancelled && auth.currentUser === user) setState({ key, ready: false, error: friendsError(error) })
    })
    return () => { cancelled = true }
  }, [user, careerId, key, attempt, readOnly])

  return {
    ready: Boolean(key) && state.key === key && state.ready,
    error: state.key === key ? state.error : '',
    retry: () => setAttempt((value) => value + 1),
  }
}
