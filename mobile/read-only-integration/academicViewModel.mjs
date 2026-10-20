import { onboardingScopeKey } from '../../src/academicOnboardingLogic.js'
import { UTN_CATALOGS, freezeCatalogValue } from './catalogRegistry.mjs'
const states = ['idle', 'loading', 'loaded', 'absent', 'error', 'blocked', 'archived']
const statuses = ['Pendiente', 'Cursando', 'Regularizada', 'Aprobada']
const record = value => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
const fail = code => { throw Error(code) }
const text = value => typeof value === 'string' && value.trim().length > 0

export function validateAcademicCatalog(catalog, catalogId) {
  if (!record(catalog) || catalog.catalogId !== catalogId || !Array.isArray(catalog.subjects)) fail('C4_INVALID_CATALOG')
  const codes = new Set()
  for (const subject of catalog.subjects) {
    if (!record(subject) || !text(subject.code) || !/^[A-Za-z0-9_-]+$/.test(subject.code) || !text(subject.name) || subject.code === 'ALL' || codes.has(subject.code)) fail('C4_INVALID_CATALOG')
    if (Object.hasOwn(subject, 'year') && (!Number.isInteger(subject.year) || subject.year < 1)) fail('C4_INVALID_CATALOG')
    if (Object.hasOwn(subject, 'level') && !text(subject.level)) fail('C4_INVALID_CATALOG')
    if (Object.hasOwn(subject, 'term') && !text(subject.term)) fail('C4_INVALID_CATALOG')
    codes.add(subject.code)
  }
  for (const subject of catalog.subjects) {
    for (const key of ['prereqs', 'approvedPrereqs', 'finalPrereqs']) {
      if (!Object.hasOwn(subject, key)) continue
      const refs = subject[key]
      if (!Array.isArray(refs) || new Set(refs).size !== refs.length) fail('C4_INVALID_REFERENCE')
      for (const ref of refs) {
        if (ref === 'ALL' && key === 'finalPrereqs' && refs.length === 1) continue
        if (!codes.has(ref) || ref === subject.code) fail('C4_INVALID_REFERENCE')
      }
    }
  }
  return catalog
}

// Pure projection of a C3 snapshot. connectionCurrent is captured by the caller,
// not a callback into SDK/session state. No cache, writes or eligibility inference.
export function academicViewModel({ scope = null, connectionId, connectionCurrent, snapshot } = {}, catalogs = UTN_CATALOGS) {
  let identity = null
  const base = { queryState: typeof snapshot?.state === 'string' ? snapshot.state : null, catalogState: 'unselected', scope: null, rows: [], counts: null }
  const result = (state, fields = {}) => freezeCatalogValue({ ...base, state, ...fields })
  try {
    if (!record(snapshot) || !states.includes(snapshot.state)) fail('C4_INVALID_SNAPSHOT')
    if (['code', 'reason'].some(key => Object.hasOwn(snapshot, key) && typeof snapshot[key] !== 'string')) fail('C4_INVALID_SNAPSHOT')
    if (connectionCurrent !== true || scope === null) return result('idle')
    const key = onboardingScopeKey(scope)
    identity = JSON.parse(key); base.scope = identity
    if (snapshot.state === 'idle') return result('idle')
    // C3 may return scope-less input/connection errors; never expose their data.
    if (snapshot.state === 'error' && !snapshot.scope) return result('error', { code: snapshot.code ?? 'C4_QUERY_ERROR' })
    if (!connectionId || snapshot.connectionId !== connectionId || onboardingScopeKey(snapshot.scope) !== key
      || snapshot.key !== key) fail('C4_IDENTITY_MISMATCH')
    if (!record(catalogs) || !Object.hasOwn(catalogs, identity.catalogId)) return result('error', { catalogState: 'unknown', code: 'C4_UNKNOWN_CATALOG' })
    base.catalogState = 'invalid'
    const catalog = validateAcademicCatalog(catalogs[identity.catalogId], identity.catalogId)
    base.catalogState = 'available'
    if (snapshot.state !== 'loaded') {
      return result(snapshot.state, { ...(snapshot.reason ? { reason: snapshot.reason } : {}), ...(snapshot.code ? { code: snapshot.code } : {}) })
    }
    const progress = snapshot.progress
    if (!record(progress) || !record(progress.statusMap)
      || (identity.model === 'instances' ? !Number.isSafeInteger(progress.revision) || progress.revision < 1 : progress.revision !== null)) fail('C4_INVALID_PROGRESS')
    const codes = new Set(catalog.subjects.map(s => s.code))
    for (const [code, status] of Object.entries(progress.statusMap)) {
      if (!codes.has(code)) fail('C4_UNKNOWN_SUBJECT')
      if (!statuses.includes(status)) fail('C4_INVALID_STATUS')
    }
    const rows = catalog.subjects.map(subject => ({
      // Preserve full source metadata (including elective/ALL exclusions), detached.
      subject: structuredClone(subject), code: subject.code, name: subject.name,
      year: subject.year ?? null, level: subject.level ?? null, term: subject.term ?? null,
      prereqs: Object.hasOwn(subject, 'prereqs') ? [...subject.prereqs] : null,
      approvedPrereqs: Object.hasOwn(subject, 'approvedPrereqs') ? [...subject.approvedPrereqs] : null,
      finalPrereqs: Object.hasOwn(subject, 'finalPrereqs') ? [...subject.finalPrereqs] : null,
      recorded: Object.hasOwn(progress.statusMap, subject.code),
      status: Object.hasOwn(progress.statusMap, subject.code) ? progress.statusMap[subject.code] : null,
    }))
    const byStatus = Object.fromEntries(statuses.map(status => [status, rows.filter(row => row.recorded && row.status === status).length]))
    const recorded = rows.filter(row => row.recorded).length
    return result('loaded', { rows, revision: progress.revision, counts: { total: rows.length, recorded, unrecorded: rows.length - recorded, byStatus } })
  } catch (error) {
    return result('error', { code: error?.message ?? 'C4_INVALID_INPUT', scope: identity })
  }
}
