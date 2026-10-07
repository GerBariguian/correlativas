const { test } = require('node:test')
const assert = require('node:assert/strict')
const { initialize, seed, claims, TIME, friendship } = require('./helpers.cjs')
const { doc, writeBatch, serverTimestamp, getDocFromServer, updateDoc } = require('firebase/firestore')
const control = uid => ({ schemaVersion: 1, generation: 'multicareer-v1', authority: 'instances', phase: 'complete', origin: 'legacy', manifestId: uid, updatedAt: TIME })
const metadata = { schemaVersion: 1, catalogId: 'catalog', lifecycle: 'active', createdAt: TIME, updatedAt: TIME, archivedAt: null }
test('instance sharing: explicit consent and current snapshot, no selection authorization', async t => {
  const env = await initialize()
  const clients = new Map()
  const db = uid => { if (!clients.has(uid)) clients.set(uid, env.authenticatedContext(uid, claims(uid)).firestore()); return clients.get(uid) }
  const mref = (uid, id = 'i_a') => doc(db(uid), `users/${uid}/careerInstances/${id}`)
  const sref = uid => doc(db(uid), 'users/a/careerInstances/i_a/sharing/snapshot')
  async function setup(reverse = false) {
    await env.clearFirestore()
    await seed(env, {
      'migrationUsers/a': control('a'), 'migrationUsers/b': control('b'),
      'users/a': { schemaVersion: 2, activeCareerInstanceId: null, updatedAt: TIME },
      'users/b': { schemaVersion: 2, activeCareerInstanceId: null, updatedAt: TIME },
      'users/a/careerInstances/i_a': metadata, 'users/b/careerInstances/i_b': metadata,
      'users/a/catalogMemberships/catalog': { schemaVersion: 1, careerInstanceId: 'i_a' },
      'users/b/catalogMemberships/catalog': { schemaVersion: 1, careerInstanceId: 'i_b' },
      [`friendships/${reverse ? 'b:a' : 'a:b'}`]: reverse ? friendship('b', 'a') : friendship('a', 'b'),
    })
  }
  async function enable(epoch = 1, version = 2) {
    const b = writeBatch(db('a'))
    b.update(mref('a'), { sharing: { enabled: true, consentVersion: version, epoch, updatedAt: serverTimestamp() }, updatedAt: serverTimestamp() })
    b.set(sref('a'), { schemaVersion: 3, approvedCodes: [], availableToCourseCodes: ['A'],
      ...(version === 2 ? { pendingFinalCodes: [] } : {}), sourceProgressRevision: 0, sourceUpdatedAt: TIME,
      consentEpoch: epoch, logicVersion: '1', catalogVersion: 'catalog:abc', updatedAt: serverTimestamp() })
    await b.commit()
  }
  try {
    for (const reverse of [false, true]) await t.test(`enable/read/revoke reverse=${reverse}`, async () => {
      await setup(reverse); await enable()
      assert.ok((await getDocFromServer(sref('b'))).exists())
      await assert.rejects(getDocFromServer(doc(db('b'), 'users/a/careerInstances/i_a')), { code: 'permission-denied' })
      await updateDoc(mref('a'), { sharing: { enabled: false, consentVersion: 2, epoch: 2, updatedAt: serverTimestamp() }, updatedAt: serverTimestamp() })
      await assert.rejects(getDocFromServer(sref('b')), { code: 'permission-denied' })
    })
    await t.test('archive atomically revokes; restore never reactivates old snapshot', async () => {
      await setup(); await enable()
      await assert.rejects(updateDoc(mref('a'), { lifecycle: 'archived', archivedAt: serverTimestamp(), updatedAt: serverTimestamp() }), { code: 'permission-denied' })
      await updateDoc(mref('a'), { lifecycle: 'archived', archivedAt: serverTimestamp(), updatedAt: serverTimestamp(),
        sharing: { enabled: false, consentVersion: 2, epoch: 2, updatedAt: serverTimestamp() } })
      await assert.rejects(getDocFromServer(sref('b')), { code: 'permission-denied' })
      await updateDoc(mref('a'), { lifecycle: 'active', archivedAt: null, updatedAt: serverTimestamp() })
      await assert.rejects(getDocFromServer(sref('b')), { code: 'permission-denied' })
      await enable(3); assert.ok((await getDocFromServer(sref('b'))).exists())
    })
  } finally { await env.cleanup() }
})
