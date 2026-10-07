// Recovery evidence is not authorization. Every write is revalidated by Rules.
// C transitions are pure DTO operations; callers must supply validated slot DTOs.
export function buildJointCJoin(slot, uid, instanceId, occurrence, now) {
  if (slot.status !== 'pending' || slot.uid !== uid || slot.occurrence !== occurrence
    || typeof instanceId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(instanceId)) throw jointJoinError()
  return { ...slot, status: 'member', binding: instanceId, joinedOccurrence: occurrence, updatedAt: now }
}
export function buildJointCRelease(slot, uid, now) {
  if (!['pending', 'member'].includes(slot.status) || slot.uid !== uid
    || !Number.isSafeInteger(slot.revision) || slot.revision >= Number.MAX_SAFE_INTEGER) throw jointJoinError()
  return { status: 'empty', uid: null, revision: slot.revision + 1, occurrence: null, cycle: null,
    invitedBy: null, binding: null, joinedOccurrence: null, updatedAt: now }
}
export function sameJoinValue(a, b) {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keys = Object.keys(a).sort(), other = Object.keys(b).sort()
  return keys.length === other.length && keys.every((k, i) => k === other[i] && sameJoinValue(a[k], b[k]))
}
export function jointJoinError(code = 'JOINT_JOIN_UNAVAILABLE') { return Object.assign(new Error(code), { code }) }
export function assertJoinPlan(plan, uid) {
  const ids = plan?.inviteeIds, members = plan?.memberIds
  if (plan?.schemaVersion !== 2 || typeof plan.catalogId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(plan.catalogId)
    || plan.closed !== false || plan.deleting !== false || uid === plan.ownerId
    || !Array.isArray(ids) || ids.length > 4 || new Set(ids).size !== ids.length || ids.includes(plan.ownerId) || !ids.includes(uid)
    || !Array.isArray(members) || members.length < 1 || members.length > 5 || new Set(members).size !== members.length
    || !members.includes(plan.ownerId) || members.some(id => id !== plan.ownerId && !ids.includes(id))
    || !plan.participants || Object.keys(plan.participants).sort().join() !== [plan.ownerId, ...ids].sort().join()) throw jointJoinError()
  for (const b of Object.values(plan.participants)) {
    if (!b || Object.keys(b).sort().join() !== 'bindingState,careerInstanceId'
      || !['resolved', 'unresolved', 'catalog-unavailable'].includes(b.bindingState)
      || (b.bindingState === 'resolved' ? typeof b.careerInstanceId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(b.careerInstanceId) : b.careerInstanceId !== null)) throw jointJoinError()
  }
}
export function buildJointJoin(plan, uid, instanceId) {
  assertJoinPlan(plan, uid)
  const binding = plan.participants[uid]
  if (binding.bindingState === 'resolved' && binding.careerInstanceId !== instanceId) throw jointJoinError()
  if (plan.memberIds.includes(uid)) {
    if (binding.bindingState !== 'resolved' || binding.careerInstanceId !== instanceId) throw jointJoinError()
    return null
  }
  if (plan.memberIds.length >= 5) throw jointJoinError()
  return { memberIds: [...plan.memberIds, uid], participants: { ...plan.participants,
    [uid]: { careerInstanceId: instanceId, bindingState: 'resolved' } } }
}
export function compatibleJoinAdvance(before, after, uid, instanceId) {
  try {
    assertJoinPlan(before, uid); assertJoinPlan(after, uid)
    buildJointJoin(after, uid, instanceId)
    const without = p => Object.fromEntries(Object.entries(p).filter(([k]) => !['memberIds', 'participants', 'updatedAt'].includes(k)))
    if (!sameJoinValue(without(before), without(after)) || before.memberIds.some(id => !after.memberIds.includes(id))) return false
    const added = after.memberIds.filter(id => !before.memberIds.includes(id))
    if (!added.length || !before.updatedAt || !after.updatedAt
      || !(after.updatedAt.seconds > before.updatedAt.seconds || (after.updatedAt.seconds === before.updatedAt.seconds && after.updatedAt.nanoseconds > before.updatedAt.nanoseconds))) return false
    return Object.keys(before.participants).every(id => {
      const old = before.participants[id], next = after.participants[id]
      if (!added.includes(id)) return sameJoinValue(old, next)
      return next.bindingState === 'resolved' && (old.bindingState !== 'resolved' || old.careerInstanceId === next.careerInstanceId)
        && (id !== uid || next.careerInstanceId === instanceId)
    })
  } catch { return false }
}
