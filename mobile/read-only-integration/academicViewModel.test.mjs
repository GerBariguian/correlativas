import './test-source-loader.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { UTN_CATALOGS, getUTNCatalog } from './catalogRegistry.mjs'
import { academicViewModel, validateAcademicCatalog } from './academicViewModel.mjs'
import { queryIdentity, createAcademicQueryController } from './academicQueryController.mjs'
const require = createRequire(import.meta.url)
// Materialize B's existing fixtures in memory. Never call seedAuth/seedFirestore.
const docs = require('../emulator-lab/fixtures.cjs').fixtureDocuments({ fromMillis: ms => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 }) })
const S = { uid: 'lab-instances', model: 'instances', id: 'lab-systems', catalogId: 'utn-sistemas-2023' }
const I = { ...S, id: 'lab-industrial23', catalogId: 'utn-industrial-2023' }
const A = { ...S, id: 'lab-industrial07', catalogId: 'utn-industrial-2007' }
const L = { uid: 'lab-legacy', model: 'legacy', id: 'utn-sistemas-2023', catalogId: 'utn-sistemas-2023' }
const connectionId = Object.freeze({})
function progress(scope) {
  const d = docs[scope.model === 'legacy' ? `users/${scope.uid}/careers/${scope.id}` : `users/${scope.uid}/careerInstances/${scope.id}/academic/progress`]
  return { statusMap: structuredClone(d.statusMap), revision: scope.model === 'legacy' ? null : d.revision }
}
function input(scope = S, state = 'loaded') {
  return { scope, connectionId, connectionCurrent: true,
    snapshot: { state, scope: { ...scope }, key: queryIdentity(scope).key, connectionId, progress: progress(scope) } }
}
const clean = result => { assert.deepEqual(result.rows, []); assert.equal(result.counts, null); assert.equal(Object.hasOwn(result, 'progress'), false); assert.equal(Object.hasOwn(result, 'revision'), false) }
function changedCatalog(mutator) { const c = structuredClone(UTN_CATALOGS[S.catalogId]); mutator(c); return { [S.catalogId]: c } }

