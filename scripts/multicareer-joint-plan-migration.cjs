// Protected administrative state machine. No credentials, Firebase initialization or remote I/O.
const { hash, equal, validateControl } = require('./multicareer-migration.cjs')
const id = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(x)
const opaque = x => typeof x === 'string' && /^[A-Za-z0-9]{16,40}$/.test(x)
const fail = code => { throw Object.assign(new Error(code), { code }) }
const GENERATION = 'joint-plan-c-v1'
const stamp = x => x && Number.isInteger(x.seconds) && Number.isInteger(x.nanoseconds)
function sourcePlan(p, catalogs) {
  if (p && Object.hasOwn(p, 'name') && (typeof p.name !== 'string' || !p.name.trim()
    || p.name.length > 80 || /[\u0000-\u001f\u007f]/.test(p.name))) fail('CORRUPT_SOURCE')
  if (!p || ![undefined, 2].includes(p.schemaVersion) || !id(p.ownerId)
    || !Array.isArray(p.memberIds) || !Array.isArray(p.inviteeIds)
    || !p.memberIds.every(id) || !p.inviteeIds.every(id)
    || new Set(p.memberIds).size !== p.memberIds.length || new Set(p.inviteeIds).size !== p.inviteeIds.length
    || !p.memberIds.includes(p.ownerId) || p.inviteeIds.includes(p.ownerId)
    || p.memberIds.some(u => u !== p.ownerId && !p.inviteeIds.includes(u))
    || typeof p.closed !== 'boolean' || (p.deleting !== undefined && typeof p.deleting !== 'boolean')
    || (p.deleting === true && !p.closed)
    || !stamp(p.createdAt) || !stamp(p.updatedAt)) fail('CORRUPT_SOURCE')
  if (p.inviteeIds.length > 4 || p.memberIds.length > 5) fail('OVERCAPACITY')
  const catalogId = p.schemaVersion === 2 ? p.catalogId : p.careerId
  if (!catalogs.includes(catalogId)) fail('CATALOG_UNAVAILABLE')
  return catalogId
}
function binding(docs, uid, catalog, p) {
  const control = docs[`migrationUsers/${uid}`], manifest = docs[`migrationManifests/${uid}`]
  try { validateControl(control, manifest, uid) } catch { fail('UNRESOLVED_CONTROL:' + uid) }
  if (control.authority !== 'instances' || control.phase !== 'complete') fail('UNRESOLVED_CONTROL:' + uid)
  const index = docs[`users/${uid}/catalogMemberships/${catalog}`]
  if (!index || Object.keys(index).sort().join() !== 'careerInstanceId,schemaVersion'
    || index.schemaVersion !== 1 || !id(index.careerInstanceId)) fail('UNRESOLVED_BINDING:' + uid)
  const instanceId = index.careerInstanceId, m = docs[`users/${uid}/careerInstances/${instanceId}`]
  if (!m || m.schemaVersion !== 1 || m.catalogId !== catalog || !['active', 'archived'].includes(m.lifecycle)
    || !stamp(m.createdAt) || !stamp(m.updatedAt)) fail('UNRESOLVED_BINDING:' + uid)
  if (p.schemaVersion === 2 && (p.participants?.[uid]?.bindingState !== 'resolved'
    || p.participants[uid].careerInstanceId !== instanceId)) fail('UNRESOLVED_BINDING:' + uid)
  return instanceId
}
const empty = now => ({ status: 'empty', uid: null, revision: 0, occurrence: null, cycle: null,
  invitedBy: null, binding: null, joinedOccurrence: null, updatedAt: now })
