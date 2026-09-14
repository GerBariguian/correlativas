// Proposals never contain academic progress or another person's consent to a course.
export function planName(value) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Ingresá un nombre válido.')
  const name = value.trim().replace(/\s+/g, ' ')
  if (!name || name.length > 80) throw new Error('El nombre debe tener entre 1 y 80 caracteres.')
  return name
}

export function fallbackPlanName(names) {
  const people = names.map((name) => (name || 'un amigo').trim().split(/\s+/)[0].slice(0, 20))
  if (!people.length) return 'Plan conjunto'
  if (people.length === 1) return `Plan con ${people[0]}`
  if (people.length === 2) return `Plan con ${people[0]} y ${people[1]}`
  return `Plan con ${people[0]}, ${people[1]} y ${people.length - 2} más`
}

export function invitedBy(plan, uid) { return Object.hasOwn(plan.invitedBy || {}, uid) ? plan.invitedBy[uid] : plan.ownerId }

export function assertPlanEditor(plan, uid) {
  if (!plan.memberIds.includes(uid) || plan.closed || plan.deleting) throw new Error('Solo los miembros aceptados pueden editar un plan abierto.')
}

export function newJointPlan(ownerId, careerId, inviteeIds, now, name = 'Plan conjunto') {
  if (!ownerId || !careerId || !Array.isArray(inviteeIds) || inviteeIds.length < 1 || inviteeIds.length > 4
    || inviteeIds.includes(ownerId) || new Set(inviteeIds).size !== inviteeIds.length) throw new Error('Seleccioná entre uno y cuatro amigos distintos.')
  return { ownerId, careerId, name: planName(name), inviteeIds, invitedBy: Object.fromEntries(inviteeIds.map((uid) => [uid, ownerId])), memberIds: [ownerId], closed: false, createdAt: now, updatedAt: now }
}

export function invitePlanParticipant(plan, actorId, uid) {
  assertPlanEditor(plan, actorId)
  if (!/^[A-Za-z0-9_-]+$/.test(uid) || uid === plan.ownerId || plan.inviteeIds.includes(uid) || plan.inviteeIds.length >= 4) throw new Error('Invitación duplicada o límite de cinco participantes alcanzado.')
  return { inviteeIds: [...plan.inviteeIds, uid], invitedBy: { ...plan.invitedBy, [uid]: actorId } }
}

export function changePlanMembership(plan, uid, join) {
  if (uid === plan.ownerId || !plan.inviteeIds.includes(uid) || plan.deleting || (join && plan.closed)) throw new Error('No podés cambiar esta participación.')
  const inviters = { ...plan.invitedBy }
  if (!join) delete inviters[uid]
  return join ? { memberIds: [...new Set([...plan.memberIds, uid])], inviteeIds: plan.inviteeIds }
    : { memberIds: plan.memberIds.filter((id) => id !== uid), inviteeIds: plan.inviteeIds.filter((id) => id !== uid), invitedBy: inviters }
}

export function proposedSubject(plan, actorId, code, ids, now, previous) {
  assertPlanEditor(plan, actorId)
  const allowed = [plan.ownerId, ...plan.inviteeIds]
  if (!code || !Array.isArray(ids) || ids.length < 2 || ids.length > 5 || new Set(ids).size !== ids.length
    || ids.some((id) => !allowed.includes(id))) throw new Error('Elegí al menos dos participantes del plan.')
  return { code, proposedParticipantIds: ids, addedByUid: previous?.addedByUid || (previous ? plan.ownerId : actorId), createdAt: previous?.createdAt || previous?.updatedAt || now, updatedAt: now }
}
