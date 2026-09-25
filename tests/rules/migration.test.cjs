const { before, after, beforeEach, test } = require('node:test')
const assert = require('node:assert/strict')
const { doc, collection, setDoc, updateDoc, deleteDoc, getDocFromServer, getDocsFromServer, Timestamp } = require('firebase/firestore')
const { initialize, seed, claims, assertFails: deny, assertSucceeds: allow } = require('./helpers.cjs')
const { migrator } = require('../../scripts/multicareer-migration.cjs')
const { emulatorAdapter, PROJECT, HOST } = require('../../scripts/multicareer-emulator.cjs')
const { TIME, progress, projection, pair } = require('../migration-fixtures.cjs')
let env
before(async () => { env = await initialize() }, { timeout: 30000 })
after(async () => { if (env) await env.cleanup() })
beforeEach(async () => { await env.clearFirestore() })
const m = () => migrator(emulatorAdapter({ host: HOST, projectId: PROJECT }), { catalogIds: ['cat', 'other'] })
const data = () => ({ 'users/alice': { activeCareerId: 'cat' }, 'users/alice/careers/cat': progress(), 'users/alice/careerProjections/cat': projection() })
function sdkValues(value) {
  if (value && Object.keys(value).sort().join(',') === 'nanoseconds,seconds') return new Timestamp(value.seconds, value.nanoseconds)
  if (Array.isArray(value)) return value.map(sdkValues)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sdkValues(v)]))
  return value
}
const seedData = value => seed(env, sdkValues(value))
async function read(path) {
  let result
  await env.withSecurityRulesDisabled(async context => { result = (await getDocFromServer(doc(context.firestore(), path))).data() })
  return result
}
test('migration real transport: complete copy, preserved nanoseconds and idempotent rerun', async () => {
  await seedData(data())
  await seed(env, { 'users/alice': { activeCareerId: 'cat', retainedMap: { seconds: 4, nanoseconds: 8 } } })
  assert.equal((await m().run('alice')).phase, 'complete')
  const manifest = await read('migrationManifests/alice'), id = manifest.assignments.cat.instanceId
  const target = await read(`users/alice/careerInstances/${id}/academic/progress`)
  assert.deepEqual(target.statusMap, progress().statusMap)
  // Firestore stores timestamps at microsecond precision; compare the stored source.
  const old = await read('users/alice/careers/cat'); assert.deepEqual(target.updatedAt, old.updatedAt)
  assert.deepEqual((await read('users/alice')).retainedMap, { seconds: 4, nanoseconds: 8 })
  await m().run('alice'); assert.deepEqual(await read('migrationManifests/alice'), manifest)
})
test('migration resume in fresh runner during copy, no missing parent assumption', async () => {
  await seedData({ 'users/alice/careers/cat': progress(), 'users/alice/careerProjections/other': projection('other') })
  for (const phase of ['INVENTORY', 'FREEZE', 'REREAD', 'COPY']) await m().step('alice', phase)
  const before = await read('migrationManifests/alice'); assert.equal(before.copied.length, 1)
  assert.equal((await m().run('alice')).phase, 'complete')
  assert.deepEqual((await read('migrationManifests/alice')).assignments, before.assignments)
  assert.equal((await read('users/alice')).activeCareerInstanceId, null)
})
test('migration frozen is protocol only: legacy writes still allowed and reread catches them', async () => {
  await seedData(data()); await m().step('alice', 'INVENTORY'); await m().step('alice', 'FREEZE')
  const db = env.authenticatedContext('alice', claims('alice')).firestore()
  await allow(updateDoc(doc(db, 'users/alice/careers/cat'), { statusMap: { Z: 'Aprobada' } }))
  await m().step('alice', 'REREAD')
  await allow(updateDoc(doc(db, 'users/alice/careers/cat'), { statusMap: { Z: 'Regularizada' } }))
  const r = await m().step('alice', 'COPY'); assert.equal(r.phase, 'blocked'); assert.ok(r.conflicts.includes('LEGACY_SOURCE_CONFLICT'))
  assert.equal((await read('migrationUsers/alice')).authority, 'frozen')
})
test('migration concurrent starts serialize or fail explicitly, never duplicate identities', async () => {
  await seedData(data())
  const results = await Promise.allSettled([m().step('alice', 'INVENTORY'), m().step('alice', 'INVENTORY')])
  // REST has no SDK retry loop: emulator lock contention may abort both attempts.
  // Every failure must be an explicit conflict; a subsequent run must recover.
  for (const r of results.filter(r => r.status === 'rejected')) assert.equal(r.reason.code, 'MIGRATION_CONCURRENT_CONFLICT')
  assert.equal((await m().run('alice')).phase, 'complete')
  assert.equal(Object.keys((await read('migrationManifests/alice')).assignments).length, 1)
})
for (const uid of ['alice', 'bob', null]) test(`migration admin mutations and manifest access denied: ${uid}`, async () => {
  await seedData(data()); await m().step('alice', 'INVENTORY')
  const db = uid ? env.authenticatedContext(uid, claims(uid)).firestore() : env.unauthenticatedContext().firestore()
  for (const path of ['migrationUsers/alice', 'migrationManifests/alice']) {
    await deny(setDoc(doc(db, path), { authority: 'instances', origin: 'new', phase: 'complete' }))
    await deny(updateDoc(doc(db, path), { authority: 'instances' }))
    await deny(deleteDoc(doc(db, path)))
    await deny(setDoc(doc(db, path.replace('alice', 'new-user')), { authority: 'instances' }))
    await deny(getDocsFromServer(collection(db, path.split('/')[0])))
  }
  await deny(getDocFromServer(doc(db, 'migrationManifests/alice')))
  await (uid === 'alice' ? allow : deny)(getDocFromServer(doc(db, 'migrationUsers/alice')))
})
test('migration copied academic paths remain private/default-deny until bridge', async () => {
  await seedData(data()); await m().run('alice')
  const id = (await read('migrationManifests/alice')).assignments.cat.instanceId
  for (const uid of ['alice', 'bob']) {
    const db = env.authenticatedContext(uid, claims(uid)).firestore()
    for (const child of ['academic/progress', 'planning/projection']) {
      const ref = doc(db, `users/alice/careerInstances/${id}/${child}`)
      await deny(getDocFromServer(ref)); await deny(setDoc(ref, { bypass: true }))
    }
  }
})
test('post-copy tamper prevents local cutover without deleting or overwriting legacy', async () => {
  await seedData(data()); for (const phase of ['INVENTORY', 'FREEZE', 'REREAD', 'COPY', 'VALIDATE']) await m().step('alice', phase)
  const id = (await read('migrationManifests/alice')).assignments.cat.instanceId
  await seedData({ [`users/alice/careerInstances/${id}/academic/progress`]: { tampered: true } })
  assert.equal((await m().step('alice', 'CUTOVER')).phase, 'blocked')
  assert.equal((await read('migrationUsers/alice')).authority, 'frozen')
  assert.deepEqual((await read('users/alice/careers/cat')).statusMap, progress().statusMap)
})
test('persisted manifest/index conflict blocks without choosing either ID', async () => {
  await seedData(data()); for (const phase of ['INVENTORY', 'FREEZE', 'REREAD']) await m().step('alice', phase)
  const assigned = (await read('migrationManifests/alice')).assignments.cat.instanceId
  await seedData(pair('alice', 'cat', 'otherIdentity'))
  const result = await m().run('alice'); assert.ok(result.conflicts.includes('MANIFEST_INSTANCE_CONFLICT'))
  assert.equal((await read('users/alice/catalogMemberships/cat')).careerInstanceId, 'otherIdentity')
  assert.equal(await read(`users/alice/careerInstances/${assigned}`), undefined)
})
test('target conflict commits no partial index/metadata/projection', async () => {
  await seedData(data()); for (const phase of ['INVENTORY', 'FREEZE', 'REREAD']) await m().step('alice', phase)
  const id = (await read('migrationManifests/alice')).assignments.cat.instanceId
  await seedData({ [`users/alice/careerInstances/${id}/academic/progress`]: { conflict: true } })
  assert.equal((await m().step('alice', 'COPY')).phase, 'blocked')
  assert.equal(await read(`users/alice/careerInstances/${id}`), undefined)
  assert.equal(await read('users/alice/catalogMemberships/cat'), undefined)
  assert.equal(await read(`users/alice/careerInstances/${id}/planning/projection`), undefined)
})
test('unknown strong catalog remains legacy, blocks all cutover', async () => {
  await seedData({ ...data(), 'users/alice/careers/missing': progress() })
  const result = await m().run('alice'); assert.ok(result.conflicts.includes('UNKNOWN_CATALOG_REQUIRES_REVIEW'))
  assert.deepEqual((await read('users/alice/careers/missing')).statusMap, progress().statusMap)
  assert.equal((await read('migrationUsers/alice')).authority, 'frozen')
})
test('emulator dry inventory does not persist controls or manifests', async () => {
  await seedData(data()); await m().step('alice', 'INVENTORY', { dryRun: true })
  assert.equal(await read('migrationUsers/alice'), undefined); assert.equal(await read('migrationManifests/alice'), undefined)
})
test('source map resembling timestamp is rejected, never converted into a valid date', async () => {
  await seed(env, { 'users/alice/careers/cat': { statusMap: { A: 'Aprobada' }, updatedAt: { seconds: 1700000000, nanoseconds: 0 } } })
  await assert.rejects(m().run('alice'), /LEGACY_SOURCE_CONFLICT/)
  assert.deepEqual((await read('users/alice/careers/cat')).updatedAt, { seconds: 1700000000, nanoseconds: 0 })
  assert.equal(await read('migrationUsers/alice'), undefined)
})
