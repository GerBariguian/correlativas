import { useEffect, useState } from 'react'
import { auth } from '../firebase'
import { subscribeJointPlans, subscribeJointSubjects } from '../services/jointPlans'

export default function useJointPlans(user, careerId, selectedId, attempt) {
  const [lists, setLists] = useState({ key: '', values: {} })
  const [subjects, setSubjects] = useState({ key: '', rows: null })
  const key = JSON.stringify([user.uid, careerId, attempt])
  const owners = [user.uid, 'invitations']
  useEffect(() => {
    let live = true
    const stops = owners.map((uid) => {
      const update = (value) => {
        if (live && auth.currentUser === user) setLists((old) => ({ key, values: { ...(old.key === key ? old.values : {}), [uid]: value } }))
      }
      return subscribeJointPlans(user.uid, uid, (rows) => update({ rows: rows || [], state: rows ? 'ready' : 'unavailable' }),
        () => update({ rows: [], state: 'error' }))
    })
    return () => { live = false; stops.forEach((stop) => stop()) }
  }, [user, key])
  const values = lists.key === key ? lists.values : {}
  const plans = owners.flatMap((uid) => values[uid]?.rows || []).filter((plan) => plan.careerId === careerId)
  const selected = plans.find((plan) => plan.id === selectedId)
  const canRead = selected && !selected.deleting && selected.memberIds.includes(user.uid)
  const subjectKey = JSON.stringify([key, selectedId, Boolean(canRead), selected?.updatedAt])
  useEffect(() => {
    if (!canRead) return
    let live = true
    const update = (rows) => { if (live && auth.currentUser === user) setSubjects({ key: subjectKey, rows }) }
    const stop = subscribeJointSubjects(selectedId, update, () => update(null))
    return () => { live = false; stop() }
  }, [user, subjectKey])
  return { plans, selected, rows: canRead && subjects.key === subjectKey ? subjects.rows : null,
    state: owners.some((uid) => !values[uid]) ? 'loading' : owners.some((uid) => values[uid].state !== 'ready') ? 'unavailable' : 'ready' }
}
