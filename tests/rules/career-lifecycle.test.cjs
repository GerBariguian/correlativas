const { before, after, beforeEach, test } = require('node:test')
const assert = require('node:assert/strict')
const sdk = require('firebase/firestore')
const { doc, setDoc, updateDoc, getDocFromServer, getDocsFromServer, collection, writeBatch, serverTimestamp } = sdk
const { initialize, seed, claims, TIME, assertFails: deny } = require('./helpers.cjs')
const load = require('../academic-bridge-harness.cjs')
const catalogs = require('../projection-catalogs.cjs')()
let env
before(async () => { env = await initialize() }, { timeout: 30000 })
after(async () => { if (env) await env.cleanup() })
beforeEach(async () => { await env.clearFirestore() })
const db = (uid = 'alice') => uid ? env.authenticatedContext(uid, claims(uid)).firestore() : env.unauthenticatedContext().firestore()
const cp = 'migrationUsers/alice', up = 'users/alice'
const ip = id => `${up}/careerInstances/${id}`
const control = (origin = 'legacy', patch = {}) => ({ schemaVersion: 1, generation: 'multicareer-v1', authority: 'instances', phase: 'complete', origin, manifestId: 'alice', updatedAt: TIME, ...patch })
async function setup(origin = 'legacy', patch = {}) {
  await seed(env, { [cp]: control(origin, patch), [up]: { schemaVersion: 2, activeCareerInstanceId: null, updatedAt: TIME } })
}
const repo = (client, uid = 'alice') => load(sdk).careerLifecycleRepository({ db: client, auth: { currentUser: { uid } } }, uid, catalogs)
const read = async (client, path) => (await getDocFromServer(doc(client, path))).data()
const archivePatch = () => ({ lifecycle: 'archived', archivedAt: serverTimestamp(), updatedAt: serverTimestamp() })
const map = { 'A': 'Aprobada', 'B': 'Regularizada', 'C': 'Cursando', 'D': 'Pendiente' }

test('live Bridge follows zero/add/select/archive/restore without refresh or automatic selection', async () => {
  await setup('new'); const c = db(), auth = { currentUser: { uid: 'alice' } }, api = load(sdk)
  let context, failure
  const stop = api.academicBridgeRepository({ db: c, auth }, 'alice').subscribeContext(value => { context = value }, error => { failure = error })
  const until = async predicate => {
    const end = Date.now() + 5000
    while (!failure && !predicate() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 20))
    if (failure) throw failure
    assert.ok(predicate(), 'Bridge did not reach expected lifecycle context')
  }
  try {
    const service = repo(c)
    await until(() => context?.capabilities.academicWrite && context.instances.length === 0)
    assert.equal(context.activeCareerInstanceId, null)
    const id = await service.add(catalogs[0].id)
    await until(() => context?.instances.length === 1)
    assert.equal(context.activeCareerInstanceId, null)
    await service.select(id); await until(() => context?.activeCareerInstanceId === id)
    await service.archive(id)
    await until(() => context?.activeCareerInstanceId === null && context.instances[0]?.lifecycle === 'archived')
    await service.restore(id)
    await until(() => context?.instances[0]?.lifecycle === 'active')
    assert.equal(context.activeCareerInstanceId, null)
  } finally { stop() }
})

