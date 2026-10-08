const fs = require('node:fs')
const path = require('node:path')
function load(sdk) {
  const api = require('./academic-bridge-harness.cjs')(sdk)
  for (const file of ['planningLogic.js', 'academicOnboardingController.js', 'services/academicOnboarding.js']) {
    const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')
    const names = [...source.matchAll(/export (?:async )?(?:function|const) (\w+)/g)].map(m => m[1])
    Object.assign(api, new Function(...Object.keys(api), source.replace(/^import .*$/gm, '').replace(/export /g, '') + `;return {${names.join(',')}}`)(...Object.values(api)))
  }
  return api
}
const time = { seconds: 1700000000, nanoseconds: 0 }
const career = { id: 'catalog', subjects: [{ code: 'A', prereqs: [] }, { code: 'B', prereqs: [] }, { code: 'C', prereqs: [] }] }
const control = authority => ({ schemaVersion: 1, generation: 'multicareer-v1', authority,
  phase: authority === 'instances' ? 'complete' : authority === 'frozen' ? 'copying' : 'pending', origin: 'legacy', manifestId: 'alice', updatedAt: time })
const instance = { schemaVersion: 1, catalogId: 'catalog', lifecycle: 'active', createdAt: time, updatedAt: time, archivedAt: null }
function fixture(model = 'legacy', initial = { A: 'Pendiente', OLD: 'Regularizada' }) {
  const scope = { uid: 'alice', model, id: model === 'legacy' ? 'catalog' : 'ix', catalogId: 'catalog' }
  const target = model === 'legacy' ? 'users/alice/careers/catalog' : 'users/alice/careerInstances/ix/academic/progress'
  const data = new Map([['migrationUsers/alice', control(model)], ['users/alice/careerInstances/ix', instance]])
  if (initial !== null) data.set(target, model === 'legacy' ? { statusMap: initial, updatedAt: time } : { schemaVersion: 1, statusMap: initial, revision: 1, updatedAt: time })
  let version = 0, live = true
  const f = { scope, target, data, reads: [], writes: [], transactions: 0, auth: { currentUser: { uid: 'alice' } },
    change(path, value) { data.set(path, structuredClone(value)); version++ }, invalidate() { live = false } }
  const snap = p => { const value = structuredClone(data.get(p)); return { exists: () => value !== undefined, data: () => value } }
  const sdk = {
    doc: (_db, ...parts) => parts.join('/'), serverTimestamp: () => time,
    async getDocFromServer(p) { f.reads.push(p); if (f.readError) throw f.readError; const result = snap(p); await f.afterRead?.(p); return result },
    async runTransaction(_db, callback) {
      f.transactions++
      for (let attempt = 0; attempt < 5; attempt++) {
        const before = version, pending = []
        const result = await callback({
          async get(p) { f.reads.push(p); if (f.readError) throw f.readError; const result = snap(p); await f.afterRead?.(p); return result },
          set(p, value, options) { pending.push([p, structuredClone(value), options]) },
        })
        if (f.beforeCommit) { const fn = f.beforeCommit; f.beforeCommit = null; await fn() }
        if (version !== before) {
          // Optional Rules-first rejection of a stale revision. The default
          // still simulates SDK retry followed by the application's CAS check.
          if (f.concurrentPermission) throw Object.assign(Error('stale revision denied by Rules'), { code: 'permission-denied' })
          continue
        }
        if (f.writeError) throw f.writeError
        for (const [p, value, options] of pending) data.set(p, options ? { ...data.get(p), ...value } : value)
        f.writes.push(...pending); if (pending.length) version++
        return result
      }
      throw Error('transaction retries exhausted')
    },
  }
  f.api = load(sdk)
  const assertLive = () => { if (!live) throw Error('ACADEMIC_SCOPE_CHANGED'); if (f.auth.currentUser !== user) throw Error('ACADEMIC_SESSION_CHANGED') }
  const user = f.auth.currentUser
  const repository = model === 'legacy' ? f.api.legacyOnboardingRepository({ db: {}, auth: f.auth }, scope, career, assertLive)
    : f.api.academicBridgeRepository({ db: {}, auth: f.auth }, 'alice')
  f.controller = () => f.api.createAcademicOnboardingController({ scope, subjects: career.subjects, assertLive,
    load: () => model === 'legacy' ? repository.load() : repository.loadProgress(scope),
    save: (changes, expected) => model === 'legacy' ? repository.save(changes) : repository.saveOnboardingProgress(scope, changes, expected, assertLive) })
  return f
}
module.exports = { load, fixture, career, control, instance, time }
