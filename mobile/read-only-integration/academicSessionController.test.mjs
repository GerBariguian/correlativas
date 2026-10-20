import './test-source-loader.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAcademicSessionController } from './academicSessionController.mjs'
import { createAcademicQueryController } from './academicQueryController.mjs'
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const tick = async () => { await Promise.resolve(); await Promise.resolve() }
const A = { uid: 'lab-instances', model: 'instances', id: 'lab-systems', catalogId: 'utn-sistemas-2023' }
function fixture() {
  const pending = [], events = []
  const session = createAcademicSessionController({ connect(uid) { events.push('connect:' + uid); const d = deferred(); pending.push(d); return d.promise } })
  function client(name, close = async () => {}) { return { readProgress: async scope => ({ state: 'loaded', scope, progress: { statusMap: {}, revision: 7 } }), close: async () => { events.push('close:' + name); await close() } } }
  return { session, pending, events, client }
}
test('change user invalidates and clears all consumers before awaiting close', async () => {
  const f = fixture(), closing = deferred(), c = f.client('A', () => closing.promise)
  const first = f.session.connect(A.uid); await tick(); f.pending[0].resolve(c); await first
  const old = f.session.getSnapshot().connection, q = createAcademicQueryController()
  q.start(old, A); await tick(); assert.equal(q.getSnapshot().state, 'loaded')
  const second = f.session.connect('lab-legacy')
  assert.equal(old.isCurrent(), false); assert.equal(q.getSnapshot().state, 'idle')
  await tick(); assert.equal(f.pending.length, 1)
  closing.resolve(); await tick(); await tick()
  f.pending[1].resolve(f.client('B')); await second
  assert.notEqual(f.session.getSnapshot().connection.id, old.id)
  assert.deepEqual(f.events.slice(0, 3), ['connect:lab-instances', 'close:A', 'connect:lab-legacy'])
  await f.session.dispose()
})
test('disconnect during connection closes its late client without publishing', async () => {
  const f = fixture(), connecting = f.session.connect(A.uid); await tick()
  await f.session.disconnect(); f.pending[0].resolve(f.client('late')); await connecting
  assert.equal(f.session.getSnapshot().state, 'idle'); assert.deepEqual(f.events, ['connect:lab-instances', 'close:late'])
})
test('A B A connections completing out of order retain only newest connection', async () => {
  const f = fixture(), a1 = f.session.connect(A.uid); await tick()
  const b = f.session.connect('lab-legacy'); await tick()
  const a2 = f.session.connect(A.uid)
  await tick()
  assert.equal(f.pending.length, 3)
  f.pending[2].resolve(f.client('new-A')); await a2
  f.pending[1].resolve(f.client('old-B')); f.pending[0].resolve(f.client('old-A')); await Promise.all([a1, b])
  assert.ok(f.events.includes('close:old-A')); assert.ok(f.events.includes('close:old-B'))
  const id = f.session.getSnapshot().connection.id
  const reconnect = f.session.connect(A.uid); await tick(); await tick(); await tick()
  f.pending[3].resolve(f.client('reconnected')); await reconnect
  assert.notEqual(f.session.getSnapshot().connection.id, id); await f.session.dispose()
})
test('late connect error cannot override newer successful session', async () => {
  const f = fixture(), a = f.session.connect(A.uid); await tick()
  const b = f.session.connect('lab-legacy'); await tick()
  f.pending[1].resolve(f.client('B')); await b
  f.pending[0].reject(Error('late failure')); await a
  assert.equal(f.session.getSnapshot().uid, 'lab-legacy'); assert.equal(f.session.getSnapshot().state, 'ready')
  await f.session.dispose()
})
test('close errors are explicit and do not restore revoked progress or start replacement', async () => {
  const f = fixture(), a = f.session.connect(A.uid); await tick()
  f.pending[0].resolve(f.client('bad', async () => { throw Error('close failure') })); await a
  const connection = f.session.getSnapshot().connection
  await f.session.connect('lab-legacy')
  assert.equal(connection.isCurrent(), false); assert.equal(f.session.getSnapshot().code, 'C3_CLOSE_FAILED')
  assert.equal(f.pending.length, 1); await f.session.dispose()
})
test('late client close error is returned to caller, not published into newer state', async () => {
  const f = fixture(), a = f.session.connect(A.uid); await tick(); await f.session.disconnect()
  f.pending[0].resolve(f.client('late', async () => { throw Error('late close failure') }))
  assert.equal((await a).code, 'C3_LATE_CLOSE_FAILED'); assert.equal(f.session.getSnapshot().state, 'idle')
})
test('dispose is idempotent, closes once and prevents reconnect', async () => {
  const f = fixture(), a = f.session.connect(A.uid); await tick(); f.pending[0].resolve(f.client('A')); await a
  let notifications = 0; const unsubscribe = f.session.subscribe(() => notifications++)
  unsubscribe(); await f.session.dispose(); await f.session.dispose()
  assert.equal(f.events.filter(e => e === 'close:A').length, 1); assert.equal(notifications, 0)
  await assert.rejects(f.session.connect(A.uid), /DISPOSED/)
})



test('reconnect waits for disconnect cleanup; cleanup failure fails closed', async () => {
  const f = fixture(), closing = deferred(), first = f.session.connect(A.uid); await tick()
  f.pending[0].resolve(f.client('A', () => closing.promise)); await first
  const disconnecting = f.session.disconnect(), next = f.session.connect('lab-legacy'); await tick()
  assert.equal(f.pending.length, 1)
  closing.reject(Error('cleanup failed')); await Promise.all([disconnecting, next])
  assert.equal(f.pending.length, 1); assert.equal(f.session.getSnapshot().code, 'C3_CLOSE_FAILED')
})
