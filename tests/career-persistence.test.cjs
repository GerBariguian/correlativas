const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./career-persistence-harness.cjs')
const api = load()
const t = { seconds: 100, nanoseconds: 10 }
const value = () => ({ schemaVersion: 1, catalogId: 'uade-informatica', lifecycle: 'active', createdAt: t, updatedAt: t, archivedAt: null })
test('metadata mapper returns separate domain identity and stored metadata', () => {
  const input = value(), result = api.decodeCareerMetadata('a', 'opaque', input)
  assert.deepEqual(result.instance, { uid: 'a', careerInstanceId: 'opaque', catalogId: input.catalogId, lifecycle: 'active' })
  assert.deepEqual(result.metadata, input)
  assert.notEqual(result.metadata, input)
})
for (const [name, patch] of Object.entries({ extra: { sharing: {} }, schema: { schemaVersion: 2 }, catalog: { catalogId: '' },
  time: { updatedAt: null }, chronology: { createdAt: { seconds: 101, nanoseconds: 0 } },
  archived: { lifecycle: 'archived' }, active: { archivedAt: t }, lifecycle: { lifecycle: 'deleted' } })) {
  test(`metadata mapper rejects ${name}`, () => assert.throws(() => api.decodeCareerMetadata('a', 'opaque', { ...value(), ...patch }), { code: 'INVALID_CAREER_DOCUMENT' }))
}
test('membership mapper exact schema and safe path', () => {
  assert.equal(api.decodeCatalogMembership({ schemaVersion: 1, careerInstanceId: 'opaque' }), 'opaque')
  for (const data of [null, {}, { schemaVersion: 1, careerInstanceId: 'a/b' }, { schemaVersion: 1, careerInstanceId: 'opaque', extra: true }]) {
    assert.throws(() => api.decodeCatalogMembership(data), { code: 'INVALID_CAREER_DOCUMENT' })
  }
})
test('stable persistence errors discard SDK messages and sensitive details', () => {
  for (const [from, to] of [['permission-denied', 'PERMISSION_DENIED'], ['aborted', 'PERSISTENCE_CONFLICT'],
    ['unavailable', 'PERSISTENCE_UNAVAILABLE'], ['unknown', 'PERSISTENCE_FAILED'], ['DUPLICATE_CATALOG_INSTANCE', 'DUPLICATE_CATALOG_INSTANCE']]) {
    const error = api.mapCareerPersistenceError({ code: from, message: 'secret/path/token', details: 'secret' })
    assert.equal(error.code, to); assert.equal(error.message, to); assert.equal(error.details, undefined)
  }
})
test('repository rejects wrong session before any SDK operation', () => {
  assert.throws(() => api.careerInstancesRepository({ db: {}, auth: { currentUser: { uid: 'b' } } }, 'a'), { code: 'CAREER_SESSION_CHANGED' })
})
test('session change during a transaction cannot schedule writes', async () => {
  const auth = { currentUser: { uid: 'a' } }, writes = []
  const sdk = { collection: (_, ...parts) => parts.join('/'), doc: (_, id = 'opaque') => ({ id }),
    serverTimestamp: () => t, runTransaction: async (_, callback) => callback({ get: async () => {
      auth.currentUser = { uid: 'a' }; return { exists: () => false }
    }, set: (...args) => writes.push(args) }) }
  const repo = load(sdk).careerInstancesRepository({ db: {}, auth }, 'a')
  await assert.rejects(repo.create('catalog'), { code: 'CAREER_SESSION_CHANGED' })
  assert.equal(writes.length, 0)
})
test('invalid inputs fail before network and API contains no delete or generic write', async () => {
  const sdk = { collection: () => 'instances', doc: () => assert.fail('invalid path reached SDK'),
    getDocFromServer: () => assert.fail('invalid input reached network') }
  const repo = load(sdk).careerInstancesRepository({ db: {}, auth: { currentUser: { uid: 'a' } } }, 'a')
  await assert.rejects(repo.create('bad/path'), { code: 'INVALID_INPUT' })
  await assert.rejects(repo.get(''), { code: 'INVALID_INPUT' })
  assert.deepEqual(Object.keys(repo).sort(), ['archiveMetadata', 'create', 'get', 'getByCatalog', 'list', 'restoreMetadata'].sort())
})
for (const [name, winner, expected] of [
  ['coherent winner', value(), 'DUPLICATE_CATALOG_INSTANCE'],
  ['dangling index', null, 'PERMISSION_DENIED'],
  ['wrong catalog', { ...value(), catalogId: 'other' }, 'PERMISSION_DENIED'],
  ['invalid metadata', { schemaVersion: 99 }, 'PERMISSION_DENIED'],
]) test(`create denial reconciliation is read-only: ${name}`, async () => {
  let attempts = 0
  const sdk = {
    collection: (_, ...parts) => parts.join('/'),
    doc: (_, ...parts) => ({ id: parts.at(-1) || 'generated', path: parts.join('/') }),
    runTransaction: async (_, callback) => {
      if (++attempts === 1) throw { code: 'permission-denied', message: 'do not expose' }
      return callback({ get: async ref => ref.path.includes('catalogMemberships')
        ? { exists: () => true, data: () => ({ schemaVersion: 1, careerInstanceId: 'winner' }) }
        : { id: ref.id, exists: () => winner !== null, data: () => winner },
      set: () => assert.fail('reconciliation must not write'), update: () => assert.fail('reconciliation must not write') })
    },
  }
  const r = load(sdk).careerInstancesRepository({ db: {}, auth: { currentUser: { uid: 'a' } } }, 'a')
  await assert.rejects(r.create('uade-informatica'), { code: expected, message: expected })
  assert.equal(attempts, 2)
})
