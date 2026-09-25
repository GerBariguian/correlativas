// Administrative protocol. No Firebase initialization, credentials or client imports.
const { createHash, randomUUID } = require('node:crypto')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const GENERATION = 'multicareer-v1'
const clone = value => structuredClone(value)
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)
const hash = value => createHash('sha256').update(canonical(value)).digest('hex')
const equal = (a, b) => canonical(a) === canonical(b)
const fail = code => { throw Object.assign(new Error(code), { code }) }
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value)
const stamp = value => value && Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds)
  && value.nanoseconds >= 0 && value.nanoseconds < 1e9
const object = value => value && typeof value === 'object' && !Array.isArray(value)
const direct = (docs, collection) => Object.entries(docs).filter(([path]) => path.startsWith(collection + '/')
  && path.split('/').length === collection.split('/').length + 1).sort(([a], [b]) => a.localeCompare(b))
// Reuse the current DTO validators without loading Firebase or app configuration.
const domain = ['careerInstanceLogic.js', 'careerInstancePersistenceLogic.js'].map(file =>
  readFileSync(join(__dirname, '../src', file), 'utf8').replace(/^import .*\r?\n/gm, '').replace(/export /g, '')).join('\n')
const { decodeCareerMetadata, decodeCatalogMembership } = new Function(`${domain}\nreturn {decodeCareerMetadata,decodeCatalogMembership}`)()
const projection = readFileSync(join(__dirname, '../src/projectionPersistenceLogic.js'), 'utf8').replace(/export /g, '')
const decodeProjection = new Function(`${projection}\nreturn decodeProjection`)()

