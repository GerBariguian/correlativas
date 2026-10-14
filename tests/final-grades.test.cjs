const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs')
const api = require('./final-grades-harness.cjs')()
const time = { seconds: 1700000000, nanoseconds: 0 }
const scope = { uid: 'alice', id: 'cat', catalogId: 'cat', model: 'legacy' }
test('grade integers 1..10, optional null; reject decimal/string/undefined/nonfinite/out of range', () => {
  for (const grade of [null, ...Array.from({ length: 10 }, (_, i) => i + 1)]) assert.equal(api.validateFinalGrade(grade), grade)
  for (const grade of [undefined, '', '8', 0, 11, 1.5, NaN, Infinity, true]) assert.throws(() => api.validateFinalGrade(grade))
})
test('strict DTO, immutable input, revision monotonic across null and no overflow', () => {
  const d = api.buildFinalGrade(8, null, time), before = JSON.stringify(d)
  assert.deepEqual(api.decodeFinalGrade(d), d)
  assert.equal(JSON.stringify(d), before)
  assert.equal(api.buildFinalGrade(null, d.revision, time).revision, 2)
  assert.throws(() => api.buildFinalGrade(8, Number.MAX_SAFE_INTEGER, time))
  for (const key of Object.keys(d)) { const bad = { ...d }; delete bad[key]; assert.throws(() => api.decodeFinalGrade(bad)) }
  for (const bad of [{ ...d, extra: 1 }, { ...d, schemaVersion: 2 }, { ...d, revision: 0 }, { ...d, updatedAt: null }]) assert.throws(() => api.decodeFinalGrade(bad))
})
test('identity isolates users, careers, instances and repeated codes; invalid IDs rejected', () => {
  const paths = [scope, { ...scope, uid: 'bob' }, { ...scope, id: 'other', catalogId: 'other' }, { ...scope, model: 'instances', id: 'ix' }].map(s => api.finalGradePath(s, 'A'))
  assert.equal(new Set(paths).size, 4)
  for (const code of ['', '.', '..', 'A/B']) assert.throws(() => api.finalGradePath(scope, code))
  assert.throws(() => api.finalGradeScope({ ...scope, catalogId: 'other' }))
})
test('average uses unique currently approved catalog subjects only, not absences, retained or unknown grades', () => {
  const subjects = ['A', 'A', 'B', 'C', 'D'].map(code => ({ code }))
  const grades = { A: { grade: 8 }, B: { grade: 9 }, C: { grade: null }, D: { grade: 1 }, OLD: { grade: 10 } }
  assert.deepEqual(api.finalGradeSummary(subjects, { A: 'Aprobada', B: 'Aprobada', C: 'Aprobada', D: 'Regularizada' }, grades), { approved: 3, graded: 2, average: 8.5 })
  assert.deepEqual(api.finalGradeSummary(subjects, {}, grades), { approved: 0, graded: 0, average: null })
  assert.equal(grades.A.grade, 8)
})
test('Rules artifacts are additive and reproducible; base writeRevision and social grants unchanged', () => {
  for (const a of require('../scripts/prepare-final-grades.cjs').artifacts()) {
    assert.equal(fs.readFileSync(a.file, 'utf8').replace(/\r\n/g, '\n'), a.content)
    assert.equal(a.content.replace(a.addition, ''), a.original)
  }
})
function fixture() {
  const records = new Map([['users/alice/careers/cat', { statusMap: { A: 'Aprobada' }, writeRevision: 2 }]])
  const auth = { currentUser: { uid: 'alice' } }; let afterGet = () => {}, writes = 0
  const sdk = { doc: (_db, ...parts) => parts.join('/'), serverTimestamp: () => time,
    runTransaction: async (_db, callback) => { const pending = []; await callback({ get: async p => {
      const value = structuredClone(records.get(p)); await afterGet(p); return { exists: () => value !== undefined, data: () => value }
    }, set: (p, d) => pending.push([p, d]) }); for (const [p, d] of pending) { records.set(p, d); writes++ } } }
  const a = require('./final-grades-harness.cjs')(sdk)
  return { records, auth, api: a, repo: a.finalGradesRepository({ db: {}, auth }, scope, [{ code: 'A' }, { code: 'B' }]),
    after(fn) { afterGet = fn }, writes: () => writes }
}
test('transaction only writes note, preserves progress; stale CAS and nonapproved rejected, null retained', async () => {
  const f = fixture(), before = structuredClone(f.records.get('users/alice/careers/cat'))
  await f.repo.save('A', 8, null)
  await assert.rejects(f.repo.save('A', 9, null), /CONFLICT/)
  await assert.rejects(f.repo.save('B', 9, null), /APPROVED/)
  await f.repo.save('A', null, 1)
  assert.equal(f.records.get(api.finalGradePath(scope, 'A')).revision, 2)
  assert.deepEqual(f.records.get('users/alice/careers/cat'), before)
})
test('session, authority, read error and unknown code fail without writes', async () => {
  for (const failure of ['session', 'authority', 'read', 'unknown']) {
    const f = fixture()
    if (failure === 'session') f.after(() => { f.auth.currentUser = { uid: 'alice' } })
    if (failure === 'authority') f.records.set('migrationUsers/alice', { authority: 'frozen' })
    if (failure === 'read') f.after(() => { throw Object.assign(Error('denied'), { code: 'permission-denied' }) })
    await assert.rejects(f.repo.save(failure === 'unknown' ? 'X' : 'A', 8, null)); assert.equal(f.writes(), 0)
  }
})
test('subscription ignores cache/pending, never maps errors/malformed documents to empty grades', () => {
  let next, fail, result, error
  const a = require('./final-grades-harness.cjs')({ collection: () => 'path', onSnapshot: (_ref, _opts, n, e) => { next = n; fail = e; return () => {} } })
  const repo = a.finalGradesRepository({ db: {}, auth: { currentUser: { uid: 'alice' } } }, scope, [])
  repo.subscribe(value => { result = value }, e => { error = e })
  next({ metadata: { fromCache: true }, docs: [] }); assert.equal(result, undefined)
  next({ metadata: { hasPendingWrites: true }, docs: [] }); assert.equal(result, undefined)
  next({ metadata: {}, docs: [{ id: 'A', data: () => ({}) }] }); assert.ok(error); assert.equal(result, undefined)
  fail(Error('read denied')); assert.equal(error.message, 'read denied')
  next({ metadata: {}, docs: [] }); assert.deepEqual(result, {})
})
