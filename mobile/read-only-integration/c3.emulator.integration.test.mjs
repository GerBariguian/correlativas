import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const network = require('./integration-network.cjs')
require('../emulator-lab/policy.cjs').assertEnvironment()
globalThis.location = { protocol: 'http:', hostname: '127.0.0.1', port: '5187' }
const { connectAcademicLab } = await import('./dist/c2/academic-client.mjs')
const { createAcademicSessionController, createAcademicQueryController } = await import('./dist/c3/academic-consumer.mjs')
const S = { uid: 'lab-instances', model: 'instances', id: 'lab-systems', catalogId: 'utn-sistemas-2023' }
const I = { ...S, id: 'lab-industrial23', catalogId: 'utn-industrial-2023' }
const L = { uid: 'lab-legacy', model: 'legacy', id: 'utn-sistemas-2023', catalogId: 'utn-sistemas-2023' }
function outcome(query, state) {
  return new Promise((resolve, reject) => {
    const check = () => { const value = query.getSnapshot(); if (value.state !== 'loading') { stop(); value.state === state ? resolve(value) : reject(Error(JSON.stringify(value))) } }
    const stop = query.subscribe(check); check()
  })
}
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes }); return { promise, resolve } }
test('C3 real Emulator consumers and lifecycle', { timeout: 30000 }, async t => {
  const session = createAcademicSessionController({ connect: connectAcademicLab }), query = createAcademicQueryController()
  try {
    await session.connect('lab-instances')
    assert.equal(session.getSnapshot().state, 'ready')
    const connection = session.getSnapshot().connection
    await t.test('context transition and manual refresh discard previous progress immediately', async () => {
      query.start(connection, S); assert.equal(query.getSnapshot().state, 'loading')
      assert.equal((await outcome(query, 'loaded')).progress.revision, 7)
      query.start(connection, I); assert.equal(Object.hasOwn(query.getSnapshot(), 'progress'), false)
      assert.deepEqual((await outcome(query, 'loaded')).progress, { statusMap: {}, revision: 1 })
      const refreshing = query.refresh(); assert.equal(query.getSnapshot().state, 'loading')
      await refreshing; assert.equal(query.getSnapshot().progress.revision, 1)
    })
    await t.test('A B A with held deliveries from real SDK reads', async () => {
      const calls = []
      const delayed = { ...connection, readProgress(scope) {
        const deliver = deferred(), received = deferred()
        calls.push({ deliver, received })
        return connection.readProgress(scope).then(async value => { received.resolve(value); await deliver.promise; return value })
      } }
      query.start(delayed, S); query.start(delayed, I); query.start(delayed, S)
      const values = await Promise.all(calls.map(c => c.received.promise))
      assert.deepEqual(values.map(v => v.progress.revision), [7, 1, 7])
      calls[2].deliver.resolve(); assert.equal((await outcome(query, 'loaded')).progress.revision, 7)
      calls[1].deliver.resolve(); calls[0].deliver.resolve()
      await Promise.resolve(); await Promise.resolve()
      assert.deepEqual(query.getSnapshot().scope, S); assert.equal(query.getSnapshot().progress.revision, 7)
    })
    await t.test('isolated outage surfaces error without retained progress and recovers manually', async () => {
      query.start(connection, S); await outcome(query, 'loaded')
      try {
        network.firestoreUnavailable = true
        await query.refresh()
        assert.equal(query.getSnapshot().state, 'error'); assert.equal(query.getSnapshot().code, 'C2_EMULATOR_UNAVAILABLE')
        assert.equal(Object.hasOwn(query.getSnapshot(), 'progress'), false)
      } finally { network.firestoreUnavailable = false }
      await query.refresh(); assert.equal(query.getSnapshot().progress.revision, 7)
    })
    await t.test('user change revokes old connection; legacy and owner mismatch remain distinct', async () => {
      const switching = session.connect('lab-legacy')
      assert.equal(query.getSnapshot().state, 'idle'); assert.equal(connection.isCurrent(), false)
      await switching
      const legacy = session.getSnapshot().connection
      query.start(legacy, L); assert.equal((await outcome(query, 'loaded')).progress.revision, null)
      query.start(legacy, S); const blocked = await outcome(query, 'blocked')
      assert.equal(blocked.reason, 'OWNER_MISMATCH'); assert.equal(Object.hasOwn(blocked, 'progress'), false)
    })
    await t.test('consumer cleanup preserves shared client, session disconnect clears query', async () => {
      const legacy = session.getSnapshot().connection
      const stop = query.start(legacy, L); await outcome(query, 'loaded'); stop()
      assert.equal(query.getSnapshot().state, 'idle'); assert.equal(legacy.isCurrent(), true)
      query.start(legacy, L); await outcome(query, 'loaded')
      await session.disconnect(); assert.equal(query.getSnapshot().state, 'idle')
    })
    assert.deepEqual(network.denied, [])
    assert.deepEqual([...new Set(network.requests.map(r => r.origin))].sort(), ['http://127.0.0.1:8188', 'http://127.0.0.1:9199'])
    console.log('C3_NETWORK_EVIDENCE', JSON.stringify({ requests: network.requests.length, sockets: network.sockets.length, denied: network.denied.length }))
  } finally { network.firestoreUnavailable = false; query.cancel(); await session.dispose() }
})
