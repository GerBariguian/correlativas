// Proposals never contain academic progress or another person's consent to a course.
export function newJointPlan(ownerId, careerId, inviteeIds, now) {
  if (!ownerId || !careerId || !Array.isArray(inviteeIds) || inviteeIds.length < 1 || inviteeIds.length > 4
    || inviteeIds.includes(ownerId) || new Set(inviteeIds).size !== inviteeIds.length) throw new Error('Seleccioná entre uno y cuatro amigos distintos.')
  return { ownerId, careerId, inviteeIds, memberIds: [ownerId], closed: false, createdAt: now, updatedAt: now }
}

export function changePlanMembership(plan, uid, join) {
  if (uid === plan.ownerId || !plan.inviteeIds.includes(uid) || (join && plan.closed)) throw new Error('No podés cambiar esta participación.')
  return join ? { memberIds: [...new Set([...plan.memberIds, uid])], inviteeIds: plan.inviteeIds }
    : { memberIds: plan.memberIds.filter((id) => id !== uid), inviteeIds: plan.inviteeIds.filter((id) => id !== uid) }
}

export function proposedSubject(plan, actorId, code, ids, now) {
  if (actorId !== plan.ownerId || plan.closed) throw new Error('Solo el creador puede editar un plan abierto.')
  const allowed = [plan.ownerId, ...plan.inviteeIds]
  if (!code || !Array.isArray(ids) || ids.length < 2 || ids.length > 5 || new Set(ids).size !== ids.length
    || ids.some((id) => !allowed.includes(id))) throw new Error('Elegí al menos dos participantes del plan.')
  return { code, proposedParticipantIds: ids, updatedAt: now }
}
