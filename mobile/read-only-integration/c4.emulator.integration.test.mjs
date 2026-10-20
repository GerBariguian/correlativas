import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const network = require('./integration-network.cjs')
require('../emulator-lab/policy.cjs').assertEnvironment()
globalThis.location = { protocol: 'http:', hostname: '127.0.0.1', port: '5187' }
const { connectAcademicLab } = await import('./dist/c2/academic-client.mjs')
const { createAcademicSessionController, createAcademicQueryController } = await import('./dist/c3/academic-consumer.mjs')
const { academicViewModel } = await import('./dist/c4/academic-view-model.mjs')
const S = { uid: 'lab-instances', model: 'instances', id: 'lab-systems', catalogId: 'utn-sistemas-2023' }
const I = { ...S, id: 'lab-industrial23', catalogId: 'utn-industrial-2023' }
const A = { ...S, id: 'lab-industrial07', catalogId: 'utn-industrial-2007' }
async function settled(query) {
  if (query.getSnapshot().state !== 'loading') return
  await new Promise(resolve => { const stop = query.subscribe(() => { if (query.getSnapshot().state !== 'loading') { stop(); resolve() } }) })
}
test('C4.1 real C3 snapshots and existing Emulator fixtures', { timeout: 30000 }, async t => {
  const session = createAcademicSessionController({ connect: connectAcademicLab }), query = createAcademicQueryController()
  try {
    await session.connect('lab-instances'); assert.equal(session.getSnapshot().state, 'ready')
    const connection = session.getSnapshot().connection
    const view = scope => academicViewModel({ scope, connectionId: connection.id, connectionCurrent: connection.isCurrent(), snapshot: query.getSnapshot() })
    await t.test('systems → industrial → systems: complete catalog, only recorded statuses', async () => {
      for (const [scope, total, recorded, revision] of [[S, 44, 4, 7], [I, 45, 0, 1], [S, 44, 4, 7]]) {
        query.start(connection, scope)
        assert.equal(view(scope).state, 'loading'); assert.deepEqual(view(scope).rows, [])
        await settled(query)
        const model = view(scope); assert.equal(model.state, 'loaded'); assert.equal(model.revision, revision)
        assert.equal(model.counts.total, total); assert.equal(model.counts.recorded, recorded); assert.equal(model.counts.unrecorded, total - recorded)
      }
    })
    await t.test('archive and revoked session expose no progress rows or counts', async () => {
      query.start(connection, A); await settled(query)
      const archived = view(A); assert.equal(archived.state, 'archived'); assert.deepEqual(archived.rows, []); assert.equal(archived.counts, null)
      await session.disconnect()
      assert.equal(view(S).state, 'idle'); assert.deepEqual(view(S).rows, [])
    })
    assert.deepEqual(network.denied, [])
    assert.deepEqual([...new Set(network.requests.map(r => r.origin))].sort(), ['http://127.0.0.1:8188', 'http://127.0.0.1:9199'])
    console.log('C4_NETWORK_EVIDENCE', JSON.stringify({ requests: network.requests.length, sockets: network.sockets.length, denied: network.denied.length }))
  } finally { query.cancel(); await session.dispose() }
})
