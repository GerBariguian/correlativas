import { availableToCourse, getStatus } from './logic'

export const SNAPSHOT_SCHEMA = 1
export const PLANNING_LOGIC_VERSION = '1'

export function catalogVersion(career) {
  // Fingerprint the inputs that affect course eligibility. Update logicVersion for logic changes.
  const input = JSON.stringify(career.subjects.map((s) => [s.code, s.prereqs || [], s.approvedPrereqs || []]))
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619)
  return `${career.id}:${(hash >>> 0).toString(16)}`
}

export function derivePlanningSnapshot(career, statusMap, sourceUpdatedAt, updatedAt, includeFinals = false) {
  return {
    approvedCodes: career.subjects.filter((s) => getStatus(statusMap, s.code) === 'Aprobada').map((s) => s.code),
    availableToCourseCodes: availableToCourse(career.subjects, statusMap).map((s) => s.code),
    sourceUpdatedAt,
    updatedAt,
    ...(includeFinals ? { pendingFinalCodes: career.subjects.filter((s) => getStatus(statusMap, s.code) === 'Regularizada').map((s) => s.code) } : {}),
    schemaVersion: includeFinals ? 2 : SNAPSHOT_SCHEMA,
    logicVersion: PLANNING_LOGIC_VERSION,
    catalogVersion: catalogVersion(career),
  }
}

export function snapshotCompatible(snapshot, career) {
  const codes = new Set(career.subjects.map((s) => s.code))
  const validCodes = (list) => Array.isArray(list) && list.every((code) => typeof code === 'string' && codes.has(code)) && new Set(list).size === list.length
  return [SNAPSHOT_SCHEMA, 2].includes(snapshot?.schemaVersion)
    && snapshot.logicVersion === PLANNING_LOGIC_VERSION
    && snapshot.catalogVersion === catalogVersion(career)
    && validCodes(snapshot.approvedCodes) && validCodes(snapshot.availableToCourseCodes)
    && !snapshot.approvedCodes.some((code) => snapshot.availableToCourseCodes.includes(code))
    && (snapshot.schemaVersion === 1 ? !('pendingFinalCodes' in snapshot) : (validCodes(snapshot.pendingFinalCodes)
      && !snapshot.pendingFinalCodes.some((code) => snapshot.approvedCodes.includes(code) || snapshot.availableToCourseCodes.includes(code))))
}

export const PLANNING_LAYERS = { approved: 'approvedCodes', available: 'availableToCourseCodes', finals: 'pendingFinalCodes' }

export function addComparisonFriend(ids, uid, acceptedIds) {
  return uid && acceptedIds.includes(uid) && !ids.includes(uid) && ids.length < 4 ? [...ids, uid] : ids
}

export function compareParticipants(subjects, participants, layer) {
  const field = PLANNING_LAYERS[layer]
  if (!field) throw new Error('Capa desconocida.')
  const known = participants.filter((p) => p.state === 'ready' && Array.isArray(p.snapshot?.[field]))
  const missing = participants.filter((p) => !known.includes(p))
  const sets = new Map(known.map((p) => [p.uid, new Set(p.snapshot[field])]))
  return subjects.map((subject) => {
    const matches = known.filter((p) => sets.get(p.uid).has(subject.code))
    const all = missing.length === 0 && participants.length > 0 && matches.length === participants.length
    return { subject, matches, missing, total: participants.length, all,
      category: all ? 'both' : matches.length > 1 ? 'subset' : matches[0]?.isSelf ? 'mine' : matches.length ? 'friend' : 'neither' }
  })
}

export function plannedEligibility(code, ids, participants, memberIds) {
  return ids.map((uid) => {
    const person = participants.find((p) => p.uid === uid)
    const state = !memberIds.includes(uid) ? 'not-member' : !person || person.state !== 'ready' ? 'unknown'
      : person.snapshot.availableToCourseCodes.includes(code) ? 'eligible' : 'no-longer-eligible'
    return { uid, name: person?.name || uid, state }
  })
}

export function comparePlanning(subjects, mine, friend, layer) {
  if (!mine || !friend) return [] // Unknown data must never mean pending or "only mine".
  const field = layer === 'approved' ? 'approvedCodes' : 'availableToCourseCodes'
  const ownCodes = new Set(mine[field])
  const friendCodes = new Set(friend[field])
  return subjects.map((subject) => {
    const own = ownCodes.has(subject.code)
    const other = friendCodes.has(subject.code)
    return { subject, own, other, category: own && other ? 'both' : own ? 'mine' : other ? 'friend' : 'neither' }
  })
}
