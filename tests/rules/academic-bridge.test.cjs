const { before, after, beforeEach, test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const sdk = require('firebase/firestore')
const { doc, setDoc, updateDoc, deleteDoc, getDocFromServer, writeBatch, serverTimestamp } = sdk
const { initialize, baseline, seed, claims, TIME, CAREER, friendship, plan, subject, sharing, snapshot, assertSucceeds: allow, assertFails: deny } = require('./helpers.cjs')
const { maintenanceRules } = require('../../scripts/activity-rollout.cjs')
let env
before(async () => { env = await initialize() }, { timeout: 30000 })
after(async () => { if (env) await env.cleanup() })
beforeEach(async () => { await baseline(env) })
const db = (uid = 'german') => uid ? env.authenticatedContext(uid, claims(uid)).firestore() : env.unauthenticatedContext().firestore()
const control = (uid, authority = 'legacy', phase = authority === 'instances' ? 'complete' : authority === 'frozen' ? 'copying' : 'pending') =>
  ({ schemaVersion: 1, generation: 'multicareer-v1', authority, phase, origin: 'legacy', manifestId: uid, updatedAt: TIME })
const instance = { schemaVersion: 1, catalogId: CAREER, lifecycle: 'active', createdAt: TIME, updatedAt: TIME, archivedAt: null }
const progress = () => ({ schemaVersion: 1, statusMap: { A: 'Aprobada', B: 'Regularizada', C: 'Cursando', D: 'Pendiente' }, revision: 1, updatedAt: serverTimestamp() })
const projection = () => ({ schemaVersion: 3, revisionToken: 'revision_token_12345', updatedAt: serverTimestamp(), scenario: {
  startPeriod: { year: 2027, term: '1C' }, initialCapacity: 4, maxPeriods: 20, capacities: [], manualPeriods: [], finalEvents: ['A@2028:1C'] } })
async function setup(authority = 'instances') {
  await seed(env, { 'migrationUsers/german': control('german', authority),
    'users/german': { schemaVersion: 2, activeCareerId: CAREER, activeCareerInstanceId: null, updatedAt: TIME },
    'users/german/careerInstances/opaque': instance,
    [`users/german/catalogMemberships/${CAREER}`]: { schemaVersion: 1, careerInstanceId: 'opaque' } })
}
const target = child => `users/german/careerInstances/opaque/${child}`
async function maximum(reverse, controls = true) {
  const ids = ['juan', 'pedro', 'maria', 'outsider'], entries = {}
  for (const uid of ids) entries[`friendships/${reverse ? uid + ':german' : 'german:' + uid}`] = friendship(reverse ? uid : 'german', reverse ? 'german' : uid)
  if (controls) for (const uid of ['german', ...ids]) entries[`migrationUsers/${uid}`] = control(uid)
  await seed(env, entries)
  const client = db(), batch = writeBatch(client)
  batch.set(doc(client, 'jointPlans/max'), { ...plan('german', ids, ['german']), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  for (const uid of ids) batch.set(doc(client, `users/${uid}/activityInbox/jp_max`), { schemaVersion: 1, type: 'JOINT_PLAN_INVITATION', actorUid: 'german',
    target: { kind: 'jointPlan', id: 'max' }, createdAt: serverTimestamp(), readAt: null })
  return batch
}
for (const reverse of [false, true]) test(`authority present MAX fan-out orientation ${reverse}`, async () => { await allow((await maximum(reverse)).commit()) })
for (const authority of ['frozen', 'instances']) for (const uid of ['german', 'outsider']) {
  test(`MAX atomic denial: ${uid}/${authority}`, async () => {
    const batch = await maximum(true)
    await seed(env, { [`migrationUsers/${uid}`]: control(uid, authority) })
    await deny(batch.commit())
    await env.withSecurityRulesDisabled(async c => assert.equal((await getDocFromServer(doc(c.firestore(), 'jointPlans/max'))).exists(), false))
  })
}
for (const authority of ['frozen', 'instances']) test(`old client academic writes and selection closed: ${authority}`, async () => {
  await setup(authority)
  const client = db()
  await deny(setDoc(doc(client, `users/german/careers/${CAREER}`), { statusMap: { A: 'Pendiente' } }))
  await deny(deleteDoc(doc(client, `users/german/careers/${CAREER}`)))
  await deny(updateDoc(doc(client, 'users/german'), { activeCareerId: 'other' }))
  await deny(deleteDoc(doc(client, 'users/german')))
  const legacy = { ...projection(), schemaVersion: 2, careerId: CAREER }
  await deny(setDoc(doc(client, `users/german/careerProjections/${CAREER}`), legacy))
  await deny(deleteDoc(doc(client, `users/german/careerProjections/${CAREER}`)))
})
for (const patch of [{}, { authority: 'unknown' }, { schemaVersion: 2 }, { generation: 'other' }, { origin: 'other' }, { phase: 'copying' }, { phase: 'blocked' }]) {
  test(`corrupt/blocked control denies writes ${JSON.stringify(patch)}`, async () => {
    await seed(env, { 'migrationUsers/german': Object.keys(patch).length ? { ...control('german'), ...patch } : {} })
    await deny(updateDoc(doc(db(), `users/german/careers/${CAREER}`), { statusMap: {} }))
  })
}
test('instance progress requires owner/active/revision and preserves values; selection irrelevant', async () => {
  await setup(); const client = db(), ref = doc(client, target('academic/progress'))
  await allow(setDoc(ref, progress()))
  assert.deepEqual((await getDocFromServer(ref)).data().statusMap, progress().statusMap)
  await deny(updateDoc(ref, { revision: 1, updatedAt: serverTimestamp() }))
  await allow(updateDoc(ref, { revision: 2, updatedAt: serverTimestamp() }))
  await deny(updateDoc(ref, { revision: 3, statusMap: { A: 'invented' }, updatedAt: serverTimestamp() }))
  await deny(deleteDoc(ref))
  for (const uid of ['juan', null]) { await deny(getDocFromServer(doc(db(uid), ref.path))); await deny(setDoc(doc(db(uid), ref.path), progress())) }
  await seed(env, { 'users/german/careerInstances/opaque': { ...instance, lifecycle: 'archived', archivedAt: TIME } })
  await allow(getDocFromServer(ref)); await deny(updateDoc(ref, { revision: 3, updatedAt: serverTimestamp() }))
})
test('instance projection strict envelope, revision and reset, frozen and archived denied', async () => {
  await setup(); const client = db(), ref = doc(client, target('planning/projection'))
  await allow(setDoc(ref, projection()))
  await deny(updateDoc(ref, { scenario: projection().scenario, updatedAt: serverTimestamp() }))
  await allow(updateDoc(ref, { revisionToken: 'revision_token_67890', updatedAt: serverTimestamp() }))
  await deny(updateDoc(ref, { careerId: CAREER, revisionToken: 'revision_token_99999', updatedAt: serverTimestamp() }))
  await seed(env, { 'migrationUsers/german': control('german', 'frozen') })
  await deny(deleteDoc(ref)); await deny(getDocFromServer(ref))
  await seed(env, { 'migrationUsers/german': control('german', 'instances') })
  await allow(deleteDoc(ref))
})
test('selection own active or null; legacy ID cannot authorize instance writes', async () => {
  await setup(); const client = db(), ref = doc(client, 'users/german')
  await allow(updateDoc(ref, { activeCareerInstanceId: 'opaque', updatedAt: serverTimestamp() }))
  await allow(updateDoc(ref, { activeCareerInstanceId: null, updatedAt: serverTimestamp() }))
  await deny(updateDoc(ref, { activeCareerInstanceId: 'missing', updatedAt: serverTimestamp() }))
  await deny(updateDoc(ref, { activeCareerId: CAREER, activeCareerInstanceId: 'opaque', extra: true, updatedAt: serverTimestamp() }))
  await seed(env, { 'users/german/careerInstances/opaque': { ...instance, lifecycle: 'archived', archivedAt: TIME } })
  await deny(updateDoc(ref, { activeCareerInstanceId: 'opaque', updatedAt: serverTimestamp() }))
})
for (const authority of ['frozen', 'instances']) test(`social academic routes closed, history remains: ${authority}`, async () => {
  await seed(env, { 'friendships/german:juan': friendship('german', 'juan'), 'jointPlans/p': plan(), 'jointPlans/p/subjects/A': subject(),
    'planningSharing/juan': sharing(), [`planningSnapshots/juan/careers/${CAREER}`]: snapshot(), 'migrationUsers/juan': control('juan', authority) })
  await deny(getDocFromServer(doc(db(), `planningSnapshots/juan/careers/${CAREER}`)))
  await deny(updateDoc(doc(db('juan'), 'planningSharing/juan'), { enabled: false, updatedAt: serverTimestamp() }))
  await deny(updateDoc(doc(db(), 'jointPlans/p'), { name: 'mutation', updatedAt: serverTimestamp() }))
  await deny(deleteDoc(doc(db(), 'jointPlans/p/subjects/A')))
  await allow(getDocFromServer(doc(db('juan'), 'friendships/german:juan')))
  await allow(getDocFromServer(doc(db('juan'), 'jointPlans/p')))
  await allow(getDocFromServer(doc(db('juan'), 'jointPlans/p/subjects/A')))
})
test('maintenance/recovery retains authority barrier and instance owner access', async () => {
  await env.cleanup(); env = await initialize(maintenanceRules(fs.readFileSync('firestore.rules', 'utf8')))
  try {
    await baseline(env); await setup()
    await deny(updateDoc(doc(db(), `users/german/careers/${CAREER}`), { statusMap: {} }))
    await allow(setDoc(doc(db(), target('academic/progress')), progress()))
  } finally { await env.cleanup(); env = await initialize() }
})

const { migrator } = require('../../scripts/multicareer-migration.cjs')
const { emulatorAdapter, HOST, PROJECT } = require('../../scripts/multicareer-emulator.cjs')
const { academicBridgeRepository } = require('../academic-bridge-harness.cjs')(sdk)
async function until(predicate) {
  const end = Date.now() + 10000
  while (!predicate()) { if (Date.now() > end) throw new Error('Bridge listener did not reach expected state'); await new Promise(resolve => setTimeout(resolve, 20)) }
}
test('real bridge and migrator: live legacy/frozen/instances, exact copy, CAS, no dual writes', async () => {
  const client = db(), auth = { currentUser: { uid: 'german' } }
  const repository = academicBridgeRepository({ db: client, auth }, 'german')
  const seen = [], errors = []
  const stop = repository.subscribeContext(context => seen.push(context), error => errors.push(error))
  const migrate = () => migrator(emulatorAdapter({ host: HOST, projectId: PROJECT }), { catalogIds: [CAREER] })
  try {
    await until(() => seen.at(-1)?.authority === 'legacy')
    const legacy = doc(client, `users/german/careers/${CAREER}`)
    const before = (await getDocFromServer(legacy)).data().statusMap
    await migrate().step('german', 'INVENTORY'); await migrate().step('german', 'FREEZE')
    await until(() => seen.at(-1)?.authority === 'frozen')
    assert.equal(seen.at(-1).capabilities.academicWrite, false)
    await deny(updateDoc(legacy, { statusMap: { stolen: 'Aprobada' } }))
    assert.equal((await migrate().run('german')).phase, 'complete')
    await until(() => seen.at(-1)?.authority === 'instances' && seen.at(-1)?.activeCareerInstanceId)
    const context = seen.at(-1), scope = { uid: 'german', model: 'instances', id: context.activeCareerInstanceId, catalogId: CAREER }
    const loaded = await repository.loadProgress(scope)
    assert.deepEqual(loaded.statusMap, before); assert.equal(loaded.revision, 1)
    await deny(updateDoc(legacy, { statusMap: {} }))
    const changed = { ...before, B: 'Regularizada' }
    assert.equal(await repository.saveProgress(scope, changed, 1), 2)
    await assert.rejects(repository.saveProgress(scope, changed, 1), /ACADEMIC_PROGRESS_CONFLICT/)
    assert.deepEqual((await getDocFromServer(legacy)).data().statusMap, before)
    const projectionRepo = repository.projection(scope)
    assert.equal(await projectionRepo.load(), null)
    const scenario = { ...projection().scenario, finalEvents: [] }
    const token = await projectionRepo.save(scenario, null)
    assert.deepEqual((await projectionRepo.load()).scenario, scenario)
    await assert.rejects(projectionRepo.save(scenario, null), /PROJECTION_CONFLICT/)
    assert.equal((await getDocFromServer(doc(client, `users/german/careerProjections/${CAREER}`))).exists(), false)
    await projectionRepo.reset(token); assert.equal(await projectionRepo.load(), null)
    await repository.selectInstance(null)
    await until(() => seen.at(-1)?.activeCareerInstanceId === null && seen.at(-1)?.capabilities.select)
    assert.equal((await repository.loadProgress(scope)).revision, 2) // navigation grants no authority
    await repository.selectInstance(scope.id)
    auth.currentUser = { uid: 'other' }
    await assert.rejects(repository.loadProgress(scope), /ACADEMIC_SESSION_CHANGED/)
    assert.equal(errors.length, 0)
  } finally { stop() }
})

test('real projection repository refuses archived, foreign, frozen and stale sessions', async () => {
  await setup()
  const client = db(), auth = { currentUser: { uid: 'german' } }, repo = academicBridgeRepository({ db: client, auth }, 'german')
  const scope = { uid: 'german', model: 'instances', id: 'opaque', catalogId: CAREER }, scenario = { ...projection().scenario, finalEvents: [] }
  assert.throws(() => repo.projection({ ...scope, uid: 'juan' }), /INVALID_ACADEMIC_SCOPE/)
  await seed(env, { 'users/german/careerInstances/opaque': { ...instance, lifecycle: 'archived', archivedAt: TIME } })
  await assert.rejects(repo.projection(scope).save(scenario, null), /ACADEMIC_INSTANCE_UNAVAILABLE/)
  await seed(env, { 'users/german/careerInstances/opaque': instance, 'migrationUsers/german': control('german', 'frozen') })
  await assert.rejects(repo.projection(scope).save(scenario, null), /ACADEMIC_AUTHORITY_CHANGED/)
})
