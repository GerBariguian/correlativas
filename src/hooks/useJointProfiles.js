import { useEffect, useState } from 'react'
import { auth } from '../firebase'
import { loadSocialProfiles } from '../services/friends'

// Social identity only, including explicit plan participants who aren't direct friends.
export default function useJointProfiles(user, ids) {
  const key = JSON.stringify([...new Set(ids)].sort())
  const [result, setResult] = useState({ user: null, key: '', profiles: {} })
  useEffect(() => {
    let live = true
    loadSocialProfiles(JSON.parse(key)).then((profiles) => {
      if (live && auth.currentUser === user) setResult({ user, key, profiles })
    }).catch(() => { if (live && auth.currentUser === user) setResult({ user, key, profiles: {} }) })
    return () => { live = false }
  }, [user, key])
  return result.user === user && result.key === key ? result.profiles : {}
}
