import { useState } from 'react'
import { initialPlannerSession, updatePlannerSession } from '../plannerSession'

export default function usePlannerSession(uid, careerId) {
  const [stored, setStored] = useState(() => initialPlannerSession(uid, careerId))
  let state = stored
  // Adjust before children render: never expose the previous identity's selection.
  if (stored.uid !== uid || stored.careerId !== careerId) {
    state = initialPlannerSession(uid, careerId)
    setStored(state)
  }
  const update = (field, value) => setStored(current => updatePlannerSession(current, uid, careerId, field, value))
  return { ...state, setSelectedCodes: value => update('selectedCodes', value),
    setTargetPeriod: value => update('targetPeriod', value), setDesiredCount: value => update('desiredCount', value) }
}
