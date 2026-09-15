import { useEffect, useState } from 'react'
import { auth } from '../firebase'
import { subscribePlanningComparison } from '../services/planning'

// Presentation context only. Reuse comparison data; otherwise use the same authorized reader.
export default function usePlanAcademicContext(user, career, ids, acceptedIds, comparison, attempt) {
  const reusedIds = ids.filter((uid) => comparison.some((p) => p.uid === uid))
  const key = JSON.stringify([user.uid, career.id, ids, acceptedIds, reusedIds, attempt])
  const [result, setResult] = useState({ key: '', values: {} })
  useEffect(() => {
    let live = true
    const stops = ids.filter((uid) => uid !== user.uid && acceptedIds.includes(uid) && !reusedIds.includes(uid)).map((uid) => subscribePlanningComparison(uid, career, (value) => {
      if (live && auth.currentUser === user) setResult((old) => ({ key, values: { ...(old.key === key ? old.values : {}), [uid]: value } }))
    }))
    return () => { live = false; stops.forEach((stop) => stop()) }
  }, [user, career, key])
  return ids.map((uid) => ({ uid, ...(uid !== user.uid && !acceptedIds.includes(uid) ? { state: 'unrelated' }
    : comparison.find((p) => p.uid === uid) || (result.key === key ? result.values[uid] : null) || { state: 'loading' }) }))
}