test('explicit registry: only three detached, deeply frozen UTN catalogs', async () => {
  assert.deepEqual(Object.keys(UTN_CATALOGS).sort(), ['utn-industrial-2007', 'utn-industrial-2023', 'utn-sistemas-2023'])
  assert.deepEqual(Object.values(UTN_CATALOGS).map(c => c.subjects.length), [44, 45, 44])
  for (const catalog of Object.values(UTN_CATALOGS)) { validateAcademicCatalog(catalog, catalog.catalogId); assert.equal(Object.hasOwn(catalog, 'initialStatus'), false) }
  const original = (await import('../../src/data/utn/sistemas2023.js')).subjects
  assert.notEqual(UTN_CATALOGS[S.catalogId].subjects, original); assert.equal(Object.isFrozen(original), false)
  assert.throws(() => { UTN_CATALOGS[S.catalogId].subjects[0].name = 'changed' }, TypeError)
  assert.equal(getUTNCatalog('unknown'), null); assert.equal(getUTNCatalog('toString'), null)
})
test('systems fixture: 44 activities, 4 recorded and 40 unrecorded', () => {
  const view = academicViewModel(input())
  assert.equal(view.state, 'loaded'); assert.equal(view.revision, 7)
  assert.deepEqual(view.counts, { total: 44, recorded: 4, unrecorded: 40, byStatus: { Pendiente: 1, Cursando: 1, Regularizada: 1, Aprobada: 1 } })
  assert.equal(view.rows.filter(r => !r.recorded && r.status === null).length, 40)
})
test('Industrial 2023 empty progress remains loaded: 45 unrecorded, no pending invented', () => {
  const view = academicViewModel(input(I))
  assert.equal(view.state, 'loaded'); assert.equal(view.revision, 1)
  assert.equal(view.counts.total, 45); assert.equal(view.counts.recorded, 0); assert.equal(view.counts.unrecorded, 45)
  assert.ok(view.rows.every(r => r.recorded === false && r.status === null)); assert.equal(view.counts.byStatus.Pendiente, 0)
})
test('legacy fixture has explicit null revision and preserves owner/model', () => {
  const view = academicViewModel(input(L)); assert.equal(view.state, 'loaded'); assert.equal(view.revision, null)
  assert.deepEqual(view.scope, L); assert.equal(view.counts.recorded, 4)
})
test('explicit Pendiente is different from no academic record', () => {
  const view = academicViewModel(input())
  const pending = view.rows.find(r => r.code === 'UTN-ISI23-04'), absent = view.rows.find(r => r.code === 'UTN-ISI23-05')
  assert.equal(pending.recorded, true); assert.equal(pending.status, 'Pendiente')
  assert.equal(absent.recorded, false); assert.equal(absent.status, null)
})
test('archived fixture exposes no progress, even if stale progress is attached', () => {
  assert.equal(docs['users/lab-instances/careerInstances/lab-industrial07'].lifecycle, 'archived')
  const view = academicViewModel(input(A, 'archived')); assert.equal(view.state, 'archived'); clean(view)
})
test('each non-loaded C3 state strips rows, counts and stale progress', () => {
  for (const state of ['idle', 'loading', 'absent', 'error', 'blocked', 'archived']) {
    const data = input(S, state); data.snapshot.reason = 'INSTANCE_MISSING'; data.snapshot.code = 'example'
    const view = academicViewModel(data); assert.equal(view.state, state); clean(view)
    if (state === 'absent') assert.equal(view.reason, 'INSTANCE_MISSING')
  }
})
test('missing selection or invalidated connection never exposes loaded data', () => {
  for (const change of [{ scope: null }, { connectionCurrent: false }, { connectionCurrent: undefined }]) {
    const view = academicViewModel({ ...input(), ...change }); assert.equal(view.state, 'idle'); clean(view)
  }
})
test('unknown catalog does not substitute a known one; original queryState remains distinct', () => {
  const s = { ...S, catalogId: 'unknown-catalog' }, data = input(); data.scope = s; data.snapshot.scope = s; data.snapshot.key = queryIdentity(s).key
  const view = academicViewModel(data); assert.equal(view.code, 'C4_UNKNOWN_CATALOG'); assert.equal(view.catalogState, 'unknown'); assert.equal(view.queryState, 'loaded'); clean(view)
  const wrong = academicViewModel(input(), changedCatalog(c => { c.catalogId = I.catalogId }))
  assert.equal(wrong.code, 'C4_INVALID_CATALOG'); clean(wrong)
})
test('all identity fields, C3 key and connection identity must match', () => {
  for (const change of [{ uid: 'lab-empty' }, { model: 'legacy', id: S.catalogId }, { id: I.id }, { catalogId: I.catalogId }]) {
    const data = input(); data.snapshot.scope = { ...S, ...change }
    const view = academicViewModel(data); assert.equal(view.state, 'error'); clean(view)
  }
  for (const change of [{ connectionId: {} }, { key: 'wrong' }]) {
    const data = input(); Object.assign(data.snapshot, change)
    assert.equal(academicViewModel(data).code, 'C4_IDENTITY_MISMATCH')
  }
})
test('unknown academic codes, invalid statuses and revisions fail explicitly', () => {
  for (const [value, code] of [
    [{ ...progress(S), statusMap: { unknown: 'Aprobada' } }, 'C4_UNKNOWN_SUBJECT'],
    [{ ...progress(S), statusMap: { 'UTN-ISI23-01': 'unknown' } }, 'C4_INVALID_STATUS'],
    [{ ...progress(S), revision: null }, 'C4_INVALID_PROGRESS'],
    [{ ...progress(S), statusMap: null }, 'C4_INVALID_PROGRESS'],
  ]) {
    const data = input(); data.snapshot.progress = value
    const view = academicViewModel(data); assert.equal(view.code, code); clean(view)
  }
})
test('invalid references, duplicate subjects, invalid fields are signaled without data', () => {
  const mutations = [c => c.subjects[0].prereqs.push('missing'), c => c.subjects[0].prereqs.push(c.subjects[0].code),
    c => c.subjects[0].prereqs.push(c.subjects[1].code, c.subjects[1].code),
    c => c.subjects[0].approvedPrereqs.push('ALL'), c => { c.subjects[0].finalPrereqs = null },
    c => c.subjects.push(c.subjects[0]), c => { c.subjects[0].year = -1 }]
  for (const mutate of mutations) { const view = academicViewModel(input(), changedCatalog(mutate)); assert.equal(view.state, 'error'); assert.equal(view.catalogState, 'invalid'); clean(view) }
})
test('preserve all metadata and requirement types; absent arrays stay null; ALL unexpanded', () => {
  for (const s of [S, I]) {
    const view = academicViewModel(input(s)), original = UTN_CATALOGS[s.catalogId]
    for (const row of view.rows) {
      const subject = original.subjects.find(x => x.code === row.code)
      assert.deepEqual(row.subject, subject)
      for (const key of ['prereqs', 'approvedPrereqs', 'finalPrereqs']) assert.deepEqual(row[key], Object.hasOwn(subject, key) ? subject[key] : null)
      assert.equal(row.year, subject.year); assert.equal(row.level, subject.level ?? null); assert.equal(row.term, subject.term ?? null)
      assert.equal(Object.hasOwn(row, 'canEnroll'), false); assert.equal(Object.hasOwn(row, 'canSitFinal'), false)
    }
  }
  assert.deepEqual(academicViewModel(input(I)).rows.find(r => r.code === '032596').finalPrereqs, ['ALL'])
  assert.equal(academicViewModel(input(I)).rows.filter(r => r.finalPrereqs === null).length, 16)
})
test('projection is pure and immutable; cannot retain data across calls', () => {
  const data = input(), before = structuredClone(data.snapshot.progress), view = academicViewModel(data)
  assert.deepEqual(data.snapshot.progress, before); assert.equal(Object.isFrozen(data.snapshot.progress), false)
  assert.throws(() => { view.rows[0].subject.name = 'changed' }, TypeError)
  clean(academicViewModel(input(S, 'loading'))); assert.equal(academicViewModel(input(I)).counts.recorded, 0)
  assert.equal(view.counts.recorded, 4)
  const invalid = input(S, 'error'); invalid.snapshot.reason = { invalid: true }
  assert.equal(academicViewModel(invalid).code, 'C4_INVALID_SNAPSHOT')
  assert.equal(Object.isFrozen(invalid.snapshot.reason), false)
})
test('accepts an actual C3 controller snapshot without changing the C3 contract', async () => {
  const connection = { id: connectionId, isCurrent: () => true, subscribeInvalidation: () => () => {}, readProgress: async scope => ({ state: 'loaded', scope, progress: progress(scope) }) }
  const q = createAcademicQueryController(); const stop = q.start(connection, S)
  await Promise.resolve(); await Promise.resolve()
  const view = academicViewModel({ scope: S, connectionId: connection.id, connectionCurrent: true, snapshot: q.getSnapshot() })
  assert.equal(view.state, 'loaded'); assert.equal(view.counts.recorded, 4); stop()
})
