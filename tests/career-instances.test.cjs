const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const domain = vm.createContext({})
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/careerInstanceLogic.js'), 'utf8').replace(/export /g, ''), domain)
const plain = value => JSON.parse(JSON.stringify(value))
const instance = (changes = {}) => ({ uid: 'alice', careerInstanceId: 'ci-01', catalogId: 'uade-informatica', lifecycle: 'active', ...changes })
const binding = (changes = {}) => ({ uid: 'alice', careerInstanceId: 'ci-01', bindingState: 'resolved', ...changes })
const expectCode = (code, fn) => assert.throws(fn, error => error.code === code)
const catalog = 'uade-informatica'

test('create a domain instance with explicit owner, instance and catalog identity', () => {
  const result = domain.createCareerInstance({ uid: 'alice', careerInstanceId: 'ci-01', catalogId: catalog })
  assert.deepEqual(plain(result), instance())
  assert.equal(Object.isFrozen(result), true)
})
for (const [name, changes] of [
  ['missing owner', { uid: undefined }], ['empty owner', { uid: '' }],
  ['missing instance ID', { careerInstanceId: undefined }], ['empty instance ID', { careerInstanceId: '' }],
  ['missing catalog', { catalogId: undefined }], ['blank catalog', { catalogId: ' ' }],
  ['multiple catalogs', { catalogId: ['a', 'b'] }], ['catalog as instance ID', { careerInstanceId: catalog }],
  ['unknown lifecycle', { lifecycle: 'deleted' }], ['path ID', { careerInstanceId: 'a/b' }],
  ['untrimmed ID', { uid: ' alice' }], ['control character', { catalogId: 'a\nb' }],
]) test(`instance rejects ${name}`, () => expectCode('INVALID_CAREER_INSTANCE', () => domain.validateCareerInstance(instance(changes))))

