import { validateCareerInstance } from './careerInstanceLogic.js'

export function careerPersistenceError(code) {
  return Object.assign(new Error(code), { code })
}
export function validateCareerPersistenceId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw careerPersistenceError('INVALID_INPUT')
  return value
}
export function mapCareerPersistenceError(error) {
  const known = ['INVALID_INPUT', 'DUPLICATE_CATALOG_INSTANCE', 'CAREER_INSTANCE_NOT_FOUND',
    'INVALID_CAREER_DOCUMENT', 'CAREER_SESSION_CHANGED', 'PERMISSION_DENIED', 'PERSISTENCE_CONFLICT', 'PERSISTENCE_UNAVAILABLE']
  const mapped = { 'permission-denied': 'PERMISSION_DENIED', unauthenticated: 'PERMISSION_DENIED',
    aborted: 'PERSISTENCE_CONFLICT', 'already-exists': 'PERSISTENCE_CONFLICT', unavailable: 'PERSISTENCE_UNAVAILABLE' }
  return careerPersistenceError(known.includes(error?.code) ? error.code : mapped[error?.code] || 'PERSISTENCE_FAILED')
}
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const stamp = value => value && Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds)
  && value.nanoseconds >= 0 && value.nanoseconds < 1000000000
const compare = (a, b) => a.seconds - b.seconds || a.nanoseconds - b.nanoseconds

export function decodeCareerMetadata(uid, careerInstanceId, data) {
  try {
    validateCareerPersistenceId(careerInstanceId)
    validateCareerPersistenceId(data?.catalogId)
    const instance = validateCareerInstance({ uid, careerInstanceId, catalogId: data.catalogId, lifecycle: data.lifecycle })
    if (!exact(data, ['schemaVersion', 'catalogId', 'lifecycle', 'createdAt', 'updatedAt', 'archivedAt'])
      || data.schemaVersion !== 1 || !stamp(data.createdAt) || !stamp(data.updatedAt)
      || compare(data.createdAt, data.updatedAt) > 0
      || (data.lifecycle === 'active' ? data.archivedAt !== null
        : !stamp(data.archivedAt) || compare(data.archivedAt, data.updatedAt) !== 0)) throw new Error()
    return { instance: { ...instance }, metadata: { ...data } }
  } catch { throw careerPersistenceError('INVALID_CAREER_DOCUMENT') }
}
export function decodeCatalogMembership(data) {
  if (!exact(data, ['schemaVersion', 'careerInstanceId']) || data.schemaVersion !== 1) throw careerPersistenceError('INVALID_CAREER_DOCUMENT')
  try { return validateCareerPersistenceId(data.careerInstanceId) }
  catch { throw careerPersistenceError('INVALID_CAREER_DOCUMENT') }
}
