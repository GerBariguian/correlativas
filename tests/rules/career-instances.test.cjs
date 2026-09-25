const { before, after, beforeEach, test } = require('node:test')
const assert = require('node:assert/strict')
const sdk = require('firebase/firestore')
const { doc, collection, writeBatch, setDoc, updateDoc, deleteDoc, getDocFromServer, getDocsFromServer, serverTimestamp } = sdk
const { initialize, claims, seed, TIME, assertSucceeds: allow, assertFails: deny } = require('./helpers.cjs')
const load = require('../career-persistence-harness.cjs')
let env
before(async () => { env = await initialize() }, { timeout: 30000 })
after(async () => { if (env) await env.cleanup() })
beforeEach(async () => { await env.clearFirestore() })
const db = (uid = 'alice') => uid ? env.authenticatedContext(uid, claims(uid)).firestore() : env.unauthenticatedContext().firestore()
const ip = (id = 'opaque', uid = 'alice') => `users/${uid}/careerInstances/${id}`
const mp = (catalog = 'catalog', uid = 'alice') => `users/${uid}/catalogMemberships/${catalog}`
const data = (patch = {}) => ({ schemaVersion: 1, catalogId: 'catalog', lifecycle: 'active', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), archivedAt: null, ...patch })
function create(client, { id = 'opaque', uid = 'alice', catalog = 'catalog', patch = {}, index = {}, omit = '' } = {}) {
  const batch = writeBatch(client)
  if (omit !== 'instance') batch.set(doc(client, ip(id, uid)), data({ catalogId: catalog, ...patch }))
  if (omit !== 'membership') batch.set(doc(client, mp(catalog, uid)), { schemaVersion: 1, careerInstanceId: id, ...index })
  return batch.commit()
}
const archive = (client, patch = {}) => updateDoc(doc(client, ip()), { lifecycle: 'archived', archivedAt: serverTimestamp(), updatedAt: serverTimestamp(), ...patch })
const restore = client => updateDoc(doc(client, ip()), { lifecycle: 'active', archivedAt: null, updatedAt: serverTimestamp() })
async function empty() {
  await env.withSecurityRulesDisabled(async c => {
    assert.equal((await getDocsFromServer(collection(c.firestore(), 'users/alice/careerInstances'))).size, 0)
    assert.equal((await getDocsFromServer(collection(c.firestore(), 'users/alice/catalogMemberships'))).size, 0)
  })
}
function repo(client = db(), uid = 'alice', auth = { currentUser: { uid } }) {
  return load(sdk).careerInstancesRepository({ db: client, auth }, uid)
}
test('MC Rules atomic creation, own reads/list and no parent or sharing required', async () => {
  const c = db(); await allow(create(c))
  assert.equal((await allow(getDocFromServer(doc(c, ip())))).data().catalogId, 'catalog')
  assert.equal((await allow(getDocsFromServer(collection(c, 'users/alice/careerInstances')))).size, 1)
  assert.equal((await allow(getDocFromServer(doc(c, mp())))).data().careerInstanceId, 'opaque')
})
for (const uid of ['bob', null]) test(`MC Rules deny cross-user/anonymous ${uid}`, async () => {
  await create(db()); const c = db(uid)
  for (const path of [ip(), mp()]) {
    await deny(getDocFromServer(doc(c, path)))
    await deny(getDocsFromServer(collection(c, path.split('/').slice(0, -1).join('/'))))
    await deny(deleteDoc(doc(c, path)))
  }
  await deny(create(c, { id: 'other', catalog: 'othercat' }))
  await deny(archive(c)); await archive(db()); await deny(restore(c))
})
for (const omit of ['instance', 'membership']) test(`MC Rules deny orphan ${omit}`, async () => {
  await deny(create(db(), { omit })); await empty()
})
for (const [name, patch] of Object.entries({ schema: { schemaVersion: 2 }, fractional: { schemaVersion: 1.5 },
  extra: { uid: 'alice' }, sharing: { sharing: { enabled: true } }, progress: { statusMap: {} },
  lifecycle: { lifecycle: 'archived', archivedAt: serverTimestamp() }, unknown: { lifecycle: 'deleted' },
  catalog: { catalogId: '' }, wrongCatalog: { catalogId: 'other' }, time: { createdAt: TIME }, updateTime: { updatedAt: TIME },
  archiveTime: { archivedAt: TIME } })) test(`MC Rules deny creation ${name}`, async () => {
  await deny(create(db(), { patch })); await empty()
})
test('MC Rules deny each missing instance field', async () => {
  const c = db()
  for (const field of Object.keys(data())) {
    const batch = writeBatch(c), value = data(); delete value[field]
    batch.set(doc(c, ip()), value); batch.set(doc(c, mp()), { schemaVersion: 1, careerInstanceId: 'opaque' })
    await deny(batch.commit()); await empty()
  }
})
for (const [name, index] of Object.entries({ extra: { x: true }, schema: { schemaVersion: 2 }, fractional: { schemaVersion: 1.5 },
  empty: { careerInstanceId: '' }, wrong: { careerInstanceId: 'other' } })) test(`MC Rules deny membership ${name}`, async () => {
  await deny(create(db(), { index })); await empty()
})
test('MC Rules reject catalog as instance ID and invalid/oversized IDs', async () => {
  for (const options of [{ id: 'catalog' }, { id: 'bad id' }, { catalog: 'bad id' }, { id: 'a'.repeat(101) }, { catalog: 'a'.repeat(101) }]) {
    await deny(create(db(), options)); await empty()
  }
})
test('MC Rules archive/restore timestamps and immutable identity', async () => {
  const c = db(); await create(c)
  const before = (await getDocFromServer(doc(c, ip()))).data()
  await allow(archive(c)); const archived = (await getDocFromServer(doc(c, ip()))).data()
  assert.ok(archived.archivedAt.isEqual(archived.updatedAt)); assert.ok(archived.createdAt.isEqual(before.createdAt))
  await allow(restore(c)); const after = (await getDocFromServer(doc(c, ip()))).data()
  assert.equal(after.archivedAt, null); assert.equal(after.lifecycle, 'active'); assert.ok(after.createdAt.isEqual(before.createdAt))
  assert.equal((await getDocFromServer(doc(c, mp()))).data().careerInstanceId, 'opaque')
})
for (const [name, patch] of Object.entries({ catalog: { catalogId: 'other' }, created: { createdAt: TIME },
  spoofArchive: { archivedAt: TIME }, spoofUpdate: { updatedAt: TIME }, unknown: { lifecycle: 'deleted' }, extra: { progress: {} } })) {
  test(`MC Rules deny update ${name}`, async () => { const c = db(); await create(c); await deny(archive(c, patch)) })
}
test('MC Rules deny arbitrary same-state writes and malformed restore', async () => {
  const c = db(); await create(c)
  await deny(updateDoc(doc(c, ip()), { updatedAt: serverTimestamp() }))
  await archive(c); await deny(archive(c))
  await deny(updateDoc(doc(c, ip()), { lifecycle: 'active', updatedAt: serverTimestamp(), archivedAt: TIME }))
})
test('MC Rules duplicate, hijack, delete/recreate and archive/new cannot bypass uniqueness', async () => {
  const c = db(); await create(c)
  await deny(create(c, { id: 'second' }))
  await deny(updateDoc(doc(c, mp()), { careerInstanceId: 'second' }))
  await deny(deleteDoc(doc(c, ip()))); await deny(deleteDoc(doc(c, mp())))
  await archive(c); await deny(create(c, { id: 'third' })); await allow(restore(c))
  assert.equal((await getDocsFromServer(collection(c, 'users/alice/careerInstances'))).size, 1)
  assert.equal((await getDocsFromServer(collection(c, 'users/alice/catalogMemberships'))).size, 1)
})
test('MC Rules two IDs in one batch cannot share a membership', async () => {
  const c = db(), batch = writeBatch(c)
  batch.set(doc(c, ip()), data()); batch.set(doc(c, ip('second')), data())
  batch.set(doc(c, mp()), { schemaVersion: 1, careerInstanceId: 'opaque' })
  await deny(batch.commit()); await empty()
})
test('MC Rules navigation fields do not affect reads, writes or uniqueness', async () => {
  const c = db(); await create(c)
  for (const selection of [null, 'catalog', 'opaque', 'other-user-instance']) {
    await setDoc(doc(c, 'users/alice'), { activeCareerId: selection, activeCareerInstanceId: selection })
    await allow(getDocFromServer(doc(c, ip())))
    await deny(getDocFromServer(doc(db('bob'), ip())))
    await deny(archive(db('bob'))); await allow(archive(c)); await allow(restore(c))
    await deny(create(c, { id: 'second' }))
  }
})
test('MC Rules academic children remain denied, even to owner', async () => {
  const c = db(); await create(c)
  for (const suffix of ['academic/progress', 'planning/projection', 'sharing/snapshot']) {
    await deny(setDoc(doc(c, `${ip()}/${suffix}`), { data: true }))
    await deny(getDocFromServer(doc(c, `${ip()}/${suffix}`)))
  }
})
test('MC Rules cannot attach an index to an old orphan or operate without correct index', async () => {
  await seed(env, { [ip()]: data({ createdAt: TIME, updatedAt: TIME }) })
  await deny(setDoc(doc(db(), mp()), { schemaVersion: 1, careerInstanceId: 'opaque' }))
  await deny(archive(db()))
})
test('MC Rules deny missing membership fields and cross-owner pair', async () => {
  const c = db()
  for (const field of ['schemaVersion', 'careerInstanceId']) {
    const batch = writeBatch(c), index = { schemaVersion: 1, careerInstanceId: 'opaque' }; delete index[field]
    batch.set(doc(c, ip()), data()); batch.set(doc(c, mp()), index)
    await deny(batch.commit()); await empty()
  }
  const batch = writeBatch(c)
  batch.set(doc(c, ip()), data()); batch.set(doc(c, mp('catalog', 'bob')), { schemaVersion: 1, careerInstanceId: 'opaque' })
  await deny(batch.commit()); await empty()
})
test('MC Rules deleting parent/recreating cannot remove catalog reservation', async () => {
  const c = db(); await setDoc(doc(c, 'users/alice'), { activeCareerId: 'catalog' }); await create(c)
  await deleteDoc(doc(c, 'users/alice')); await setDoc(doc(c, 'users/alice'), { activeCareerId: 'other' })
  await deny(create(c, { id: 'second' }))
  assert.equal((await getDocsFromServer(collection(c, 'users/alice/careerInstances'))).size, 1)
})
test('MC repository metadata lifecycle leaves academic children and legacy decisions untouched', async () => {
  const r = repo(), id = await r.create('catalog')
  const records = { 'users/alice': { activeCareerId: 'legacy', activeCareerInstanceId: id },
    'planningSharing/alice': { enabled: true, sharedCareerId: 'legacy' },
    [`${ip(id)}/academic/progress`]: { statusMap: { A: 'Aprobada' } },
    [`${ip(id)}/planning/projection`]: { scenario: { initialCapacity: 4 } } }
  await seed(env, records); await r.archiveMetadata(id); await r.restoreMetadata(id)
  await env.withSecurityRulesDisabled(async c => {
    for (const [path, value] of Object.entries(records)) assert.deepEqual((await getDocFromServer(doc(c.firestore(), path))).data(), value)
  })
})
test('MC repository real CRUD subset and idempotent metadata lifecycle', async () => {
  const r = repo(); assert.deepEqual(await r.list(), []); assert.equal(await r.get('missing'), null); assert.equal(await r.getByCatalog('catalog'), null)
  const id = await r.create('catalog'); assert.notEqual(id, 'catalog')
  const value = await r.get(id); assert.equal(value.instance.uid, 'alice')
  assert.equal((await r.getByCatalog('catalog')).instance.careerInstanceId, id)
  await r.archiveMetadata(id); const archived = await r.get(id)
  await r.archiveMetadata(id); assert.ok((await r.get(id)).metadata.updatedAt.isEqual(archived.metadata.updatedAt))
  await assert.rejects(r.create('catalog'), { code: 'DUPLICATE_CATALOG_INSTANCE' })
  await r.restoreMetadata(id); const restored = await r.get(id)
  await r.restoreMetadata(id); assert.ok((await r.get(id)).metadata.updatedAt.isEqual(restored.metadata.updatedAt))
  assert.ok(restored.metadata.createdAt.isEqual(value.metadata.createdAt)); assert.equal(restored.metadata.archivedAt, null)
  await assert.rejects(r.archiveMetadata('missing'), { code: 'CAREER_INSTANCE_NOT_FOUND' })
  assert.equal((await r.list()).length, 1)
})
test('MC repository concurrent create commits exactly one coherent pair', async () => {
  const results = await Promise.allSettled([repo().create('catalog'), repo().create('catalog')])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'DUPLICATE_CATALOG_INSTANCE')
  const rows = await repo().list(); assert.equal(rows.length, 1)
  const indexes = await getDocsFromServer(collection(db(), 'users/alice/catalogMemberships'))
  assert.equal(indexes.size, 1); assert.equal(indexes.docs[0].data().careerInstanceId, rows[0].instance.careerInstanceId)
})
test('MC repository maps denied access without writing any partial document', async () => {
  const r = repo(db('bob')) // Deliberately mismatched supplied auth vs real emulator identity.
  await assert.rejects(r.create('catalog'), { code: 'PERMISSION_DENIED' }); await empty()
})
test('MC repository different owners and catalogs stay isolated', async () => {
  await repo().create('catalog'); await repo().create('second-catalog'); await repo(db('bob'), 'bob').create('catalog')
  assert.equal((await repo().list()).length, 2); assert.equal((await repo(db('bob'), 'bob').list()).length, 1)
})
test('MC repository detects corrupt/dangling index rather than absent data', async () => {
  await seed(env, { [mp()]: { schemaVersion: 1, careerInstanceId: 'missing' } })
  await assert.rejects(repo().getByCatalog('catalog'), { code: 'INVALID_CAREER_DOCUMENT' })
})
