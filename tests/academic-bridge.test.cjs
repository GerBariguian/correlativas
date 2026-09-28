const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const domain = vm.createContext({})
vm.runInContext(fs.readFileSync('src/userDataAuthorityLogic.js', 'utf8').replace(/export /g, ''), domain)
const control = (patch = {}) => ({ schemaVersion: 1, generation: 'multicareer-v1', authority: 'legacy', phase: 'pending',
  origin: 'legacy', manifestId: 'alice', updatedAt: { seconds: 1, nanoseconds: 0 }, ...patch })
const resolve = (c, profile, instances) => domain.resolveUserDataAuthority('alice', c, profile, instances)
const instances = [{ uid: 'alice', careerInstanceId: 'opaque', catalogId: 'cat', lifecycle: 'active' },
  { uid: 'alice', careerInstanceId: 'archived', catalogId: 'other', lifecycle: 'archived' },
  { uid: 'bob', careerInstanceId: 'foreign', catalogId: 'third', lifecycle: 'active' }]
test('only absent control falls back to legacy', () => {
  assert.equal(resolve(null, { activeCareerId: 'cat' }).catalogId, 'cat')
  for (const value of [undefined, {}, false]) assert.equal(resolve(value).authority, 'invalid')
})
for (const [authority, phase, writable] of [['legacy', 'pending', true], ['frozen', 'copying', false],
  ['frozen', 'validated', false], ['instances', 'complete', true], ['instances', 'blocked', false]]) {
  test(`authority ${authority}/${phase}`, () => {
    const result = resolve(control({ authority, phase }))
    assert.equal(result.authority, authority)
    assert.equal(result.capabilities.academicWrite, writable)
    assert.equal(result.capabilities.legacySocial, authority === 'legacy' && writable)
  })
}
for (const patch of [{ schemaVersion: 2 }, { authority: 'other' }, { authority: '__proto__' }, { authority: 'constructor' }, { phase: 'complete' }, { origin: 'other' },
  { manifestId: 'bob' }, { generation: 'other' }, { unexpected: true }, { updatedAt: { seconds: 1, nanoseconds: -1 } }]) {
  test(`invalid authority fails closed: ${JSON.stringify(patch)}`, () => {
    assert.equal(resolve(control(patch)).authority, 'invalid')
    assert.equal(resolve(control(patch)).capabilities.academicWrite, false)
  })
}
for (const id of [null, undefined, 'missing', 'archived', 'foreign']) {
  test(`instance selection ${id} never defaults`, () => {
    const result = resolve(control({ authority: 'instances', phase: 'complete' }), { activeCareerId: 'cat', activeCareerInstanceId: id }, instances)
    assert.equal(result.activeCareerInstanceId, null)
    assert.equal(result.catalogId, null)
    assert.equal(domain.academicScope(result, 'cat'), null)
  })
}
test('instance scope identifies source, not legacy navigation', () => {
  const context = resolve(control({ authority: 'instances', phase: 'complete' }), { activeCareerId: 'wrong', activeCareerInstanceId: 'opaque' }, instances)
  const scope = domain.academicScope(context, 'wrong')
  assert.equal(scope.catalogId, 'cat')
  assert.equal(domain.academicScopeKey(scope), 'alice:instances:opaque')
})
test('freeze and invalid controls expose no writable scope', () => {
  for (const c of [control({ authority: 'frozen', phase: 'copying' }), {}]) assert.equal(domain.academicScope(resolve(c), 'cat'), null)
})

function listenerFixture() {
  const listeners = new Map(), seen = [], errors = [], user = { uid: 'alice' }
  const { academicBridgeRepository } = require('./academic-bridge-harness.cjs')({
    doc: (_db, ...parts) => parts.join('/'), collection: (_db, ...parts) => parts.join('/'),
    onSnapshot(path, options, next, error) { const row = { next, error, active: true }; listeners.set(path, row); return () => { row.active = false } },
  })
  const repository = academicBridgeRepository({ db: {}, auth: { currentUser: user } }, user.uid)
  const stop = repository.subscribeContext(context => seen.push(context), error => errors.push(error))
  const emit = (path, data, fromCache = false) => listeners.get(path).next({ metadata: { fromCache, hasPendingWrites: false }, exists: () => data !== null, data: () => data })
  return { listeners, seen, errors, stop, emit }
}
test('cached control suspends capabilities; server confirmation restores the correct authority', () => {
  const f = listenerFixture()
  f.emit('users/alice', { activeCareerId: 'cat' }); f.emit('migrationUsers/alice', null)
  assert.equal(f.seen.at(-1).authority, 'legacy')
  f.emit('migrationUsers/alice', null, true)
  assert.equal(f.seen.at(-1).authority, 'invalid')
  f.emit('users/alice', { activeCareerId: 'other' })
  assert.equal(f.seen.at(-1).capabilities.academicWrite, false)
  f.emit('migrationUsers/alice', control({ authority: 'frozen', phase: 'copying' }))
  assert.equal(f.seen.at(-1).authority, 'frozen'); f.stop()
})
test('terminal authority listener failure cannot be reopened by another listener or a late callback', () => {
  const f = listenerFixture()
  f.emit('users/alice', { activeCareerId: 'cat' }); f.emit('migrationUsers/alice', null)
  f.listeners.get('migrationUsers/alice').error(new Error('permission-denied'))
  const count = f.seen.length
  f.emit('users/alice', { activeCareerId: 'other' }); f.emit('migrationUsers/alice', control({ authority: 'instances', phase: 'complete' }))
  assert.equal(f.errors.length, 1); assert.equal(f.seen.length, count)
  f.stop(); assert.ok([...f.listeners.values()].every(row => !row.active))
})