function validateControl(control, manifest, uid) {
  const legal = { legacy: ['pending', 'blocked'], frozen: ['copying', 'validated', 'blocked'], instances: ['complete', 'blocked'] }
  if (!control || control.schemaVersion !== 1 || control.generation !== GENERATION
    || !legal[control.authority]?.includes(control.phase) || !['legacy', 'new'].includes(control.origin)
    || control.manifestId !== uid || !stamp(control.updatedAt)
    || !manifest || manifest.schemaVersion !== 1 || manifest.uid !== uid || manifest.generation !== GENERATION
    || manifest.origin !== control.origin) fail('INVALID_MIGRATION_TRANSITION')
  if (control.phase !== 'blocked' && (
    (control.authority === 'legacy' && manifest.checkpoints?.FREEZE)
    || (control.authority === 'frozen' && (!manifest.checkpoints?.FREEZE || manifest.checkpoints?.CUTOVER))
    || (control.phase === 'validated' && (!manifest.checkpoints?.VALIDATE || !manifest.validation?.ok))
    || (control.phase === 'complete' && (!manifest.checkpoints?.CUTOVER || !manifest.validation?.ok)))) fail('INVALID_MIGRATION_TRANSITION')
}
function validateManifest(manifest, catalogIds) {
  if (!Array.isArray(manifest.inventory) || !object(manifest.assignments) || !Array.isArray(manifest.copied)
    || !Array.isArray(manifest.conflicts) || !object(manifest.checkpoints)
    || manifest.catalogRegistryHash !== hash([...catalogIds].sort())) fail('MANIFEST_INSTANCE_CONFLICT')
  if (!manifest.checkpoints.REREAD) return
  const expected = manifest.inventory.filter(row => row.strong && row.known).map(row => row.catalogId).sort()
  if (!equal(expected, Object.keys(manifest.assignments).sort())
    || new Set(manifest.copied).size !== manifest.copied.length
    || manifest.copied.some(c => !expected.includes(c))) fail('MANIFEST_INSTANCE_CONFLICT')
  const ids = new Set()
  for (const [catalog, assignment] of Object.entries(manifest.assignments)) {
    if (!id(assignment.instanceId) || ids.has(assignment.instanceId) || assignment.metadata?.catalogId !== catalog) fail('MANIFEST_INSTANCE_CONFLICT')
    try { decodeCareerMetadata(manifest.uid, assignment.instanceId, assignment.metadata) }
    catch { fail('MANIFEST_INSTANCE_CONFLICT') }
    ids.add(assignment.instanceId)
  }
  if (manifest.checkpoints.COPY && manifest.copied.length !== expected.length) fail('MANIFEST_INSTANCE_CONFLICT')
}
// Model for bridge/recovery fixtures only. NOT wired into the current client/Rules.
function legacyWritesAllowed(control) {
  return control == null || (control.authority === 'legacy' && control.phase === 'pending')
}
function pairs(docs, uid) {
  const instances = direct(docs, `users/${uid}/careerInstances`), memberships = direct(docs, `users/${uid}/catalogMemberships`)
  const result = Object.create(null)
  for (const [path, data] of instances) {
    const instanceId = path.split('/').at(-1)
    try { decodeCareerMetadata(uid, instanceId, data) } catch { fail('MEMBERSHIP_INSTANCE_CONFLICT') }
    if (Object.hasOwn(result, data.catalogId)) fail('MEMBERSHIP_INSTANCE_CONFLICT')
    const membership = docs[`users/${uid}/catalogMemberships/${data.catalogId}`]
    try { if (decodeCatalogMembership(membership) !== instanceId) fail('MEMBERSHIP_INSTANCE_CONFLICT') }
    catch { fail('MEMBERSHIP_INSTANCE_CONFLICT') }
    result[data.catalogId] = { instanceId, metadata: data }
  }
  if (memberships.length !== instances.length) fail('MEMBERSHIP_INSTANCE_CONFLICT')
  return result
}
function relevantPlans(docs, uid) {
  return direct(docs, 'jointPlans').filter(([, p]) => p.ownerId === uid || p.memberIds?.includes(uid) || p.inviteeIds?.includes(uid))
}
function source(docs, uid) {
  const result = {}
  const user = docs[`users/${uid}`]
  // Selection is the only account field read for academic migration.
  if (user) result[`users/${uid}`] = { activeCareerId: user.activeCareerId ?? null }
  for (const prefix of [`users/${uid}/careers`, `users/${uid}/careerProjections`, `planningSnapshots/${uid}/careers`]) {
    for (const [p, d] of direct(docs, prefix)) result[p] = d
  }
  for (const p of [`planningSharing/${uid}`, `socialProfiles/${uid}`]) if (docs[p]) result[p] = docs[p]
  for (const [p, d] of relevantPlans(docs, uid)) {
    result[p] = d
    for (const [s, v] of direct(docs, p + '/subjects')) result[s] = v
    for (const participant of new Set([d.ownerId, ...(d.memberIds || []), ...(d.inviteeIds || [])])) {
      if (!id(participant)) fail('LEGACY_SOURCE_CONFLICT')
      // The current user's target is validated separately; others are external binding evidence.
      if (participant === uid) continue
      for (const prefix of [`users/${participant}/careerInstances`, `users/${participant}/catalogMemberships`]) {
        for (const [s, v] of direct(docs, prefix)) result[s] = v
      }
    }
  }
  return result
}
function validConsent(docs, uid, known) {
  const s = docs[`planningSharing/${uid}`], c = s?.sharedCareerId
  const p = docs[`users/${uid}/careers/${c}`], snap = docs[`planningSnapshots/${uid}/careers/${c}`]
  const version = s?.consentVersion ?? 1
  const codes = list => Array.isArray(list) && list.length <= 1000 && new Set(list).size === list.length
    && list.every(c => typeof c === 'string' && /^[A-Za-z0-9._-]{1,32}$/.test(c))
  // No recalculation or inferred consent from a derived/public document.
  return s?.enabled === true && known.has(c) && [1, 2].includes(version) && stamp(s.updatedAt)
    && stamp(p?.updatedAt) && object(p?.statusMap) && snap?.schemaVersion === version
    && equal(snap.sourceUpdatedAt, p.updatedAt) && stamp(snap.updatedAt)
    && codes(snap.approvedCodes) && codes(snap.availableToCourseCodes)
    && !snap.approvedCodes.some(c => snap.availableToCourseCodes.includes(c))
    && (version === 1 ? !Object.hasOwn(snap, 'pendingFinalCodes')
      : codes(snap.pendingFinalCodes) && !snap.pendingFinalCodes.some(c => snap.approvedCodes.includes(c) || snap.availableToCourseCodes.includes(c)))
}
function inventory(docs, uid, catalogIds) {
  if (!id(uid)) fail('INVALID_INPUT')
  const known = new Set(catalogIds), rows = new Map()
  const add = (catalogId, kind, path, strong) => {
    if (typeof catalogId !== 'string' || !catalogId.length) return
    if (!rows.has(catalogId)) rows.set(catalogId, { catalogId, known: known.has(catalogId), strong: false, evidence: [] })
    const row = rows.get(catalogId)
    row.strong ||= strong
    row.evidence.push({ kind, path, strength: strong ? 'strong' : 'weak', hash: hash(docs[path]) })
  }
  for (const [path] of direct(docs, `users/${uid}/careers`)) add(path.split('/').at(-1), 'progress', path, true)
  for (const [path] of direct(docs, `users/${uid}/careerProjections`)) add(path.split('/').at(-1), 'projection', path, true)
  const active = docs[`users/${uid}`]?.activeCareerId
  add(active, 'selection', `users/${uid}`, known.has(active))
  const sharing = docs[`planningSharing/${uid}`]
  add(sharing?.sharedCareerId, 'consent', `planningSharing/${uid}`, validConsent(docs, uid, known))
  for (const [path] of direct(docs, `planningSnapshots/${uid}/careers`)) add(path.split('/').at(-1), 'snapshot', path, false)
  add(docs[`socialProfiles/${uid}`]?.careerId, 'social-profile', `socialProfiles/${uid}`, false)
  for (const [path, plan] of relevantPlans(docs, uid)) add(plan.careerId, 'joint-plan', path, false)
  return [...rows.values()].sort((a, b) => a.catalogId.localeCompare(b.catalogId)).map(row => ({ ...row,
    action: row.strong ? row.known ? 'resolve' : 'review' : 'preserve-reference',
    conflict: row.strong && !row.known ? 'UNKNOWN_CATALOG_REQUIRES_REVIEW' : null }))
}
function targets(docs, uid, catalogId, instanceId) {
  const result = {}, base = `users/${uid}/careerInstances/${instanceId}`
  const p = docs[`users/${uid}/careers/${catalogId}`]
  if (p) {
    if (!object(p.statusMap) || !stamp(p.updatedAt)
      || !Object.values(p.statusMap).every(v => ['Pendiente', 'Cursando', 'Regularizada', 'Aprobada'].includes(v))) fail('LEGACY_SOURCE_CONFLICT')
    result[base + '/academic/progress'] = { schemaVersion: 1, statusMap: p.statusMap, revision: 1, updatedAt: p.updatedAt }
  }
  const projection = docs[`users/${uid}/careerProjections/${catalogId}`]
  if (projection) {
    if (!stamp(projection.updatedAt)) fail('LEGACY_SOURCE_CONFLICT')
    try { decodeProjection({ ...projection, updatedAt: { toMillis: () => 0 } }, catalogId) }
    catch { fail('LEGACY_SOURCE_CONFLICT') }
    result[base + '/planning/projection'] = { schemaVersion: 3, revisionToken: projection.revisionToken,
      scenario: projection.scenario, updatedAt: projection.updatedAt }
  }
  return result
}
function intents(docs, uid, manifest, catalogIds) {
  const known = new Set(catalogIds), own = pairs(docs, uid)
  const active = docs[`users/${uid}`]?.activeCareerId
  const selection = known.has(active) && own[active]?.metadata.lifecycle === 'active' ? own[active].instanceId : null
  const consent = docs[`planningSharing/${uid}`], catalogId = consent?.sharedCareerId ?? null
  const sharing = { catalogId, careerInstanceId: own[catalogId]?.instanceId ?? null, enabled: false,
    eligibleToImport: !!validConsent(docs, uid, known) && own[catalogId]?.metadata.lifecycle === 'active',
    consentVersion: [1, 2].includes(consent?.consentVersion ?? 1) ? consent?.consentVersion ?? 1 : null }
  const plans = relevantPlans(docs, uid).map(([path, p]) => ({ path, sourceHash: hash(p), catalogId: p.careerId ?? null,
    subjects: direct(docs, path + '/subjects').map(([path, d]) => ({ path, hash: hash(d) })),
    bindings: [...new Set([p.ownerId, ...(p.memberIds || []), ...(p.inviteeIds || [])])].sort().map(participant => {
      const match = known.has(p.careerId) ? pairs(docs, participant)[p.careerId] : null
      return { uid: participant, careerInstanceId: match?.instanceId ?? null,
        bindingState: !known.has(p.careerId) ? 'catalog-unavailable' : match ? 'resolved' : 'unresolved' }
    }) }))
  return { selection, sharing, plans }
}