test('domain rejects document payloads instead of silently dropping academic/consent data', () => {
  for (const extra of [{ statusMap: {} }, { sharing: { enabled: true } }, { catalogIds: [] }]) {
    expectCode('INVALID_CAREER_INSTANCE', () => domain.archiveCareerInstance(instance(extra)))
  }
})
test('constructor rejects absent/malformed identity with a stable domain error', () => {
  for (const value of [undefined, null, [], {}, { uid: 'alice', careerInstanceId: 'ci-01', catalogId: catalog, lifecycle: 'archived' }]) {
    expectCode('INVALID_CAREER_INSTANCE', () => domain.createCareerInstance(value))
  }
})
for (const field of ['uid', 'careerInstanceId', 'catalogId']) test(`replacement cannot change ${field}`, () => {
  expectCode('IMMUTABLE_CAREER_IDENTITY', () => domain.validateCareerInstanceTransition(instance(), instance({ [field]: 'other' })))
})
test('archive/restore preserve identity, do not mutate inputs and are idempotent', () => {
  const before = Object.freeze(instance())
  const archived = domain.archiveCareerInstance(before)
  assert.equal(domain.isActiveCareerInstance(before), true)
  assert.equal(domain.isArchivedCareerInstance(before), false)
  assert.equal(domain.isActiveCareerInstance(archived), false)
  assert.equal(domain.isArchivedCareerInstance(archived), true)
  assert.deepEqual(plain(archived), instance({ lifecycle: 'archived' }))
  assert.deepEqual(plain(domain.archiveCareerInstance(archived)), plain(archived))
  const restored = domain.restoreCareerInstance(archived)
  assert.deepEqual(plain(restored), instance())
  assert.deepEqual(plain(domain.restoreCareerInstance(restored)), instance())
  assert.equal(domain.validateCareerInstanceTransition(before, archived), archived)
  assert.equal(before.lifecycle, 'active')
  assert.equal(archived.lifecycle, 'archived')
})
test('zero careers is a valid collection and catalog lookup returns null', () => {
  assert.deepEqual(plain(domain.validateCareerInstances('alice', [])), [])
  assert.equal(domain.resolveCareerInstanceByCatalog('alice', [], catalog), null)
})
test('one matching catalog is resolved, including an archived trajectory', () => {
  const archived = instance({ lifecycle: 'archived' })
  assert.equal(domain.resolveCareerInstanceByCatalog('alice', [archived], catalog), archived)
  assert.equal(domain.resolveCareerInstanceByCatalog('alice', [archived], 'utn-sistemas-2023'), null)
})
test('multiple universities resolve independently without mutating order', () => {
  const rows = Object.freeze([Object.freeze(instance()), Object.freeze(instance({ careerInstanceId: 'ci-02', catalogId: 'utn-sistemas-2023' }))])
  assert.equal(domain.resolveCareerInstanceByCatalog('alice', rows, 'utn-sistemas-2023'), rows[1])
  assert.equal(rows[0].careerInstanceId, 'ci-01')
})
for (const lifecycle of ['active', 'archived']) test(`duplicate catalog is rejected even when second instance is ${lifecycle}`, () => {
  const rows = [instance(), instance({ careerInstanceId: 'ci-02', lifecycle })]
  expectCode('DUPLICATE_CATALOG_INSTANCE', () => domain.resolveCareerInstanceByCatalog('alice', rows, catalog))
  expectCode('DUPLICATE_CATALOG_INSTANCE', () => domain.resolveCareerSelection('alice', rows, null))
})
test('duplicate instance ID across catalogs is rejected', () => {
  expectCode('DUPLICATE_CAREER_INSTANCE_ID', () => domain.validateCareerInstances('alice', [instance(), instance({ catalogId: 'utn-sistemas-2023' })]))
})
test('another owner is rejected, not selected or silently removed', () => {
  expectCode('CAREER_OWNER_MISMATCH', () => domain.resolveCareerSelection('alice', [instance({ uid: 'bob' })], 'ci-01'))
})
test('invalid collection/owner and malformed instance fail explicitly', () => {
  expectCode('INVALID_CAREER_COLLECTION', () => domain.validateCareerInstances('alice', null))
  expectCode('INVALID_ID', () => domain.validateCareerInstances('', []))
  expectCode('INVALID_CAREER_INSTANCE', () => domain.validateCareerInstances('alice', [null]))
  expectCode('INVALID_ID', () => domain.resolveCareerInstanceByCatalog('alice', [], ''))
})
for (const selected of [null, undefined, '', 'missing', catalog]) test(`selection ${String(selected)} has no fallback`, () => {
  assert.equal(domain.resolveCareerSelection('alice', [instance()], selected), null)
})
test('selection resolves only an active own instance and never replaces archived selection', () => {
  const rows = [instance(), instance({ careerInstanceId: 'ci-02', catalogId: 'utn-sistemas-2023', lifecycle: 'archived' })]
  assert.equal(domain.resolveCareerSelection('alice', rows, 'ci-01'), 'ci-01')
  assert.equal(domain.resolveCareerSelection('alice', rows, 'ci-02'), null)
  assert.equal(rows[1].lifecycle, 'archived')
})
for (const [firstState, secondState, expected] of [
  ['active', 'active', true], ['active', 'archived', false], ['archived', 'active', false], ['archived', 'archived', false],
]) test(`academic compatibility ${firstState}/${secondState}`, () => {
  assert.equal(domain.areCareerInstancesAcademicallyCompatible(instance({ lifecycle: firstState }),
    instance({ uid: 'bob', careerInstanceId: 'ci-b', lifecycle: secondState })), expected)
})
test('different catalog or absent instance is not academically compatible', () => {
  assert.equal(domain.areCareerInstancesAcademicallyCompatible(instance(), instance({ catalogId: 'utn-sistemas-2023' })), false)
  assert.equal(domain.areCareerInstancesAcademicallyCompatible(instance(), null), false)
})
test('changing navigation cannot alter compatibility or operability', () => {
  const a = instance(), b = instance({ uid: 'bob', careerInstanceId: 'ci-b' })
  for (const selected of [null, 'ci-01', 'missing']) {
    domain.resolveCareerSelection('alice', [a], selected)
    assert.equal(domain.areCareerInstancesAcademicallyCompatible(a, b), true)
    assert.equal(domain.isCareerParticipantOperational(binding(), catalog, a), true)
  }
})
test('resolved binding validates catalog/identity, survives archive and operates after restore', () => {
  const historic = Object.freeze(binding())
  const a = Object.freeze(instance())
  const archived = domain.archiveCareerInstance(a)
  assert.equal(domain.validateResolvedCareerBinding(historic, catalog, a), historic)
  assert.equal(domain.isCareerParticipantOperational(historic, catalog, a), true)
  assert.equal(domain.validateResolvedCareerBinding(historic, catalog, archived), historic)
  assert.equal(domain.isCareerParticipantOperational(historic, catalog, archived), false)
  assert.equal(domain.isCareerParticipantOperational(historic, catalog, domain.restoreCareerInstance(archived)), true)
  assert.deepEqual(historic, binding())
})
for (const bindingState of ['unresolved', 'catalog-unavailable']) test(`${bindingState} preserves absence without fabricating a binding`, () => {
  const value = binding({ bindingState, careerInstanceId: null })
  assert.equal(domain.validateCareerBinding(value), value)
  assert.equal(domain.isCareerParticipantOperational(value, catalog, null), false)
  assert.equal(domain.isCareerParticipantOperational(value, catalog, instance()), false)
  expectCode('INVALID_BINDING', () => domain.validateResolvedCareerBinding(value, catalog, instance()))
})
for (const [label, value] of [
  ['missing instance', null], ['another UID', instance({ uid: 'bob' })],
  ['another catalog', instance({ catalogId: 'utn-sistemas-2023' })],
  ['another instance ID', instance({ careerInstanceId: 'ci-other' })],
]) test(`resolved binding with ${label}: not operational and cannot be validated as a new resolution`, () => {
  assert.equal(domain.isCareerParticipantOperational(binding(), catalog, value), false)
  expectCode('INVALID_BINDING', () => domain.validateResolvedCareerBinding(binding(), catalog, value))
})
test('one inactive participant never changes another compatible participant', () => {
  const a = domain.archiveCareerInstance(instance())
  const b = instance({ uid: 'bob', careerInstanceId: 'ci-b' })
  const bb = binding({ uid: 'bob', careerInstanceId: 'ci-b' })
  assert.equal(domain.isCareerParticipantOperational(binding(), catalog, a), false)
  assert.equal(domain.isCareerParticipantOperational(bb, catalog, b), true)
})
for (const changes of [
  { uid: '' }, { bindingState: 'active' }, { careerInstanceId: null },
  { bindingState: 'unresolved' }, { bindingState: 'catalog-unavailable' }, { operational: true },
]) test(`malformed binding rejected ${JSON.stringify(changes)}`, () => {
  expectCode('INVALID_BINDING', () => domain.isCareerParticipantOperational(binding(changes), catalog, instance()))
})
test('invalid plan catalog and corrupt instance are errors, not eligibility results', () => {
  expectCode('INVALID_ID', () => domain.isCareerParticipantOperational(binding(), '', instance()))
  expectCode('INVALID_CAREER_INSTANCE', () => domain.isCareerParticipantOperational(binding(), catalog, instance({ lifecycle: 'broken' })))
})
