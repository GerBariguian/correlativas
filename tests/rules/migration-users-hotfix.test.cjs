const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const crypto = require('node:crypto')
const sdk = require('firebase/firestore')
const h = require('./helpers.cjs')
const { academicBridgeRepository } = require('../academic-bridge-harness.cjs')(sdk)
const rules = fs.readFileSync('firestore.migration-users-hotfix.rules', 'utf8')
const snapshotPath = require('node:path').join(__dirname, 'fixtures', 'firestore.production-before-v116.rules.txt')
const snapshotHash = 'e38c13412a9ac97bc3e4ff247685a34a47279ea4df480eb99105f41f14a9f48b'
let env
before(async () => { env = await h.initialize(rules) })
after(async () => { if (env) await env.cleanup() })
beforeEach(async () => { await env.clearFirestore() })
const db = uid => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore()
const control = { schemaVersion: 1, generation: 'multicareer-v1', authority: 'legacy',
  phase: 'pending', origin: 'legacy', manifestId: 'alice', updatedAt: h.TIME }
async function denied(operation) {
  await assert.rejects(operation, error => {
    assert.equal(error.code, 'permission-denied')
    assert.doesNotMatch(error.message, /1000\s+expressions|service[ -]call|resource[ -]exhaust|maximum.*(?:access|calls)/i)
    return true
  })
}
test('T1 own absent control GET succeeds', async () => {
  assert.equal((await sdk.getDocFromServer(sdk.doc(db('alice'), 'migrationUsers/alice'))).exists(), false)
})
test('T2 own existing control GET succeeds', async () => {
  await h.seed(env, { 'migrationUsers/alice': control })
  assert.deepEqual((await sdk.getDocFromServer(sdk.doc(db('alice'), 'migrationUsers/alice'))).data(), control)
})
test('T3 other UID GET denied, existing and absent', async () => {
  await h.seed(env, { 'migrationUsers/alice': control })
  const client = db('bob')
  await denied(sdk.getDocFromServer(sdk.doc(client, 'migrationUsers/alice')))
  await denied(sdk.getDocFromServer(sdk.doc(client, 'migrationUsers/missing')))
})
test('T4 anonymous GET denied, existing and absent', async () => {
  await h.seed(env, { 'migrationUsers/alice': control })
  const client = db(null)
  await denied(sdk.getDocFromServer(sdk.doc(client, 'migrationUsers/alice')))
  await denied(sdk.getDocFromServer(sdk.doc(client, 'migrationUsers/missing')))
})
test('T5 LIST denied including own-ID query', async () => {
  const client = db('alice'), refs = sdk.collection(client, 'migrationUsers')
  await denied(sdk.getDocsFromServer(refs))
  await denied(sdk.getDocsFromServer(sdk.query(refs, sdk.where(sdk.documentId(), '==', 'alice'))))
})
test('T6 CREATE denied', async () => {
  await denied(sdk.setDoc(sdk.doc(db('alice'), 'migrationUsers/alice'), control))
})
test('T7 UPDATE denied', async () => {
  await h.seed(env, { 'migrationUsers/alice': control })
  await denied(sdk.updateDoc(sdk.doc(db('alice'), 'migrationUsers/alice'), { phase: 'blocked' }))
})
test('T8 DELETE denied', async () => {
  await h.seed(env, { 'migrationUsers/alice': control })
  await denied(sdk.deleteDoc(sdk.doc(db('alice'), 'migrationUsers/alice')))
})
test('T9 real Bridge resolves server-confirmed absent control to writable legacy', async () => {
  await h.seed(env, { 'users/alice': { activeCareerId: 'legacy-catalog' } })
  const client = db('alice'), auth = { currentUser: { uid: 'alice' } }
  const repository = academicBridgeRepository({ db: client, auth }, 'alice')
  let stop, timer
  try {
    const context = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Bridge did not confirm legacy from server')), 10000)
      stop = repository.subscribeContext(value => { if (value.authority === 'legacy') resolve(value) }, reject)
    })
    assert.equal(context.catalogId, 'legacy-catalog')
    assert.deepEqual(context.capabilities, { academicWrite: true, select: true, legacySocial: true })
    assert.equal((await sdk.getDocFromServer(sdk.doc(client, 'migrationUsers/alice'))).exists(), false)
  } finally { clearTimeout(timer); stop?.() }
})
test('T10 exact snapshot plus authorized block, no other modifications', () => {
  const bytes = fs.readFileSync(snapshotPath)
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), snapshotHash)
  const original = bytes.toString('utf8'), nl = original.includes('\r\n') ? '\r\n' : '\n'
  const block = ['    match /migrationUsers/{uid} {',
    '      allow get: if signedIn() && request.auth.uid == uid;',
    '      allow list, create, update, delete: if false;', '    }', '', ''].join(nl)
  const marker = '    // Academic records remain private, including after accepting a friendship.'
  assert.equal(original.split(marker).length, 2)
  assert.equal(rules, original.replace(marker, block + marker))
  assert.equal(rules.split(block).length, 2)
  assert.equal(rules.replace(block, ''), original)
})
