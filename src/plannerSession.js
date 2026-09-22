export function initialPlannerSession(uid, careerId, now = new Date()) {
  return { uid, careerId, selectedCodes: [], desiredCount: 4,
    targetPeriod: now.getMonth() < 6 ? { year: now.getFullYear(), term: '2C' }
      : { year: now.getFullYear() + 1, term: '1C' } }
}

export function updatePlannerSession(current, uid, careerId, field, value) {
  if (current.uid !== uid || current.careerId !== careerId) return current
  return { ...current, [field]: typeof value === 'function' ? value(current[field]) : value }
}
