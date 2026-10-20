import './test-source-loader.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { academicReadRepository } from './academicReadRepository.mjs'
import { contractFiles } from './contractImports.mjs'
import { assertModule } from './importPolicy.mjs'
import { readFileSync } from 'node:fs'
const stamp = { seconds: 1700000000, nanoseconds: 0 }
const control = uid => ({ schemaVersion: 1, generation: 'multicareer-v1', authority: 'instances', phase: 'complete', origin: 'new', manifestId: uid, updatedAt: stamp })
const metadata = (catalogId, archived = false) => ({ schemaVersion: 1, catalogId, lifecycle: archived ? 'archived' : 'active', createdAt: stamp, updatedAt: stamp, archivedAt: archived ? stamp : null })
const scope = (uid = 'alice', model = 'instances', id = 'instance-a', catalogId = 'catalog-a') => ({ uid, model, id, catalogId })
function fixture(uid = 'alice') {
  let current = uid
  const docs = new Map([[`migrationUsers/${uid}`, control(uid)], [`users/${uid}/careerInstances/instance-a`, metadata('catalog-a')], [`users/${uid}/careerInstances/instance-b`, metadata('catalog-b')]])
  const seen = []
  const repo = academicReadRepository({ uid, currentUid: () => current,
    readDocument: async path => { seen.push(path); return docs.get(path) ?? null },
    loadProgress: async s => { seen.push(JSON.stringify(s)); return { statusMap: { [s.id]: 'Aprobada' }, revision: 1 } },
  })
  return { repo, docs, seen, switchUser: value => { current = value } }
}
test('complete immutable identity and isolation across owners, instances, catalogs and models', async () => {
  const f = fixture()
  assert.deepEqual(Object.keys(f.repo), ['readProgress'])
  for (const s of [scope(), scope('alice', 'instances', 'instance-b', 'catalog-b')]) {
    const result = await f.repo.readProgress(s)
    assert.equal(result.state, 'loaded'); assert.deepEqual(result.scope, s)
    assert.deepEqual(Object.keys(result.progress.statusMap), [s.id]); assert.ok(Object.isFrozen(result.scope))
  }
  f.seen.length = 0
  assert.equal((await f.repo.readProgress(scope('bob'))).state, 'blocked'); assert.equal(f.seen.length, 0)
  assert.equal((await f.repo.readProgress(scope('alice', 'instances', 'instance-a', 'catalog-b'))).state, 'blocked')
  assert.equal((await f.repo.readProgress(scope('alice', 'legacy', 'catalog-a', 'catalog-a'))).state, 'blocked')
  const b = fixture('bob'); assert.equal((await b.repo.readProgress(scope('bob'))).state, 'loaded')
  assert.ok(b.seen.every(path => !path.includes('alice')))
})
test('absent, archived, blocked, malformed and read failures stay distinct', async () => {
  const f = fixture()
  f.docs.delete('users/alice/careerInstances/instance-a')
  assert.equal((await f.repo.readProgress(scope())).state, 'absent')
  f.docs.set('users/alice/careerInstances/instance-a', metadata('catalog-a', true))
  assert.equal((await f.repo.readProgress(scope())).state, 'archived')
  f.docs.set('migrationUsers/alice', { ...control('alice'), phase: 'blocked' })
  assert.equal((await f.repo.readProgress(scope())).state, 'blocked')
  f.docs.set('migrationUsers/alice', control('alice'))
  f.docs.set('users/alice/careerInstances/instance-a', {})
  assert.equal((await f.repo.readProgress(scope())).state, 'error')
  f.switchUser('bob'); assert.equal((await f.repo.readProgress(scope())).code, 'C2_SESSION_CHANGED')
})
test('legacy absence is explicit; errors never become empty progress', async () => {
  const s = scope('alice', 'legacy', 'catalog-a', 'catalog-a')
  for (const [loadProgress, expected] of [[async () => ({ statusMap: null, revision: null }), 'absent'], [async () => { throw Error('permission-denied') }, 'error'], [async () => ({ statusMap: {}, revision: null }), 'loaded']]) {
    const repo = academicReadRepository({ uid: 'alice', currentUid: () => 'alice', readDocument: async () => null, loadProgress })
    assert.equal((await repo.readProgress(s)).state, expected)
  }
})
test('mid-read authority change or session change never publishes data', async () => {
  for (const sessionChange of [false, true]) {
    let n = 0, uid = 'alice'
    const repo = academicReadRepository({ uid, currentUid: () => uid,
      readDocument: async () => ++n === 1 ? null : { ...control('alice'), phase: 'blocked' },
      loadProgress: async () => { if (sessionChange) uid = 'bob'; return { statusMap: {}, revision: null } },
    })
    assert.equal((await repo.readProgress(scope('alice', 'legacy', 'catalog-a', 'catalog-a'))).state, sessionChange ? 'error' : 'blocked')
  }
})
test('audited contract graph has no initialization, storage or product imports', () => {
  for (const file of contractFiles) {
    assertModule(file)
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(source, /initializeApp|initializeAuth|initializeFirestore|localStorage|sessionStorage|indexedDB|from\s+['"].*firebase(?:Config|Runtime)?['"]/)
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      if (match[1] === 'firebase/firestore') continue
      const resolved = new URL(match[1].endsWith('.js') ? match[1] : match[1] + '.js', 'file:///' + file).pathname.replace(/^\/([A-Za-z]:)/, '$1')
      assert.ok(contractFiles.includes(decodeURIComponent(resolved)), resolved)
    }
  }
  assert.throws(() => assertModule('C:/repo/src/firebase.js'), /OUTSIDE/)
})
