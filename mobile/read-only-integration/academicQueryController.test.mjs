import './test-source-loader.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAcademicQueryController, academicQueryView, queryIdentity } from './academicQueryController.mjs'
const A = { uid: 'lab-instances', model: 'instances', id: 'lab-systems', catalogId: 'utn-sistemas-2023' }
const B = { ...A, id: 'lab-industrial23', catalogId: 'utn-industrial-2023' }
const tick = async () => { await Promise.resolve(); await Promise.resolve() }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function fake() {
  const pending = [], listeners = new Set(); let live = true
  const connection = { id: {}, uid: A.uid, isCurrent: () => live,
    readProgress(scope) { const d = deferred(); pending.push({ ...d, scope }); return d.promise },
    subscribeInvalidation(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  }
  return { connection, pending, listeners, invalidate() { live = false; for (const listener of [...listeners]) listener() } }
}
const loaded = (scope, revision = 7) => ({ state: 'loaded', scope, progress: { statusMap: { subject: 'Aprobada' }, revision } })
const noProgress = value => assert.equal(Object.hasOwn(value, 'progress'), false)
test('A → B → A: newest request wins even when the identity returns to A', async () => {
  const f = fake(), q = createAcademicQueryController()
  q.start(f.connection, A); q.start(f.connection, B); q.start(f.connection, A)
  f.pending[2].resolve(loaded(A, 9)); await tick()
  f.pending[0].resolve(loaded(A, 1)); f.pending[1].reject(Error('late')); await tick()
  assert.equal(q.getSnapshot().progress.revision, 9)
  assert.equal(f.listeners.size, 1)
})
test('every identity field and connection is gated before effects; no prior progress', async () => {
  const f = fake(), q = createAcademicQueryController(); q.start(f.connection, A)
  f.pending[0].resolve(loaded(A)); await tick()
  for (const change of [{ uid: 'lab-empty' }, { model: 'legacy', id: A.catalogId }, { id: 'other' }, { catalogId: B.catalogId }]) {
    const changed = { ...A, ...change }
    noProgress(academicQueryView(f.connection, changed, q.getSnapshot()))
    assert.notEqual(queryIdentity(changed).key, queryIdentity(A).key)
  }
  noProgress(academicQueryView(fake().connection, A, q.getSnapshot()))
  noProgress(academicQueryView(f.connection, null, q.getSnapshot()))
  assert.equal(academicQueryView(f.connection, {}, q.getSnapshot()).state, 'error')
})
test('refresh clears immediately; late success and rejection cannot supersede refresh', async () => {
  const f = fake(), q = createAcademicQueryController(); q.start(f.connection, A)
  f.pending[0].resolve(loaded(A)); await tick()
  q.refresh(); noProgress(q.getSnapshot()); assert.equal(q.getSnapshot().state, 'loading')
  q.refresh(); f.pending[2].resolve(loaded(A, 8)); await tick()
  f.pending[1].reject(Error('late refresh')); await tick()
  assert.equal(q.getSnapshot().progress.revision, 8)
})
test('cleanup detaches, discards result, never closes shared client; strict setup-cleanup-setup', async () => {
  const f = fake(), q = createAcademicQueryController(); let notifications = 0
  const unsubscribe = q.subscribe(() => notifications++)
  const stop = q.start(f.connection, A); stop(); stop()
  assert.equal(f.listeners.size, 0)
  q.start(f.connection, A)
  f.pending[0].resolve(loaded(A, 1)); f.pending[1].resolve(loaded(A, 2)); await tick()
  assert.equal(q.getSnapshot().progress.revision, 2)
  unsubscribe(); const before = notifications
  q.cancel(); assert.equal(notifications, before); assert.equal(f.connection.isCurrent(), true)
})
test('session invalidation clears synchronously and suppresses pending completion', async () => {
  const f = fake(), q = createAcademicQueryController(); q.start(f.connection, A)
  f.pending[0].resolve(loaded(A)); await tick(); q.refresh()
  f.invalidate(); assert.equal(q.getSnapshot().state, 'idle'); noProgress(q.getSnapshot())
  f.pending[1].reject(Error('closed')); await tick(); assert.equal(q.getSnapshot().state, 'idle')
})
test('all non-loaded outcomes and malformed responses cannot retain progress', async () => {
  for (const state of ['absent', 'error', 'blocked', 'archived']) {
    const f = fake(), q = createAcademicQueryController(); q.start(f.connection, A)
    f.pending[0].resolve(loaded(A)); await tick(); q.refresh()
    f.pending[1].resolve({ state, scope: A, code: 'fixture', reason: 'fixture', progress: { leaked: true } }); await tick()
    assert.equal(q.getSnapshot().state, state); noProgress(q.getSnapshot())
  }
  for (const bad of [null, loaded(B), { state: 'loaded', scope: A }, { state: 'other', scope: A }]) {
    const f = fake(), q = createAcademicQueryController(); q.start(f.connection, A)
    f.pending[0].resolve(bad); await tick(); assert.equal(q.getSnapshot().state, 'error'); noProgress(q.getSnapshot())
  }
})
test('two consumers have independent state and unsubscribing one does not revoke another', async () => {
  const f = fake(), q1 = createAcademicQueryController(), q2 = createAcademicQueryController()
  const stop = q1.start(f.connection, A); q2.start(f.connection, B); stop()
  f.pending[0].resolve(loaded(A)); f.pending[1].resolve(loaded(B)); await tick()
  assert.equal(q1.getSnapshot().state, 'idle'); assert.deepEqual(q2.getSnapshot().scope, B)
})
test('invalid scope fails without invoking injected repository', () => {
  const f = fake(), q = createAcademicQueryController(); q.start(f.connection, {})
  assert.equal(q.getSnapshot().code, 'C3_INVALID_SCOPE'); assert.equal(f.pending.length, 0)
})

test('published progress is a frozen copy, isolated from repository objects', async () => {
  const f = fake(), q = createAcademicQueryController(); q.start(f.connection, A)
  const result = loaded(A); f.pending[0].resolve(result); await tick()
  result.progress.statusMap.subject = 'Pendiente'
  assert.equal(q.getSnapshot().progress.statusMap.subject, 'Aprobada')
  assert.throws(() => { q.getSnapshot().progress.statusMap.subject = 'Pendiente' }, TypeError)
})
