import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const network = require('./integration-network.cjs')
require('../emulator-lab/policy.cjs').assertEnvironment()
// Execute the unmodified browser bundle with real SDK transports in Node.
// This location is a test host shim, not evidence of browser CSP enforcement.
globalThis.location = { protocol: 'http:', hostname: '127.0.0.1', port: '5187' }
const { connectAcademicLab } = await import('./dist/c2/academic-client.mjs')
const scope = (uid, model, id, catalogId) => ({ uid, model, id, catalogId })
const systems = scope('lab-instances', 'instances', 'lab-systems', 'utn-sistemas-2023')
const industrial = scope('lab-instances', 'instances', 'lab-industrial23', 'utn-industrial-2023')
const legacy = scope('lab-legacy', 'legacy', 'utn-sistemas-2023', 'utn-sistemas-2023')
const statuses = { 'UTN-ISI23-01': 'Aprobada', 'UTN-ISI23-02': 'Regularizada', 'UTN-ISI23-03': 'Cursando', 'UTN-ISI23-04': 'Pendiente' }
const noProgress = result => assert.equal(Object.hasOwn(result, 'progress'), false, JSON.stringify(result))
function expected(result, state, detail = {}) {
  assert.equal(result.state, state)
  for (const [key, value] of Object.entries(detail)) assert.deepEqual(result[key], value)
  if (state !== 'loaded') noProgress(result)
}
async function clientCase(uid, work) {
  const client = await connectAcademicLab(uid)
  try { await work(client) } finally { network.firestoreUnavailable = false; await client.close() }
}

