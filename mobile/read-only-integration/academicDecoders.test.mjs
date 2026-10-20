import './test-source-loader.mjs'
import { registerHooks } from 'node:module'
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'firebase/firestore') return { url: new URL('./test-firestore.mjs', import.meta.url).href, shortCircuit: true }
  return next(specifier, context)
} })
const { bindAcademicReads } = await import('./academicReadAdapter.mjs')
const { documents, reads } = await import('./test-firestore.mjs')
const { test } = await import('node:test')
const assert = (await import('node:assert/strict')).default
const t = { seconds: 1700000000, nanoseconds: 0 }
const legacy = { uid: 'lab-legacy', model: 'legacy', id: 'catalog-a', catalogId: 'catalog-a' }
const instances = { uid: 'lab-instances', model: 'instances', id: 'instance-a', catalogId: 'catalog-a' }
function repo(uid) { return bindAcademicReads({ db: {}, auth: { currentUser: { uid } }, uid, assertLive() {} }) }
test('real legacy decoder: absent, valid, bad revision, invalid statuses, read failure', async () => {
  documents.clear(); reads.length = 0
  const r = repo(legacy.uid), path = 'users/lab-legacy/careers/catalog-a'
  assert.equal((await r.readProgress(legacy)).state, 'absent')
  documents.set(path, { statusMap: { FICTIONAL: 'Aprobada' }, writeRevision: 3, updatedAt: t })
  assert.equal((await r.readProgress(legacy)).state, 'loaded')
  for (const bad of [{ statusMap: {}, writeRevision: 0 }, { statusMap: { FICTIONAL: 'bad' } }, {}, new Error('unavailable')]) {
    documents.set(path, bad); assert.equal((await r.readProgress(legacy)).state, 'error')
  }
  assert.ok(reads.every(path => path.includes('lab-legacy')))
})
test('real instance decoder: strict schema and revision, no cross model/career fallback', async () => {
  documents.clear(); reads.length = 0
  documents.set('migrationUsers/lab-instances', { schemaVersion: 1, generation: 'multicareer-v1', authority: 'instances', phase: 'complete', origin: 'new', manifestId: 'lab-instances', updatedAt: t })
  documents.set('users/lab-instances/careerInstances/instance-a', { schemaVersion: 1, catalogId: 'catalog-a', lifecycle: 'active', createdAt: t, updatedAt: t, archivedAt: null })
  const path = 'users/lab-instances/careerInstances/instance-a/academic/progress', r = repo(instances.uid)
  assert.equal((await r.readProgress(instances)).state, 'absent')
  const data = { schemaVersion: 1, revision: 7, statusMap: { FICTIONAL: 'Regularizada' }, updatedAt: t }
  documents.set(path, data)
  assert.deepEqual((await r.readProgress(instances)).progress, { statusMap: data.statusMap, revision: 7 })
  for (const bad of [{ ...data, revision: 0 }, { ...data, schemaVersion: 2 }, { ...data, statusMap: { FICTIONAL: 'bad' } }, { ...data, extra: true }]) {
    documents.set(path, bad); assert.equal((await r.readProgress(instances)).state, 'error')
  }
  assert.equal((await r.readProgress({ ...instances, id: 'instance-b' })).state, 'absent')
  assert.ok(reads.every(path => path.includes('lab-instances') && !path.includes('/careers/')))
})
