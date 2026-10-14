const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const api = vm.createContext({})
const logic = fs.readFileSync(path.join(__dirname, '../src/logic.js'), 'utf8')
const source = fs.readFileSync(path.join(__dirname, '../src/academicOnboardingLogic.js'), 'utf8')
vm.runInContext(logic.replace(/export /g, '') + '\n' + source.replace(/^import [^\n]*\n/, '').replace(/export /g, ''), api)
const plain = value => JSON.parse(JSON.stringify(value))
const scope = { uid: 'alice', model: 'instances', id: 'instance-a', catalogId: 'catalog-a' }
const subjects = [{ code: 'A', year: 1, term: '1C' }, { code: 'B', year: 1, term: '2C' }]
const loaded = statusMap => ({ state: 'loaded', statusMap })
const draft = (progress = null, identity = scope) => api.createOnboardingDraft({ scope: identity, subjects, progress: loaded(progress) })
const error = (code, fn) => assert.throws(fn, e => e.code === code)

test('groups actual year/level/period labels in catalog order without inference', () => {
  const input = [subjects[0], { code: 'X', year: 1, term: '1C' }, subjects[1],
    { code: 'C', year: 2, term: 'Anual' }, { code: 'D', level: 'CBC', term: 'Cuatrimestral' },
    { code: 'E', year: 'Tercer año' }, { code: 'F' }, { code: 'G', year: 5, term: 'Actividad' }]
  const before = JSON.stringify(input), groups = plain(api.groupOnboardingSubjects(input))
  assert.deepEqual(groups[0], { year: 1, level: null, period: '1C', codes: ['A', 'X'] })
  assert.deepEqual(groups.map(g => g.period), ['1C', '2C', 'Anual', 'Cuatrimestral', null, null, 'Actividad'])
  assert.equal(groups[3].level, 'CBC'); assert.equal(groups[4].year, 'Tercer año')
  assert.equal(JSON.stringify(input), before)
})
for (const state of ['Pendiente', 'Cursando', 'Regularizada', 'Aprobada']) {
  test(`explicit ${state} counts as reviewed, independently of academic approval`, () => {
    const d = api.decideOnboardingSubjects(draft(), ['A'], state)
    assert.equal(d.decisions.A, state)
    assert.deepEqual(plain(api.onboardingReviewProgress(d)), { total: 2, protected: 0, editable: 2, reviewed: 1, remaining: 1, complete: false, ratio: 0.5 })
  })
  test(`existing ${state} is protected including batch operations`, () => {
    const d = draft({ A: state })
    error('ONBOARDING_PROGRESS_PROTECTED', () => api.decideOnboardingSubjects(d, ['B', 'A'], 'Aprobada'))
    error('ONBOARDING_PROGRESS_PROTECTED', () => api.selectOnboardingSubjects(d, ['A']))
    assert.deepEqual(plain(d.decisions), {})
  })
}
test('bulk selection deduplicates, applies one undo unit and supports redo/correction', () => {
  const original = draft(), selected = api.selectOnboardingSubjects(original, ['A', 'B', 'A'])
  const changed = api.assignOnboardingSelection(selected, 'Regularizada')
  assert.deepEqual(plain(changed.decisions), { A: 'Regularizada', B: 'Regularizada' })
  const undone = api.undoOnboardingDecision(changed)
  assert.deepEqual(plain(undone.decisions), {})
  assert.deepEqual(plain(api.redoOnboardingDecision(undone).decisions), plain(changed.decisions))
  const corrected = api.decideOnboardingSubjects(undone, ['A'], 'Cursando')
  assert.equal(api.redoOnboardingDecision(corrected), corrected)
  assert.deepEqual(plain(original.decisions), {}); assert.deepEqual(plain(original.selected), [])
})
test('empty drafts, selection and repeated decisions do not manufacture changes', () => {
  const d = draft()
  assert.deepEqual(plain(api.prepareOnboardingChanges(d).entries), [])
  assert.equal(api.undoOnboardingDecision(d), d); assert.equal(api.redoOnboardingDecision(d), d)
  assert.equal(api.assignOnboardingSelection(d, 'Aprobada'), d)
  const x = api.decideOnboardingSubjects(d, ['A'], 'Pendiente')
  assert.equal(api.decideOnboardingSubjects(x, ['A'], 'Pendiente'), x)
})
test('starting and later never reset or generate writes, even with an existing draft', () => {
  const d = api.decideOnboardingSubjects(draft({ A: 'Aprobada', OLD: 'Regularizada' }), ['B'], 'Cursando')
  for (const choice of ['starting', 'later']) {
    const changes = api.prepareOnboardingChanges(d, choice)
    assert.deepEqual(plain(changes.entries), [])
    assert.deepEqual(plain(api.mergeOnboardingChanges(changes, scope, loaded(d.baseline))), plain(d.baseline))
  }
})
test('merge preserves unknown keys and concurrent unrelated progress; inputs unchanged', () => {
  const saved = { A: 'Aprobada', OLD: 'Regularizada' }, original = JSON.stringify(saved)
  const d = api.decideOnboardingSubjects(draft(saved), ['B'], 'Pendiente')
  const changes = api.prepareOnboardingChanges(d), current = { ...saved, OTHER: 'Cursando' }
  const merged = api.mergeOnboardingChanges(changes, scope, loaded(current))
  assert.deepEqual(plain(merged), { ...current, B: 'Pendiente' })
  assert.equal(JSON.stringify(saved), original); assert.equal(Object.hasOwn(current, 'B'), false)
  assert.equal(Object.isFrozen(d.baseline), true); assert.equal(Object.isFrozen(changes.entries[0]), true)
  assert.equal(api.onboardingReviewProgress(d).protected, 1)
})
for (const value of ['Pendiente', 'Aprobada']) test(`concurrent touched key ${value} conflicts, never overwritten`, () => {
  const changes = api.prepareOnboardingChanges(api.decideOnboardingSubjects(draft(), ['A'], 'Aprobada'))
  error('ONBOARDING_PROGRESS_CONFLICT', () => api.mergeOnboardingChanges(changes, scope, loaded({ A: value })))
})
for (const identity of [{ ...scope, uid: 'bob' }, { ...scope, id: 'instance-b' },
  { ...scope, catalogId: 'catalog-b' }, { ...scope, model: 'legacy', id: 'catalog-a' }]) {
  test(`scope isolates repeated subject codes: ${JSON.stringify(identity)}`, () => {
    const a = api.decideOnboardingSubjects(draft(), ['A'], 'Aprobada'), b = draft(null, identity)
    assert.notEqual(api.onboardingScopeKey(a.scope), api.onboardingScopeKey(b.scope))
    assert.deepEqual(plain(b.decisions), {})
    error('ONBOARDING_SCOPE_MISMATCH', () => api.mergeOnboardingChanges(api.prepareOnboardingChanges(a), identity, loaded(null)))
  })
}
for (const progress of [undefined, {}, { state: 'error', statusMap: null }, { state: 'loading', statusMap: null }, { state: 'loaded' }]) {
  test(`unconfirmed/missing read rejected: ${JSON.stringify(progress)}`, () => {
    error('ONBOARDING_PROGRESS_NOT_LOADED', () => api.createOnboardingDraft({ scope, subjects, progress }))
  })
}
for (const changes of [{ uid: '' }, { id: 'a/b' }, { catalogId: ' ' }, { model: 'frozen' }, { model: 'legacy' }, { uid: 'a\nb' }, { selected: 'x' }]) {
  test(`invalid scope rejected: ${JSON.stringify(changes)}`, () => assert.throws(() => draft(null, { ...scope, ...changes })))
}
test('invalid states, duplicate/unknown codes, malformed groups and maps rejected', () => {
  error('INVALID_ONBOARDING_STATUS', () => api.decideOnboardingSubjects(draft(), ['A'], 'Equivalencia'))
  error('UNKNOWN_ONBOARDING_CODE', () => api.decideOnboardingSubjects(draft(), ['Z'], 'Aprobada'))
  error('DUPLICATE_ONBOARDING_CODE', () => api.groupOnboardingSubjects([subjects[0], subjects[0]]))
  error('INVALID_ONBOARDING_GROUP', () => api.groupOnboardingSubjects([{ code: 'A', term: 2 }]))
  error('INVALID_ONBOARDING_PROGRESS', () => draft([]))
  error('INVALID_ONBOARDING_STATUS', () => draft({ A: 'unknown' }))
  error('INVALID_ONBOARDING_CHOICE', () => api.prepareOnboardingChanges(draft(), 'reset'))
})
test('empty/fully protected catalog progress has zero remaining and no invented decisions', () => {
  const d = draft({ A: 'Pendiente', B: 'Aprobada' })
  assert.deepEqual(plain(api.onboardingReviewProgress(d)), { total: 2, protected: 2, editable: 0, reviewed: 0, remaining: 0, complete: true, ratio: 1 })
  const empty = api.createOnboardingDraft({ scope, subjects: [], progress: loaded(null) })
  assert.equal(api.onboardingReviewProgress(empty).complete, true)
})
test('prototype-like codes remain own data properties without prototype mutation', () => {
  const d = api.createOnboardingDraft({ scope, subjects: [{ code: '__proto__' }], progress: loaded(null) })
  const changes = api.prepareOnboardingChanges(api.decideOnboardingSubjects(d, ['__proto__'], 'Pendiente'))
  assert.equal(Object.hasOwn(api.mergeOnboardingChanges(changes, scope, loaded(null)), '__proto__'), true)
})
test('malformed changes reject duplicate entries and weakened absence precondition', () => {
  const entry = { code: 'A', status: 'Aprobada', expectedAbsent: true }
  for (const entries of [[entry, entry], [{ ...entry, expectedAbsent: false }], [{ ...entry, extra: true }]]) {
    error('INVALID_ONBOARDING_CHANGES', () => api.mergeOnboardingChanges({ scope, entries }, scope, loaded(null)))
  }
})