test('C2 real Emulator integration (existing fixtures, no seeding or data writes)', { timeout: 45000 }, async t => {
  await t.test('instances loaded; systems/industrial/systems remain separated', async () => {
    await clientCase('lab-instances', async client => {
      assert.deepEqual(Object.keys(client).sort(), ['close', 'readProgress'])
      for (const s of [systems, industrial, systems]) {
        const result = await client.readProgress(s)
        expected(result, 'loaded', { scope: s })
        assert.deepEqual(result.progress, { statusMap: s === industrial ? {} : statuses, revision: s === industrial ? 1 : 7 })
      }
    })
  })
  await t.test('legacy existing and absent; absence never returns preceding progress', async () => {
    await clientCase('lab-legacy', async client => {
      const loaded = await client.readProgress(legacy)
      expected(loaded, 'loaded', { scope: legacy })
      assert.deepEqual(loaded.progress, { statusMap: statuses, revision: null })
      expected(await client.readProgress(scope('lab-legacy', 'legacy', 'utn-industrial-2023', 'utn-industrial-2023')),
        'absent', { reason: 'PROGRESS_MISSING' })
    })
  })
  await t.test('empty fixture has no instance; no cross-user fallback', async () => {
    await clientCase('lab-empty', async client => {
      expected(await client.readProgress({ ...systems, uid: 'lab-empty' }), 'absent', { reason: 'INSTANCE_MISSING' })
    })
  })
  await t.test('blocked fixture denies before missing metadata', async () => {
    await clientCase('lab-blocked', async client => {
      expected(await client.readProgress({ ...systems, uid: 'lab-blocked' }), 'blocked', { reason: 'AUTHORITY_UNAVAILABLE' })
    })
  })
  await t.test('archived context never exposes its stored progress', async () => {
    await clientCase('lab-instances', async client => {
      expected(await client.readProgress(systems), 'loaded')
      expected(await client.readProgress(scope('lab-instances', 'instances', 'lab-industrial07', 'utn-industrial-2007')), 'archived')
    })
  })
  await t.test('facade owner mismatch in both directions, after successful reads', async () => {
    for (const [uid, own, other] of [['lab-legacy', legacy, systems], ['lab-instances', systems, legacy]]) {
      await clientCase(uid, async client => {
        expected(await client.readProgress(own), 'loaded')
        expected(await client.readProgress(other), 'blocked', { reason: 'OWNER_MISMATCH', scope: other })
      })
    }
  })
  await t.test('catalog mismatch cannot return prior systems progress', async () => {
    await clientCase('lab-instances', async client => {
      expected(await client.readProgress(systems), 'loaded')
      expected(await client.readProgress({ ...systems, catalogId: 'utn-industrial-2023' }), 'blocked', { reason: 'CATALOG_MISMATCH' })
    })
  })
  await t.test('wrong academic models reject in both directions', async () => {
    for (const [uid, own, wrong] of [
      ['lab-instances', systems, { ...legacy, uid: 'lab-instances' }],
      ['lab-legacy', legacy, { ...systems, uid: 'lab-legacy' }],
    ]) {
      await clientCase(uid, async client => {
        expected(await client.readProgress(own), 'loaded')
        expected(await client.readProgress(wrong), 'blocked', { reason: 'AUTHORITY_UNAVAILABLE' })
      })
    }
  })
  await t.test('invalid scope never returns previously loaded data', async () => {
    await clientCase('lab-instances', async client => {
      expected(await client.readProgress(systems), 'loaded')
      const { catalogId, ...invalid } = systems
      expected(await client.readProgress(invalid), 'error', { code: 'INVALID_ONBOARDING_SCOPE' })
    })
  })
  await t.test('close revokes reads, is idempotent; a new client can read', async () => {
    await clientCase('lab-instances', async client => {
      expected(await client.readProgress(systems), 'loaded')
      await client.close(); await client.close()
      const before = network.requests.length
      expected(await client.readProgress(systems), 'error', { code: 'C2_CLOSED' })
      assert.equal(network.requests.length, before)
    })
    await clientCase('lab-instances', async client => expected(await client.readProgress(systems), 'loaded'))
  })
  await t.test('isolated Firestore outage: explicit error without stale data, then recovery', async () => {
    await clientCase('lab-instances', async client => {
      expected(await client.readProgress(systems), 'loaded')
      try {
        network.firestoreUnavailable = true
        expected(await client.readProgress(systems), 'error', { code: 'C2_EMULATOR_UNAVAILABLE' })
        await assert.rejects(connectAcademicLab('lab-instances'), /C1_EMULATOR_UNAVAILABLE_8188/)
      } finally { network.firestoreUnavailable = false }
      const result = await client.readProgress(systems)
      expected(result, 'loaded'); assert.deepEqual(result.progress, { statusMap: statuses, revision: 7 })
    })
  })
  await t.test('Firestore Rules independently deny direct cross-owner read (not the C2 facade)', async () => {
    const { initializeApp, deleteApp } = await import('firebase/app')
    const { initializeAuth, inMemoryPersistence, connectAuthEmulator, signInWithEmailAndPassword } = await import('firebase/auth')
    const { initializeFirestore, memoryLocalCache, connectFirestoreEmulator, doc, getDocFromServer } = await import('firebase/firestore')
    const app = initializeApp({ projectId: 'demo-correlativas-244b', apiKey: 'fake-lab-key', appId: 'lab-only' }, 'c2-rules-' + crypto.randomUUID())
    try {
      const auth = initializeAuth(app, { persistence: inMemoryPersistence })
      connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true })
      const db = initializeFirestore(app, { localCache: memoryLocalCache() })
      connectFirestoreEmulator(db, '127.0.0.1', 8188)
      await signInWithEmailAndPassword(auth, 'lab-instances@example.test', 'fixture-only-password')
      // Positive ownership control distinguishes denial from an unavailable server.
      const own = await getDocFromServer(doc(db, 'users/lab-instances/careerInstances/lab-systems/academic/progress'))
      assert.equal(own.exists(), true); assert.equal(own.data().revision, 7)
      await assert.rejects(getDocFromServer(doc(db, 'users/lab-legacy/careers/utn-sistemas-2023')),
        error => error.code === 'permission-denied')
    } finally { await deleteApp(app) }
  })
  await t.test('observed transport stays on fixed local endpoints; no production attempts', () => {
    assert.deepEqual(network.denied, [])
    assert.ok(network.sockets.length > 0)
    assert.ok(network.requests.some(r => r.origin.endsWith(':9199') && r.path.includes('signInWithPassword')))
    assert.ok(network.requests.some(r => r.origin.endsWith(':8188') && r.path.includes('Firestore')))
    assert.deepEqual([...new Set(network.requests.map(r => r.origin))].sort(), ['http://127.0.0.1:8188', 'http://127.0.0.1:9199'])
    assert.ok(network.sockets.every(s => s.host === '127.0.0.1' && [9199, 8188].includes(s.port)))
    console.log('C2_NETWORK_EVIDENCE', JSON.stringify({ requests: network.requests.length, sockets: network.sockets.length,
      origins: [...new Set(network.requests.map(r => r.origin))].sort(), denied: network.denied.length }))
  })
})
