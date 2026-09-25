const { test } = require('node:test')
const assert = require('node:assert/strict')
const { migrator, inventory, validateControl } = require('../scripts/multicareer-migration.cjs')
const { emulatorAdapter, encode, decode } = require('../scripts/multicareer-emulator.cjs')
const { fixture, TIME, progress, projection, pair } = require('./migration-fixtures.cjs')
const make = docs => { const store = fixture(docs); return { store, m: migrator(store, { catalogIds: ['cat', 'other'] }) } }
const full = () => ({ 'users/alice': { activeCareerId: 'cat', extraLegacyField: true },
  'users/alice/careers/cat': progress(), 'users/alice/careerProjections/cat': projection() })
const consent = (version = 2) => ({ 'planningSharing/alice': { enabled: true, sharedCareerId: 'cat', consentVersion: version, updatedAt: TIME },
  'users/alice/careers/cat': progress(), 'planningSnapshots/alice/careers/cat': { schemaVersion: version,
    sourceUpdatedAt: TIME, updatedAt: TIME, approvedCodes: ['A'], availableToCourseCodes: [], ...(version === 2 ? { pendingFinalCodes: ['B'] } : {}) } })
for (const [name, docs, count] of [
  ['empty', {}, 0], ['progress', { 'users/alice/careers/cat': progress() }, 1],
  ['projection', { 'users/alice/careerProjections/cat': projection() }, 1], ['both same', full(), 1],
  ['multiple', { ...full(), 'users/alice/careers/other': progress() }, 2],
  ['active', { 'users/alice': { activeCareerId: 'cat' } }, 1], ['invalid active', { 'users/alice': { activeCareerId: 'missing' } }, 0],
  ['snapshot alone', { 'planningSnapshots/alice/careers/cat': {} }, 0],
  ['profile alone', { 'socialProfiles/alice': { careerId: 'cat' } }, 0],
  ['plan alone', { 'jointPlans/p': { ownerId: 'alice', careerId: 'cat' } }, 0],
  ['many weak', { 'socialProfiles/alice': { careerId: 'cat' }, 'jointPlans/p': { ownerId: 'alice', careerId: 'other' }, 'planningSnapshots/alice/careers/cat': {} }, 0],
]) test(`inventory ${name}`, () => assert.equal(inventory(docs, 'alice', ['cat', 'other']).filter(r => r.strong).length, count))
for (const version of [1, 2]) test(`consent v${version} exact intent, never enabled`, async () => {
  const { store, m } = make(consent(version)); assert.equal((await m.run('alice')).phase, 'complete')
  const s = store.snapshot()['migrationManifests/alice'].intents.sharing
  assert.equal(s.eligibleToImport, true); assert.equal(s.enabled, false); assert.equal(s.consentVersion, version)
})
for (const [name, docs] of [
  ['absent', {}], ['disabled', { ...consent(), 'planningSharing/alice': { enabled: false, sharedCareerId: 'cat', updatedAt: TIME } }],
  ['unknown', { 'planningSharing/alice': { enabled: true, sharedCareerId: 'missing', updatedAt: TIME } }],
  ['weak only', { 'planningSharing/alice': { enabled: true, sharedCareerId: 'cat', updatedAt: TIME }, 'socialProfiles/alice': { careerId: 'cat' } }],
  ['stale', { ...consent(), 'users/alice/careers/cat': { ...progress(), updatedAt: { ...TIME, seconds: TIME.seconds + 1 } } }],
]) test(`consent safe OFF ${name}`, async () => {
  const { store, m } = make(docs); await m.run('alice')
  assert.equal(store.snapshot()['migrationManifests/alice'].intents.sharing.eligibleToImport, false)
})
test('complete migration twice preserves logical snapshot and every legacy document', async () => {
  const legacy = { ...full(), 'users/alice/activityInbox/a': { readAt: null }, 'friendships/a_b': { status: 'accepted' } }
  const { store, m } = make(legacy); assert.equal((await m.run('alice')).phase, 'complete')
  const first = store.snapshot(); await m.run('alice'); assert.deepEqual(store.snapshot(), first)
  for (const [path, data] of Object.entries(legacy)) if (path !== 'users/alice') assert.deepEqual(first[path], data)
  assert.equal(first['users/alice'].extraLegacyField, true)
  const id = first['migrationManifests/alice'].assignments.cat.instanceId
  assert.notEqual(id, 'cat'); assert.deepEqual(first[`users/alice/careerInstances/${id}/academic/progress`].statusMap, progress().statusMap)
  assert.deepEqual(first[`users/alice/careerInstances/${id}/planning/projection`].scenario, projection().scenario)
  assert.deepEqual(first[`users/alice/careerInstances/${id}/planning/projection`].updatedAt, TIME)
})
for (const version of [1, 2]) test(`projection ${version} migrates envelope only`, async () => {
  const { store, m } = make({ 'users/alice/careerProjections/cat': projection('cat', version) }); await m.run('alice')
  const d = store.snapshot(), id = d['migrationManifests/alice'].assignments.cat.instanceId
  assert.equal(d[`users/alice/careerInstances/${id}/planning/projection`].schemaVersion, 3)
  assert.deepEqual(d[`users/alice/careerInstances/${id}/planning/projection`].scenario, projection('cat', version).scenario)
})
for (const stop of ['INVENTORY', 'FREEZE', 'REREAD', 'COPY', 'VALIDATE']) test(`resume after ${stop}`, async () => {
  const { store, m } = make(full())
  for (const phase of ['INVENTORY', 'FREEZE', 'REREAD', 'COPY', 'VALIDATE']) { await m.step('alice', phase); if (phase === stop) break }
  const before = store.snapshot()['migrationManifests/alice'].assignments
  assert.equal((await migrator(store, { catalogIds: ['cat', 'other'] }).run('alice')).phase, 'complete')
  if (before.cat) assert.deepEqual(store.snapshot()['migrationManifests/alice'].assignments, before)
})
test('resume during multi-catalog copy uses persisted IDs', async () => {
  const { store, m } = make({ ...full(), 'users/alice/careers/other': progress() })
  for (const phase of ['INVENTORY', 'FREEZE', 'REREAD', 'COPY']) await m.step('alice', phase)
  assert.equal(store.snapshot()['migrationManifests/alice'].copied.length, 1)
  assert.equal((await migrator(store, { catalogIds: ['cat', 'other'] }).run('alice')).phase, 'complete')
})
for (const stage of ['INVENTORY', 'FREEZE']) test(`reread captures changes after ${stage}`, async () => {
  const { store, m } = make(full()); await m.step('alice', 'INVENTORY')
  if (stage === 'FREEZE') await m.step('alice', 'FREEZE')
  store.mutate('users/alice/careers/cat', { ...progress(), statusMap: { X: 'Aprobada' } })
  assert.equal((await m.run('alice')).phase, 'complete')
  const d = store.snapshot(), id = d['migrationManifests/alice'].assignments.cat.instanceId
  assert.deepEqual(d[`users/alice/careerInstances/${id}/academic/progress`].statusMap, { X: 'Aprobada' })
})
test('source changed after reread blocks cutover', async () => {
  const { store, m } = make(full()); for (const p of ['INVENTORY', 'FREEZE', 'REREAD']) await m.step('alice', p)
  store.mutate('users/alice/careers/cat', { ...progress(), statusMap: {} })
  const r = await m.run('alice'); assert.equal(r.phase, 'blocked'); assert.ok(r.conflicts.includes('LEGACY_SOURCE_CONFLICT'))
})
test('post-copy tamper blocks validation without repair', async () => {
  const { store, m } = make(full()); for (const p of ['INVENTORY', 'FREEZE', 'REREAD', 'COPY']) await m.step('alice', p)
  const id = store.snapshot()['migrationManifests/alice'].assignments.cat.instanceId
  const path = `users/alice/careerInstances/${id}/academic/progress`; store.mutate(path, { tampered: true })
  assert.equal((await m.run('alice')).phase, 'blocked'); assert.deepEqual(store.snapshot()[path], { tampered: true })
})
for (const archived of [false, true]) test(`existing coherent pair reused archived=${archived}`, async () => {
  const { store, m } = make({ ...full(), ...pair('alice', 'cat', 'stable', archived), ...consent() }); await m.run('alice')
  const d = store.snapshot(); assert.equal(d['migrationManifests/alice'].assignments.cat.instanceId, 'stable')
  assert.equal(d['users/alice'].activeCareerInstanceId, archived ? null : 'stable')
  assert.deepEqual(d['users/alice/careerInstances/stable'], pair('alice', 'cat', 'stable', archived)['users/alice/careerInstances/stable'])
  if (archived) assert.equal(d['migrationManifests/alice'].intents.sharing.eligibleToImport, false)
})
for (const patch of [
  { 'users/alice/catalogMemberships/cat': { schemaVersion: 1, careerInstanceId: 'absent' } },
  { 'users/alice/careerInstances/opaque': pair()['users/alice/careerInstances/opaque'] },
  { ...pair(), 'users/alice/careerInstances/opaque': { ...pair()['users/alice/careerInstances/opaque'], catalogId: 'other' } },
]) test('inconsistent existing identity blocks without repair', async () => {
  const { m } = make({ ...full(), ...patch }); assert.equal((await m.run('alice')).phase, 'blocked')
})
test('manifest/index contradiction never chooses newer', async () => {
  const { store, m } = make(full()); for (const p of ['INVENTORY', 'FREEZE', 'REREAD']) await m.step('alice', p)
  for (const [p, v] of Object.entries(pair())) store.mutate(p, v)
  assert.ok((await m.run('alice')).conflicts.includes('MANIFEST_INSTANCE_CONFLICT'))
})
test('concurrent inventory has one winner and reusable manifest', async () => {
  const { store, m } = make(full()); const r = await Promise.allSettled([m.step('alice', 'INVENTORY'), m.step('alice', 'INVENTORY')])
  assert.equal(r.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal((await migrator(store, { catalogIds: ['cat', 'other'] }).run('alice')).phase, 'complete')
})
for (const docs of [{ 'users/alice/careers/missing': progress() }, { ...full(), 'users/alice/careerProjections/missing': projection('missing') }]) {
  test('unknown strong preserved and blocked', async () => { const { store, m } = make(docs)
    assert.ok((await m.run('alice')).conflicts.includes('UNKNOWN_CATALOG_REQUIRES_REVIEW'))
    for (const [p, v] of Object.entries(docs)) assert.deepEqual(store.snapshot()[p], v)
  })
}
for (const active of [null, 'missing', 'other']) test(`selection exact or null ${active}`, async () => {
  const { store, m } = make({ ...full(), 'users/alice': { activeCareerId: active } }); await m.run('alice')
  const d = store.snapshot(); assert.equal(d['users/alice'].activeCareerInstanceId,
    active === 'other' ? d['migrationManifests/alice'].assignments.other.instanceId : null)
})
test('joint bindings resolve existing only and preserve closed plan/subjects/invitations', async () => {
  const plan = { careerId: 'cat', ownerId: 'alice', memberIds: ['alice', 'bob', 'carol'], inviteeIds: ['bob', 'carol', 'dave'], closed: true }
  const { store, m } = make({ ...full(), ...pair('bob', 'cat', 'bobInstance', true), ...pair('carol', 'cat', 'carolInstance'),
    'jointPlans/p': plan, 'jointPlans/p/subjects/A': { proposedParticipantIds: ['alice', 'bob'] } })
  await m.run('alice'); const d = store.snapshot(), bindings = d['migrationManifests/alice'].intents.plans[0].bindings
  assert.deepEqual(bindings.map(b => b.bindingState), ['resolved', 'resolved', 'resolved', 'unresolved'])
  assert.deepEqual(d['jointPlans/p'], plan); assert.equal(d['users/dave/careerInstances'], undefined)
})
test('unknown plan catalog retained as unavailable, no invented trajectory', async () => {
  const { store, m } = make({ 'jointPlans/p': { careerId: 'missing', ownerId: 'alice' } }); await m.run('alice')
  const manifest = store.snapshot()['migrationManifests/alice']
  assert.deepEqual(manifest.assignments, {}); assert.equal(manifest.intents.plans[0].bindings[0].bindingState, 'catalog-unavailable')
})
test('dry run has no persistent effects', async () => { const { store, m } = make(full()), before = store.snapshot()
  await m.step('alice', 'INVENTORY', { dryRun: true }); assert.deepEqual(store.snapshot(), before) })
test('illegal control combination rejected', () => assert.throws(() => validateControl({ authority: 'instances', phase: 'pending' }, {}, 'alice')))
test('remote adapters and unsafe endpoints refused without network', () => {
  assert.throws(() => migrator({ environment: 'production' }, { catalogIds: [] }))
  for (const host of ['firestore.googleapis.com', 'localhost:8088', '127.0.0.1:8080', undefined]) {
    assert.throws(() => emulatorAdapter({ host, projectId: 'demo-correlativas-rules', environment: {} }))
  }
})
test('Firestore timestamp transport preserves nanoseconds', () => assert.deepEqual(decode(encode({ t: TIME, array: [null, 2, true] })), { t: TIME, array: [null, 2, true] }))

test('real registry: every current catalog can migrate without academic recalculation', async () => {
  const catalogs = require('./projection-catalogs.cjs')(), ids = catalogs.map(c => c.id)
  const docs = Object.fromEntries(ids.map(id => [`users/alice/careers/${id}`, progress()]))
  const store = fixture(docs), m = migrator(store, { catalogIds: ids })
  assert.equal((await m.run('alice')).phase, 'complete')
  assert.equal(Object.keys(store.snapshot()['migrationManifests/alice'].assignments).length, ids.length)
})
test('registry change cannot silently alter resumed inventory', async () => {
  const { store, m } = make(full()); await m.step('alice', 'INVENTORY')
  assert.equal((await migrator(store, { catalogIds: ['cat'] }).run('alice')).phase, 'blocked')
})
test('fake manifest assignment cannot manufacture a weak-only trajectory', async () => {
  const { store, m } = make(full()); for (const p of ['INVENTORY', 'FREEZE', 'REREAD']) await m.step('alice', p)
  const manifest = store.snapshot()['migrationManifests/alice']
  manifest.assignments.other = { ...manifest.assignments.cat, instanceId: 'injected' }
  store.mutate('migrationManifests/alice', manifest)
  assert.equal((await m.run('alice')).phase, 'blocked')
})
test('completed rerun preserves later authoritative academic edits', async () => {
  const { store, m } = make(full()); await m.run('alice')
  const id = store.snapshot()['migrationManifests/alice'].assignments.cat.instanceId
  const path = `users/alice/careerInstances/${id}/academic/progress`
  store.mutate(path, { schemaVersion: 1, statusMap: { newFact: 'Aprobada' }, revision: 2, updatedAt: TIME })
  const before = store.snapshot(); await m.run('alice'); assert.deepEqual(store.snapshot(), before)
})
test('model freeze/recovery never allows legacy writes for frozen or instances', () => {
  const { legacyWritesAllowed } = require('../scripts/multicareer-migration.cjs')
  assert.equal(legacyWritesAllowed(null), true)
  assert.equal(legacyWritesAllowed({ authority: 'legacy', phase: 'pending' }), true)
  for (const authority of ['frozen', 'instances']) for (const phase of ['copying', 'validated', 'complete', 'blocked']) {
    assert.equal(legacyWritesAllowed({ authority, phase }), false)
  }
})

test('transport guard rejects real project/credentials and never calls fetch', () => {
  const environment = { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088' }
  for (const options of [
    { projectId: 'real-project', environment },
    { projectId: 'demo-correlativas-rules', environment: {} },
    ...['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN'].map(key => ({ projectId: 'demo-correlativas-rules', environment: { ...environment, [key]: 'forbidden-placeholder' } })),
  ]) assert.throws(() => emulatorAdapter({ host: '127.0.0.1:8088', ...options }), /UNSAFE_MIGRATION_ENVIRONMENT/)
})
test('transport uses only fixed loopback, rejects redirects and uses server time (mock HTTP)', async () => {
  const saved = global.fetch, calls = []
  global.fetch = async (url, options) => {
    calls.push({ url, options }); const body = JSON.parse(options.body)
    const payload = url.endsWith(':beginTransaction') ? { transaction: 'fixture-transaction' }
      : url.endsWith(':batchGet') ? body.documents.map(missing => ({ missing }))
        : url.endsWith(':runQuery') ? [{ readTime: '2023-11-14T22:13:20.123456Z' }] : {}
    return { ok: true, json: async () => payload }
  }
  try {
    const adapter = emulatorAdapter({ host: '127.0.0.1:8088', projectId: 'demo-correlativas-rules', environment: { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088' } })
    await adapter.transaction(async (_, now) => { assert.deepEqual(now, { seconds: TIME.seconds, nanoseconds: 123456000 }); return { writes: {}, result: true } }, 'alice')
    assert.ok(calls.length > 5)
    for (const { url, options } of calls) {
      assert.equal(new URL(url).origin, 'http://127.0.0.1:8088'); assert.equal(options.redirect, 'error')
      assert.ok(url.includes('projects/demo-correlativas-rules/databases/(default)/documents'))
    }
  } finally { global.fetch = saved }
})
test('incomplete exact lookup aborts before writing (mock HTTP)', async () => {
  const saved = global.fetch, calls = []
  global.fetch = async url => { calls.push(url); return { ok: true, json: async () => url.endsWith(':beginTransaction') ? { transaction: 'fixture' } : [] } }
  try {
    const adapter = emulatorAdapter({ host: '127.0.0.1:8088', projectId: 'demo-correlativas-rules', environment: { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088' } })
    await assert.rejects(adapter.transaction(async () => { throw Error('must not run') }, 'alice'), /INCOMPLETE_EMULATOR_RESPONSE/)
    assert.ok(!calls.some(url => url.endsWith(':commit')))
  } finally { global.fetch = saved }
})
for (const role of ['member', 'invitee']) test(`plan ${role} alone stays weak and unresolved`, async () => {
  const plan = { ownerId: 'bob', careerId: 'cat', memberIds: role === 'member' ? ['bob', 'alice'] : ['bob'], inviteeIds: ['alice'] }
  const { store, m } = make({ 'jointPlans/p': plan }); await m.run('alice')
  const manifest = store.snapshot()['migrationManifests/alice']
  assert.deepEqual(manifest.assignments, {}); assert.ok(manifest.intents.plans[0].bindings.every(b => b.bindingState === 'unresolved'))
})
test('inconsistent projection blocks and preserves legacy, with no partial target', async () => {
  const legacy = { ...full(), 'users/alice/careerProjections/cat': { ...projection(), schemaVersion: 99 } }
  const { store, m } = make(legacy); assert.equal((await m.run('alice')).phase, 'blocked')
  assert.ok(!Object.keys(store.snapshot()).some(p => p.includes('/careerInstances/')))
  for (const [p, d] of Object.entries(legacy)) assert.deepEqual(store.snapshot()[p], d)
})