for (const origin of ['legacy', 'new']) test(`legitimate instances/${origin} zero-career adds without bootstrap, selection or fictitious progress`, async () => {
  await setup(origin); const c = db(), service = repo(c), before = await read(c, cp)
  assert.equal((await getDocsFromServer(collection(c, `${up}/careerInstances`))).size, 0)
  const id = await service.add(catalogs[0].id)
  assert.notEqual(id, catalogs[0].id)
  assert.equal((await read(c, up)).activeCareerInstanceId, null)
  assert.equal(await read(c, `${ip(id)}/academic/progress`), undefined)
  assert.equal(await read(c, `${ip(id)}/planning/projection`), undefined)
  assert.deepEqual(await read(c, cp), before)
})
test('add all registry catalogs across universities; uniqueness includes archived instances', async () => {
  await setup(); const c = db(), service = repo(c), ids = []
  for (const catalog of catalogs) ids.push(await service.add(catalog.id))
  assert.equal(new Set(ids).size, catalogs.length)
  await service.archive(ids[0])
  await assert.rejects(service.add(catalogs[0].id), { code: 'DUPLICATE_CATALOG_INSTANCE' })
  await assert.rejects(service.add('unknown-catalog'), { code: 'INVALID_INPUT' })
  assert.equal((await getDocsFromServer(collection(c, `${up}/careerInstances`))).size, catalogs.length)
})
test('simultaneous adds have exactly one catalog identity and explicit loser', async () => {
  await setup(); const c = db()
  const results = await Promise.allSettled([repo(c).add(catalogs[0].id), repo(db()).add(catalogs[0].id)])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'DUPLICATE_CATALOG_INSTANCE')
  assert.equal((await getDocsFromServer(collection(c, `${up}/careerInstances`))).size, 1)
  assert.equal((await getDocsFromServer(collection(c, `${up}/catalogMemberships`))).size, 1)
})
test('archive selected atomically clears selection and preserves identity, data, control and history; restore is idempotent', async () => {
  await setup(); const c = db(), service = repo(c), id = await service.add(catalogs[0].id)
  await service.select(id)
  const history = { ownerId: 'alice', inviteeIds: [], memberIds: ['alice'], closed: false, careerId: catalogs[0].id }
  const academic = { schemaVersion: 1, statusMap: map, revision: 9, updatedAt: TIME }
  const planning = { schemaVersion: 3, revisionToken: 'preserved_revision_123', scenario: { marker: 'preserve without recalculation' }, updatedAt: TIME }
  await seed(env, { [`${ip(id)}/academic/progress`]: academic, [`${ip(id)}/planning/projection`]: planning,
    'jointPlans/history': history, [`${ip(id)}/sharing/snapshot`]: { retained: true } })
  const before = await read(c, ip(id)), authority = await read(c, cp)
  await service.archive(id)
  const archived = await read(c, ip(id))
  assert.equal((await read(c, up)).activeCareerInstanceId, null)
  assert.equal(archived.lifecycle, 'archived'); assert.ok(archived.archivedAt)
  assert.deepEqual(archived.createdAt, before.createdAt); assert.equal(archived.catalogId, before.catalogId)
  assert.deepEqual(await read(c, `${ip(id)}/academic/progress`), academic)
  assert.deepEqual(await read(c, `${ip(id)}/planning/projection`), planning)
  await service.archive(id); assert.deepEqual(await read(c, ip(id)), archived)
  await service.restore(id); const restored = await read(c, ip(id))
  await service.restore(id); assert.deepEqual(await read(c, ip(id)), restored)
  assert.equal(restored.archivedAt, null); assert.equal(restored.lifecycle, 'active')
  assert.deepEqual(restored.createdAt, before.createdAt); assert.equal((await read(c, up)).activeCareerInstanceId, null)
  assert.deepEqual(await read(c, cp), authority)
  await env.withSecurityRulesDisabled(async ctx => {
    assert.deepEqual(await read(ctx.firestore(), 'jointPlans/history'), history)
    assert.deepEqual(await read(ctx.firestore(), `${ip(id)}/sharing/snapshot`), { retained: true })
  })
})
test('archiving a nonselected instance preserves current selection', async () => {
  await setup(); const c = db(), service = repo(c), a = await service.add(catalogs[0].id), b = await service.add(catalogs[1].id)
  await service.select(b); await service.archive(a)
  assert.equal((await read(c, up)).activeCareerInstanceId, b)
})
test('direct archive cannot leave selected identity, nor combine archive and select in a malicious batch', async () => {
  await setup(); const c = db(), service = repo(c), id = await service.add(catalogs[0].id)
  await service.select(id); await deny(updateDoc(doc(c, ip(id)), archivePatch()))
  assert.equal((await read(c, ip(id))).lifecycle, 'active')
  const other = await service.add(catalogs[1].id), replacement = writeBatch(c)
  replacement.update(doc(c, ip(id)), archivePatch())
  replacement.update(doc(c, up), { activeCareerInstanceId: other, updatedAt: serverTimestamp() })
  await deny(replacement.commit()) // Archive selected must clear, never replace selection.
  await service.select(null)
  const batch = writeBatch(c)
  batch.update(doc(c, ip(id)), archivePatch())
  batch.update(doc(c, up), { activeCareerInstanceId: id, updatedAt: serverTimestamp() })
  await deny(batch.commit())
  assert.equal((await read(c, ip(id))).lifecycle, 'active'); assert.equal((await read(c, up)).activeCareerInstanceId, null)
})
test('archive and academic write in same request fail atomically', async () => {
  await setup(); const c = db(), service = repo(c), id = await service.add(catalogs[0].id), batch = writeBatch(c)
  batch.update(doc(c, ip(id)), archivePatch())
  batch.set(doc(c, `${ip(id)}/academic/progress`), { schemaVersion: 1, statusMap: map, revision: 1, updatedAt: serverTimestamp() })
  await deny(batch.commit())
  assert.equal((await read(c, ip(id))).lifecycle, 'active'); assert.equal(await read(c, `${ip(id)}/academic/progress`), undefined)
})
test('archive concurrent with select converges to archived and null; stale tabs cannot select/edit', async () => {
  await setup(); const c = db(), service = repo(c), id = await service.add(catalogs[0].id)
  const results = await Promise.allSettled([service.archive(id), repo(db()).select(id)])
  // Rules may see the winner before SDK retry. A losing action must be explicit,
  // leave a coherent state, and allow an explicit user retry (never partial archive).
  if (results[0].status === 'rejected') {
    assert.ok(['PERMISSION_DENIED', 'PERSISTENCE_CONFLICT'].includes(results[0].reason.code), results[0].reason.message)
    assert.equal((await read(c, ip(id))).lifecycle, 'active')
    await service.archive(id)
  }
  assert.equal((await read(c, ip(id))).lifecycle, 'archived'); assert.equal((await read(c, up)).activeCareerInstanceId, null)
  await assert.rejects(service.select(id))
  await deny(updateDoc(doc(c, up), { activeCareerInstanceId: id, updatedAt: serverTimestamp() }))
  await deny(setDoc(doc(c, `${ip(id)}/academic/progress`), { schemaVersion: 1, statusMap: map, revision: 1, updatedAt: serverTimestamp() }))
  await assert.rejects(service.select('missing'))
})
for (const actor of ['alice', 'bob', null]) test(`bootstrap remains closed for ${actor}, including arbitrary new/instances claims`, async () => {
  const c = db(actor)
  await deny(setDoc(doc(c, cp), control('new')))
  await seed(env, { [up]: { activeCareerId: catalogs[0].id }, [cp]: control('legacy', { authority: 'legacy', phase: 'pending' }) })
  await deny(setDoc(doc(c, cp), control('new')))
  await deny(updateDoc(doc(c, cp), { authority: 'instances', origin: 'new', phase: 'complete' }))
  await env.withSecurityRulesDisabled(async ctx => { assert.equal((await read(ctx.firestore(), cp)).authority, 'legacy') })
})
for (const patch of [null, { authority: 'legacy', phase: 'pending' }, { authority: 'frozen', phase: 'copying' }, { phase: 'blocked' }, { authority: 'bogus' }]) {
  test(`product lifecycle refuses nonwritable control ${JSON.stringify(patch)}`, async () => {
    if (patch) await setup('legacy', patch)
    const c = db(), service = repo(c)
    for (const operation of [() => service.add(catalogs[0].id), () => service.archive('missing'), () => service.restore('missing')]) {
      await assert.rejects(operation(), { code: 'PERMISSION_DENIED' })
    }
    await assert.rejects(service.select(null))
    assert.equal((await getDocsFromServer(collection(c, `${up}/careerInstances`))).size, 0)
  })
}
for (const actor of ['bob', null]) test(`lifecycle cross-user and anonymous mutations rejected: ${actor}`, async () => {
  await setup(); const c = db(), id = await repo(c).add(catalogs[0].id), other = db(actor)
  await deny(updateDoc(doc(other, ip(id)), archivePatch()))
  await deny(updateDoc(doc(other, up), { activeCareerInstanceId: id, updatedAt: serverTimestamp() }))
  await assert.rejects(repo(other).add(catalogs[1].id))
  await repo(c).archive(id)
  await deny(updateDoc(doc(other, ip(id)), { lifecycle: 'active', archivedAt: null, updatedAt: serverTimestamp() }))
})
test('archive/restore cannot enable sharing or rewrite a joint plan; legacy consent remains unusable', async () => {
  await setup(); const c = db(), service = repo(c), id = await service.add(catalogs[0].id)
  await seed(env, { 'planningSharing/alice': { enabled: true, sharedCareerId: catalogs[0].id, updatedAt: TIME },
    [`planningSnapshots/alice/careers/${catalogs[0].id}`]: { schemaVersion: 1, retained: true },
    'friendships/alice:bob': { participants: ['alice', 'bob'], status: 'accepted' } })
  for (const operation of [service.archive, service.restore]) {
    await operation(id)
    await deny(getDocFromServer(doc(db('bob'), `planningSnapshots/alice/careers/${catalogs[0].id}`)))
    await deny(updateDoc(doc(c, ip(id)), { sharing: { enabled: true }, updatedAt: serverTimestamp() }))
    await deny(setDoc(doc(c, `${ip(id)}/sharing/snapshot`), { approvedCodes: ['A'] }))
    await deny(updateDoc(doc(c, 'planningSharing/alice'), { enabled: true, updatedAt: serverTimestamp() }))
  }
})