// Each step is one adapter transaction. COPY copies at most one catalog per step.
// The adapter must provide a complete, consistent local snapshot and atomic commit.
function migrator(adapter, { catalogIds, newId = randomUUID } = {}) {
  if (!adapter || !['fixture', 'emulator'].includes(adapter.environment) || !Array.isArray(catalogIds)
    || !catalogIds.every(id) || new Set(catalogIds).size !== catalogIds.length) fail('UNSAFE_MIGRATION_ENVIRONMENT')
  async function step(uid, requested, { dryRun = false } = {}) {
    if (!id(uid) || !['INVENTORY', 'FREEZE', 'REREAD', 'COPY', 'VALIDATE', 'CUTOVER'].includes(requested)) fail('INVALID_INPUT')
    return adapter.transaction(async (docs, now) => {
      const cp = `migrationUsers/${uid}`, mp = `migrationManifests/${uid}`
      const writes = {}, set = (p, d) => { docs[p] = clone(d); writes[p] = clone(d) }
      let c = docs[cp], m = docs[mp]
      const save = () => { set(cp, c); set(mp, m) }
      const checkpoint = name => { m.checkpoints[name] ??= now; m.updatedAt = now; c.updatedAt = now }
      try {
        if (!c && !m && requested === 'INVENTORY') {
          const rows = inventory(docs, uid, catalogIds)
          c = { schemaVersion: 1, generation: GENERATION, authority: 'legacy', phase: 'pending', origin: 'legacy', manifestId: uid, updatedAt: now }
          m = { schemaVersion: 1, generation: GENERATION, uid, origin: 'legacy', inventory: rows,
            catalogRegistryHash: hash([...catalogIds].sort()), initialSourceHash: hash(source(docs, uid)), frozenSourceHash: null, assignments: {}, copied: [],
            unresolved: rows.filter(r => !r.strong || !r.known), conflicts: [], validation: null, intents: null,
            checkpoints: { INVENTORY: now }, createdAt: now, updatedAt: now }
          save()
        } else {
          validateControl(c, m, uid)
          validateManifest(m, catalogIds)
          if (c.phase === 'blocked') return { writes: {}, result: { uid, phase: c.phase, authority: c.authority,
            checkpoints: clone(m.checkpoints), conflicts: clone(m.conflicts), dryRun } }
          const existing = pairs(docs, uid)
          for (const [catalog, assignment] of Object.entries(m.assignments)) {
            if (existing[catalog] && existing[catalog].instanceId !== assignment.instanceId) fail('MANIFEST_INSTANCE_CONFLICT')
            if (m.copied.includes(catalog) && !existing[catalog]) fail('MEMBERSHIP_INSTANCE_CONFLICT')
          }
          if (c.authority === 'instances') {
            // Future instance edits are authoritative: never compare/copy old academic data again.
            if (!m.checkpoints.CUTOVER || m.validation?.ok !== true) fail('VALIDATION_FAILED')
          } else if (requested === 'INVENTORY' || m.checkpoints[requested]) {
            // Phase reruns do not reset checkpoints, dates or identity.
          } else if (requested === 'FREEZE') {
            if (c.authority !== 'legacy' || c.phase !== 'pending') fail('INVALID_MIGRATION_TRANSITION')
            c.authority = 'frozen'; c.phase = 'copying'; checkpoint('FREEZE'); save()
          } else if (requested === 'REREAD') {
            if (c.authority !== 'frozen' || !m.checkpoints.FREEZE) fail('INVALID_MIGRATION_TRANSITION')
            m.inventory = inventory(docs, uid, catalogIds)
            m.unresolved = m.inventory.filter(r => !r.strong || !r.known)
            if (m.inventory.some(r => r.conflict)) fail('UNKNOWN_CATALOG_REQUIRES_REVIEW')
            for (const row of m.inventory.filter(r => r.strong)) {
              const instanceId = existing[row.catalogId]?.instanceId ?? newId()
              if (!id(instanceId) || instanceId === row.catalogId
                || Object.values(m.assignments).some(a => a.instanceId === instanceId)) fail('MANIFEST_INSTANCE_CONFLICT')
              m.assignments[row.catalogId] = { instanceId, metadata: existing[row.catalogId]?.metadata ?? {
                schemaVersion: 1, catalogId: row.catalogId, lifecycle: 'active', createdAt: now, updatedAt: now, archivedAt: null } }
              targets(docs, uid, row.catalogId, instanceId)
            }
            m.frozenSourceHash = hash(source(docs, uid)); checkpoint('REREAD'); save()
          } else {
            if (c.authority !== 'frozen' || !m.checkpoints.REREAD) fail('INVALID_MIGRATION_TRANSITION')
            if (m.frozenSourceHash !== hash(source(docs, uid))) fail('LEGACY_SOURCE_CONFLICT')
            if (requested === 'COPY') {
              const catalog = Object.keys(m.assignments).find(k => !m.copied.includes(k))
              if (catalog) {
                const a = m.assignments[catalog], ip = `users/${uid}/careerInstances/${a.instanceId}`
                const expected = { [ip]: a.metadata, [`users/${uid}/catalogMemberships/${catalog}`]: { schemaVersion: 1, careerInstanceId: a.instanceId },
                  ...targets(docs, uid, catalog, a.instanceId) }
                for (const [path, value] of Object.entries(expected)) {
                  if (docs[path] && !equal(docs[path], value)) fail('VALIDATION_FAILED')
                }
                for (const [path, value] of Object.entries(expected)) if (!docs[path]) set(path, value)
                m.copied.push(catalog)
                m.updatedAt = now; c.updatedAt = now
              }
              if (m.copied.length === Object.keys(m.assignments).length) {
                m.intents = intents(docs, uid, m, catalogIds); checkpoint('COPY')
              }
              save()
            } else {
              if (!m.checkpoints.COPY) fail('INVALID_MIGRATION_TRANSITION')
              for (const [catalog, a] of Object.entries(m.assignments)) {
                if (!equal(existing[catalog]?.metadata, a.metadata)) fail('VALIDATION_FAILED')
                for (const [path, value] of Object.entries(targets(docs, uid, catalog, a.instanceId))) {
                  if (!equal(docs[path], value)) fail('VALIDATION_FAILED')
                }
              }
              if (!equal(m.intents, intents(docs, uid, m, catalogIds))) fail('VALIDATION_FAILED')
              if (requested === 'VALIDATE') {
                m.validation = { ok: true, sourceHash: m.frozenSourceHash, assignmentsHash: hash(m.assignments), errors: [] }
                c.phase = 'validated'; checkpoint('VALIDATE'); save()
              } else if (requested === 'CUTOVER') {
                if (c.phase !== 'validated' || !m.validation?.ok || m.validation.assignmentsHash !== hash(m.assignments)) fail('INVALID_MIGRATION_TRANSITION')
                const up = `users/${uid}`
                set(up, { ...(docs[up] || {}), schemaVersion: 2, activeCareerInstanceId: m.intents.selection, updatedAt: now })
                c.authority = 'instances'; c.phase = 'complete'; checkpoint('CUTOVER'); save()
              }
            }
          }
        }
      } catch (error) {
        // Never commit staged domain writes on a failed phase.
        for (const key of Object.keys(writes)) delete writes[key]
        if (!c || !m) throw error
        const code = error.code || 'VALIDATION_FAILED'
        c.phase = 'blocked'; c.updatedAt = now
        m.conflicts = [...new Set([...(Array.isArray(m.conflicts) ? m.conflicts : []), code])]; m.updatedAt = now
        m.validation = { ok: false, errors: m.conflicts }; save()
      }
      return { writes: dryRun ? {} : writes, result: { uid, phase: c.phase, authority: c.authority,
        checkpoints: clone(m.checkpoints), conflicts: clone(m.conflicts), dryRun } }
    }, uid)
  }
  async function run(uid) {
    for (const phase of ['INVENTORY', 'FREEZE', 'REREAD', 'COPY', 'VALIDATE', 'CUTOVER']) {
      let result
      do {
        result = await step(uid, phase)
        if (result.phase === 'blocked') return result
      } while (phase === 'COPY' && !result.checkpoints.COPY)
    }
    return step(uid, 'CUTOVER')
  }
  return { step, run }
}
module.exports = { migrator, inventory, validateControl, legacyWritesAllowed, hash, equal, GENERATION }
