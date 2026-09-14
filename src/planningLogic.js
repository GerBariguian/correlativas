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

export function derivePlanningSnapshot(career, statusMap, sourceUpdatedAt, updatedAt) {
  return {
    approvedCodes: career.subjects.filter((s) => getStatus(statusMap, s.code) === 'Aprobada').map((s) => s.code),
    availableToCourseCodes: availableToCourse(career.subjects, statusMap).map((s) => s.code),
    sourceUpdatedAt,
    updatedAt,
    schemaVersion: SNAPSHOT_SCHEMA,
    logicVersion: PLANNING_LOGIC_VERSION,
    catalogVersion: catalogVersion(career),
  }
}

export function snapshotCompatible(snapshot, career) {
  const codes = new Set(career.subjects.map((s) => s.code))
  const validCodes = (list) => Array.isArray(list) && list.every((code) => typeof code === 'string' && codes.has(code)) && new Set(list).size === list.length
  return snapshot?.schemaVersion === SNAPSHOT_SCHEMA
    && snapshot.logicVersion === PLANNING_LOGIC_VERSION
    && snapshot.catalogVersion === catalogVersion(career)
    && validCodes(snapshot.approvedCodes) && validCodes(snapshot.availableToCourseCodes)
    && !snapshot.approvedCodes.some((code) => snapshot.availableToCourseCodes.includes(code))
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