function candidate(docs, source, targetId, catalogs, now) {
  const catalog = sourcePlan(source, catalogs), imports = {}, writes = {}
  const members = [source.ownerId, ...source.memberIds.filter(u => u !== source.ownerId).sort()]
  const bindings = Object.fromEntries(members.map(u => [u, binding(docs, u, catalog, source)]))
  const root = `jointPlans/${targetId}`
  writes[root] = { schemaVersion: 3, origin: 'migrated', ownerId: source.ownerId,
    ownerInstanceId: bindings[source.ownerId], catalogId: catalog, closed: false, deleting: false, createdAt: now }
  if (Object.hasOwn(source, 'name')) writes[root].name = source.name
  for (let n = 1; n <= 4; n++) {
    const uid = members[n], slot = 'slot' + n
    const occupancy = uid && 'import_' + hash([targetId, uid]).slice(0, 24)
    writes[`${root}/slots/${slot}`] = uid ? { ...empty(now), status: 'member', uid, revision: 1,
      binding: bindings[uid], occurrence: occupancy, joinedOccurrence: occupancy } : empty(now)
    if (uid) {
      imports[uid] = { occupancy, slot, binding: bindings[uid] }
      writes[`${root}/inviteeIndex/${uid}`] = { slotId: slot }
    }
  }
  for (const uid of members) writes[`users/${uid}/jointPlanRefs/${targetId}`] = { schemaVersion: 1 }
  return { writes, imports, bindings }
}
function planMigrator(adapter, { catalogIds } = {}) {
  if (!adapter || !['fixture', 'emulator'].includes(adapter.environment) || !Array.isArray(catalogIds)
    || !catalogIds.every(id) || new Set(catalogIds).size !== catalogIds.length) fail('UNSAFE_MIGRATION_ENVIRONMENT')
  async function step(sourceId, targetId, phase) {
    if (!id(sourceId) || !opaque(targetId) || sourceId === targetId || !['FREEZE', 'CONSTRUCT', 'PUBLISH'].includes(phase)) fail('INVALID_INPUT')
    return adapter.transaction(async (docs, now) => {
      const sourcePath = `jointPlans/${sourceId}`, targetPath = `jointPlans/${targetId}`
      const scp = `jointPlanLegacyControls/${sourceId}`, cp = `jointPlanControls/${targetId}`
      const source = docs[sourcePath], c = docs[cp], sc = docs[scp], writes = {}
      const sourceHash = hash(Object.fromEntries(Object.entries(docs).filter(([p]) => p === sourcePath || p.startsWith(sourcePath + '/'))))
      if (c && (c.generation !== GENERATION || c.sourceId !== sourceId || c.targetId !== targetId
        || !sc || sc.targetId !== targetId || sc.generation !== GENERATION)) fail('MAPPING_CONFLICT')
      if (sc && (!c || sc.targetId !== targetId)) fail('MAPPING_CONFLICT')
      // Never reconstruct an active target: its occupancies may already have changed or been deleted.
      if (c?.state === 'active') {
        if (sc.state !== 'retired') fail('DUAL_AUTHORITY')
        return { writes, result: { state: 'active', targetId, rerun: true } }
      }
      if (docs[`jointPlanTombstones/${sourceId}`] || docs[`jointPlanTombstones/${targetId}`]) fail('TOMBSTONED')
      if (c && (sc.state !== 'frozen' || c.sourceHash !== sourceHash)) fail('FROZEN_SOURCE_CHANGED')
      try {
        sourcePlan(source, catalogIds)
        if (!c) {
          if (phase !== 'FREEZE') fail('FREEZE_REQUIRED')
          if (docs[targetPath]) fail('TARGET_CONFLICT')
          const historyOnly = source.closed || source.deleting === true
          writes[scp] = { schemaVersion: 1, generation: GENERATION, state: 'frozen', targetId }
          writes[cp] = { schemaVersion: 1, generation: GENERATION, sourceId, targetId,
            state: historyOnly ? 'history-only' : 'frozen', sourceHash, source,
            pending: source.inviteeIds.filter(u => !source.memberIds.includes(u)), createdAt: now, errors: [] }
        } else if (c.state === 'history-only' || phase === 'FREEZE') {
          return { writes, result: { state: c.state, targetId } }
        } else {
          const proposed = candidate(docs, source, targetId, catalogIds, c.createdAt)
          if (phase === 'CONSTRUCT') {
            if (c.state === 'staged') return { writes, result: { state: 'staged', targetId } }
            if (c.state !== 'frozen') fail('INVALID_PHASE')
            if (Object.keys(docs).some(p => p === targetPath || p.startsWith(targetPath + '/'))) fail('TARGET_CONFLICT')
            for (const [p, value] of Object.entries(proposed.writes)) {
              if (docs[p] && !equal(docs[p], value)) fail('TARGET_REF_CONFLICT')
              writes[p] = value
            }
            writes[cp] = { ...c, state: 'staged', imports: proposed.imports, bindings: proposed.bindings, errors: [] }
          } else {
            if (c.state !== 'staged') fail('CONSTRUCTION_REQUIRED')
            if (!equal(c.imports, proposed.imports) || !equal(c.bindings, proposed.bindings)) fail('BINDING_CHANGED')
            for (const [p, value] of Object.entries(proposed.writes)) if (!equal(docs[p], value)) fail('CANDIDATE_CONFLICT')
            if (Object.keys(docs).some(p => p.startsWith(targetPath + '/') && !Object.hasOwn(proposed.writes, p))) fail('CANDIDATE_CONFLICT')
            writes[cp] = { ...c, state: 'active', publishedAt: now, errors: [] }
            writes[scp] = { ...sc, state: 'retired' }
          }
        }
      } catch (e) {
        // Freeze is retained; no partial candidate/publication is committed.
        return { writes: c ? { [cp]: { ...c, errors: [e.code || 'VALIDATION_FAILED'] } } : {},
          result: { state: 'blocked', targetId, errors: [e.code || 'VALIDATION_FAILED'] } }
      }
      return { writes, result: { state: writes[cp]?.state || c.state, targetId } }
    }, { sourceId, targetId })
  }
  async function run(sourceId, targetId) {
    let result
    for (const phase of ['FREEZE', 'CONSTRUCT', 'PUBLISH']) {
      result = await step(sourceId, targetId, phase)
      if (['blocked', 'history-only'].includes(result.state)) break
    }
    return result
  }
  return { step, run }
}
module.exports = { planMigrator, candidate, sourcePlan, GENERATION }
