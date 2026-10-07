// Proposals never contain academic progress or another person's consent to a course.
// C is a distinct wire contract. These DTOs do not grant authorization.
export const JOINT_C_SCHEMA = 3
export const JOINT_C_SLOTS = Object.freeze(['slot1', 'slot2', 'slot3', 'slot4'])
const cId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value)
const cOpaque = value => typeof value === 'string' && /^[A-Za-z0-9]{16,40}$/.test(value)
const cOccupancy = value => cOpaque(value) || (typeof value === 'string' && /^import_[A-Za-z0-9]{16,40}$/.test(value))
const exactCKeys = (data, keys) => data && typeof data === 'object' && !Array.isArray(data)
  && Object.keys(data).length === keys.length && keys.every(key => Object.hasOwn(data, key))
function invalidC() { throw Object.assign(new Error('INVALID_JOINT_C_DOCUMENT'), { code: 'INVALID_JOINT_C_DOCUMENT' }) }
// Explicit paths only: constructing a path or decoding data never grants access.
export function jointCPlanPath(planId) {
  if (!cOpaque(planId)) throw Object.assign(new Error('INVALID_JOINT_C_ID'), { code: 'INVALID_JOINT_C_ID' })
  return `jointPlans/${planId}`
}
export function jointCSlotPath(planId, slotId) {
  const parentPath = jointCPlanPath(planId)
  if (!JOINT_C_SLOTS.includes(slotId)) throw Object.assign(new Error('INVALID_JOINT_C_ID'), { code: 'INVALID_JOINT_C_ID' })
  return `${parentPath}/slots/${slotId}`
}
// Explicit subject/occupancy identity only; these paths do not establish membership.
export function jointCSubjectBasePath(planId, code) {
  const parentPath = jointCPlanPath(planId)
  if (typeof code !== 'string' || code.length < 1 || code.length > 100
    || code.includes('/') || code === '.' || code === '..') invalidC()
  return `${parentPath}/subjects/${code}`
}
export function jointCMemberEdgePath(planId, code, uid, occurrence) {
  const basePath = jointCSubjectBasePath(planId, code)
  if (!cId(uid) || !(occurrence === 'owner' || cOccupancy(occurrence))) invalidC()
  return `${basePath}/memberEdges/${uid}:${occurrence}`
}
// Versions belong to each document type, independently of the parent schema.
export const JOINT_C_SUBJECT_BASE_SCHEMA = 1
export const JOINT_C_MEMBER_EDGE_SCHEMA = 1
export function decodeJointCMemberReference(data) {
  if (!exactCKeys(data, ['slotId', 'instanceId', 'occurrence', 'slotRevision']) || !cId(data.instanceId)
    || !Number.isSafeInteger(data.slotRevision)
    || (data.slotId === 'owner'
      ? data.occurrence !== 'owner' || data.slotRevision !== 0
      : !JOINT_C_SLOTS.includes(data.slotId) || !cOccupancy(data.occurrence) || data.slotRevision < 1)) invalidC()
  return { ...data }
}
function cResolvedTime(stamp) {
  if (!stamp || !Number.isInteger(stamp.seconds) || stamp.seconds < -62135596800
    || stamp.seconds > 253402300799 || !Number.isInteger(stamp.nanoseconds)
    || stamp.nanoseconds < 0 || stamp.nanoseconds >= 1000000000) invalidC()
  return { seconds: stamp.seconds, nanoseconds: stamp.nanoseconds }
}
function cBaseShape(planId, code, data) {
  jointCSubjectBasePath(planId, code)
  if (!exactCKeys(data, ['schemaVersion', 'code', 'createdByUid', 'createdAt', 'creatorRef'])
    || data.schemaVersion !== JOINT_C_SUBJECT_BASE_SCHEMA || data.code !== code || !cId(data.createdByUid)) invalidC()
  return { ...data, creatorRef: decodeJointCMemberReference(data.creatorRef) }
}
function cEdgeShape(planId, code, uid, occurrence, data) {
  jointCMemberEdgePath(planId, code, uid, occurrence)
  if (!exactCKeys(data, ['schemaVersion', 'uid', 'targetRef', 'state', 'revision', 'createdByUid', 'createdAt', 'updatedByUid', 'updatedAt', 'actorRef'])
    || data.schemaVersion !== JOINT_C_MEMBER_EDGE_SCHEMA || data.uid !== uid
    || data.targetRef?.occurrence !== occurrence || !['assigned', 'unassigned'].includes(data.state)
    || !Number.isSafeInteger(data.revision) || data.revision < 1
    || !cId(data.createdByUid) || !cId(data.updatedByUid)) invalidC()
  return { ...data, targetRef: decodeJointCMemberReference(data.targetRef), actorRef: decodeJointCMemberReference(data.actorRef) }
}
// Resolved read DTOs only; decoding does not verify current occupancy or operability.
export function decodeJointCSubjectBase(planId, code, data) {
  const base = cBaseShape(planId, code, data)
  return { ...base, createdAt: cResolvedTime(base.createdAt) }
}
export function decodeJointCMemberEdge(planId, code, uid, occurrence, data) {
  const edge = cEdgeShape(planId, code, uid, occurrence, data)
  return { ...edge, createdAt: cResolvedTime(edge.createdAt), updatedAt: cResolvedTime(edge.updatedAt) }
}
// Builders accept an explicit authoritative-time token supplied by the caller.
// They never generate local time or establish authorization.
export function newJointCSubjectBase(planId, code, createdByUid, creatorRef, now) {
  if (!now) invalidC()
  return cBaseShape(planId, code, { schemaVersion: JOINT_C_SUBJECT_BASE_SCHEMA, code, createdByUid, createdAt: now, creatorRef })
}
export function newJointCMemberEdge(planId, code, uid, targetRef, actorUid, actorRef, now) {
  if (!now) invalidC()
  return cEdgeShape(planId, code, uid, targetRef?.occurrence, { schemaVersion: JOINT_C_MEMBER_EDGE_SCHEMA,
    uid, targetRef, state: 'assigned', revision: 1, createdByUid: actorUid, createdAt: now,
    updatedByUid: actorUid, updatedAt: now, actorRef })
}
// CAS within one immutable occupancy identity. New occupancy requires a new edge.
export function transitionJointCMemberEdge(planId, code, uid, expectedRef, expectedRevision, data, state, actorUid, actorRef, now) {
  const target = decodeJointCMemberReference(expectedRef)
  const edge = decodeJointCMemberEdge(planId, code, uid, target.occurrence, data)
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || expectedRevision >= Number.MAX_SAFE_INTEGER
    || edge.revision !== expectedRevision || Object.keys(target).some(k => target[k] !== edge.targetRef[k])
    || !['assigned', 'unassigned'].includes(state) || state === edge.state || !now) invalidC()
  return cEdgeShape(planId, code, uid, target.occurrence, { ...edge, state, revision: expectedRevision + 1,
    updatedByUid: actorUid, updatedAt: now, actorRef })
}
export function jointCInvitationOccurrencePath(planId, occurrenceId) {
  const parentPath = jointCPlanPath(planId)
  if (!cOpaque(occurrenceId)) throw Object.assign(new Error('INVALID_JOINT_C_ID'), { code: 'INVALID_JOINT_C_ID' })
  return `${parentPath}/invitationOccurrences/${occurrenceId}`
}
// Read DTO only. Path identities live in the envelope, not in the stored payload.
// A historical occurrence says nothing about current membership or authorization.
export function decodeJointCInvitationOccurrence(planId, occurrenceId, data) {
  jointCInvitationOccurrencePath(planId, occurrenceId)
  if (!exactCKeys(data, ['slotId', 'uid', 'invitedBy', 'cycle', 'revision', 'createdAt'])
    || !JOINT_C_SLOTS.includes(data.slotId) || !cId(data.uid) || !cId(data.invitedBy)
    || typeof data.cycle !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(data.cycle)
    || !Number.isSafeInteger(data.revision) || data.revision < 1) invalidC()
  const stamp = data.createdAt
  if (!stamp || !Number.isInteger(stamp.seconds) || stamp.seconds < -62135596800
    || stamp.seconds > 253402300799 || !Number.isInteger(stamp.nanoseconds)
    || stamp.nanoseconds < 0 || stamp.nanoseconds >= 1000000000) invalidC()
  return { planId, occurrenceId, occurrence: { ...data,
    createdAt: { seconds: stamp.seconds, nanoseconds: stamp.nanoseconds } } }
}
export function decodeJointCRef(planId, data) {
  jointCPlanPath(planId)
  const stamp = data?.createdAt
  if (!(exactCKeys(data, ['schemaVersion']) || exactCKeys(data, ['schemaVersion', 'createdAt'])) || data.schemaVersion !== 1
    || (Object.hasOwn(data, 'createdAt') && (!stamp || !Number.isInteger(stamp.seconds) || stamp.seconds < -62135596800
    || stamp.seconds > 253402300799 || !Number.isInteger(stamp.nanoseconds)
    || stamp.nanoseconds < 0 || stamp.nanoseconds >= 1000000000))) invalidC()
  return { planId }
}
export function jointPlanFamily(plan) {
  if (!plan || typeof plan !== 'object') return 'invalid'
  if (!Object.hasOwn(plan, 'schemaVersion')) return 'legacy'
  return plan.schemaVersion === JOINT_C_SCHEMA ? 'C' : plan.schemaVersion === 2 ? 'legacy-v2' : 'invalid'
}
export function decodeJointCPlan(data) {
  const keys = ['schemaVersion', 'origin', 'ownerId', 'ownerInstanceId', 'catalogId', 'closed', 'deleting', 'createdAt']
  if (!exactCKeys(data, data && Object.hasOwn(data, 'name') ? [...keys, 'name'] : keys)
    || data.schemaVersion !== JOINT_C_SCHEMA || !['native', 'migrated'].includes(data.origin)
    || !cId(data.ownerId) || !cId(data.ownerInstanceId) || !cId(data.catalogId)
    || typeof data.closed !== 'boolean' || typeof data.deleting !== 'boolean'
    || (data.deleting && !data.closed) || !data.createdAt) invalidC()
  if (Object.hasOwn(data, 'name')) {
    planName(data.name)
    if (data.name.length > 80) invalidC()
  }
  return { ...data }
}
export function newJointCPlan(ownerId, ownerInstanceId, catalogId, now, name = 'Plan conjunto') {
  return decodeJointCPlan({ schemaVersion: JOINT_C_SCHEMA, origin: 'native', ownerId, ownerInstanceId, catalogId, closed: false, deleting: false, createdAt: now, name: planName(name) })
}
export function emptyJointCSlot(now, revision = 0) {
  return decodeJointCSlot({ status: 'empty', uid: null, revision, occurrence: null, cycle: null, invitedBy: null, binding: null, joinedOccurrence: null, updatedAt: now })
}
export function decodeJointCSlot(data) {
  if (!exactCKeys(data, ['status', 'uid', 'revision', 'occurrence', 'cycle', 'invitedBy', 'binding', 'joinedOccurrence', 'updatedAt'])
    || !Number.isSafeInteger(data.revision) || data.revision < 0 || !data.updatedAt) invalidC()
  if (data.status === 'empty') {
    if (['uid', 'occurrence', 'cycle', 'invitedBy', 'binding', 'joinedOccurrence'].some(k => data[k] !== null)) invalidC()
  } else if (data.status === 'pending') {
    if (!cId(data.uid) || !cOpaque(data.occurrence) || !cId(data.cycle) || !cId(data.invitedBy) || data.binding !== null || data.joinedOccurrence !== null || data.revision < 1) invalidC()
  } else if (data.status === 'member') {
    if (!cId(data.uid) || !cId(data.binding) || !cOccupancy(data.occurrence) || data.joinedOccurrence !== data.occurrence || data.revision < 1
      || (data.occurrence.startsWith('import_') ? data.cycle !== null || data.invitedBy !== null : !cId(data.cycle) || !cId(data.invitedBy))) invalidC()
  } else invalidC()
  return { ...data }
}
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
  const allowed = [plan.ownerId, ...plan.inviteeIds,
    ...(plan.schemaVersion === 2 ? previous?.proposedParticipantIds || [] : [])]
  if (!code || !Array.isArray(ids) || ids.length < 2 || ids.length > 5 || new Set(ids).size !== ids.length
    || ids.some((id) => !allowed.includes(id))) throw new Error('Elegí al menos dos participantes del plan.')
  return { code, proposedParticipantIds: ids, addedByUid: previous?.addedByUid || (previous ? plan.ownerId : actorId), createdAt: previous?.createdAt || previous?.updatedAt || now, updatedAt: now }
}
