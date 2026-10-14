// Regression of the reproduced lost update: real writers, synthetic users, loopback only.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const sdk = require('firebase/firestore')
const h = require('./helpers.cjs')
const { load, career } = require('../academic-onboarding-persistence-harness.cjs')
const api = load(sdk)
function ordinary(db, auth, old = false, sharing = false, trace = null) {
  const source = fs.readFileSync(old ? 'tests/rules/fixtures/planning-before-safe-legacy.js.txt' : 'src/services/planning.js', 'utf8').replace(/^\uFEFF/, '').replace(/^import .*$/gm, '').replace(/export /g, '')
  const deps = { ...api, ...sdk, db, auth, careers: [{ ...career, initialStatus: {} }], derivePlanningSnapshot: api.derivePlanningSnapshot, snapshotCompatible: api.snapshotCompatible }
  if (trace) deps.runTransaction = (database, callback) => sdk.runTransaction(database, async tx => {
    const attempt = { reads: [], writes: [] }; trace.push(attempt)
    try {
      return await callback({
        get: async ref => { const snap = await tx.get(ref); if (ref.path.includes('/careers/')) attempt.reads.push({ path: ref.path, revision: snap.data()?.writeRevision ?? 0 }); return snap },
        set: (ref, data, options) => { attempt.writes.push({ path: ref.path, revision: data.writeRevision, codes: Object.keys(data.statusMap || {}) }); return tx.set(ref, data, options) },
      })
    } catch (e) { attempt.callbackError = e.code || e.message; throw e }
  })
  return new Function(...Object.keys(deps), source + (sharing ? '; return setPlanningSharing' : '; return savePlanningProgress'))(...Object.values(deps))
}
const patch = (code, status, expected = { exists: false }) => ({ type: 'patch', operations: [{ code, operation: 'set', status, expected }] })
for (const rules of ['firestore.migration-users-hotfix.rules', 'firestore.rules', ...require('../../scripts/prepare-legacy-write-revision.cjs').artifacts().map(a => a.file)]) {
  test(`legacy mixed writers: ${rules}`, async t => {
    const scenario = (name, callback) => t.test(name, { skip: process.env.LEGACY_RACE_ISOLATED === '1' && !/three stale|same subject:/.test(name) }, callback)
    const env = await h.initialize(fs.readFileSync(rules, 'utf8'))
    try {
      const a = env.authenticatedContext('alice', h.claims('alice')).firestore()
      const b = env.authenticatedContext('alice', h.claims('alice')).firestore()
      const auth = { currentUser: { uid: 'alice' } }
      const path = 'users/alice/careers/catalog'
      const read = async () => (await sdk.getDocFromServer(sdk.doc(a, path))).data().statusMap
      for (const first of ['onboarding', 'ordinary']) await scenario(`${first} first`, async t => {
        await env.clearFirestore()
        const initial = { A: 'Pendiente', OLD: 'Regularizada' }
        await h.seed(env, { 'users/alice': { activeCareerId: 'catalog', updatedAt: h.TIME }, [path]: { statusMap: initial, updatedAt: h.TIME } })
        const stale = { ...await read(), A: 'Cursando' }
        const scope = { uid: 'alice', model: 'legacy', id: 'catalog', catalogId: 'catalog' }
        const repo = api.legacyOnboardingRepository({ db: b, auth }, scope, career, () => {})
        const controller = api.createAcademicOnboardingController({ scope, subjects: career.subjects, load: repo.load, save: repo.save, assertLive() {} })
        const draft = api.decideOnboardingSubjects(await controller.load(), ['B'], 'Aprobada')
        const saveA = () => ordinary(a, auth)('alice', 'catalog', patch('A', 'Cursando', { exists: true, status: initial.A }))
        const saveB = () => controller.confirm(draft)
        t.diagnostic(JSON.stringify({ initial, staleA: stale, decisionsB: draft.decisions }))
        await (first === 'onboarding' ? saveB() : saveA())
        const afterFirst = await read()
        assert.deepEqual(afterFirst, first === 'onboarding' ? { ...initial, B: 'Aprobada' } : stale)
        await (first === 'onboarding' ? saveA() : saveB())
        const afterSecond = await read()
        const expected = { ...stale, B: 'Aprobada' }
        assert.deepEqual(afterSecond, expected)
        t.diagnostic(JSON.stringify({ first, afterFirst, afterSecond, onboardingDecisionPreserved: afterSecond.B === 'Aprobada' }))
      })
      const save = ordinary(a, auth), saveOther = ordinary(b, auth)
      const seed = async (statusMap = {}) => {
        await env.clearFirestore()
        await h.seed(env, { 'users/alice': { activeCareerId: 'catalog', updatedAt: h.TIME }, [path]: { statusMap, updatedAt: h.TIME } })
      }
      await scenario('three stale tabs change independent subjects without loss', async t => {
        await seed({ OLD: 'Regularizada' })
        const trace = []
        const c = env.authenticatedContext('alice', h.claims('alice')).firestore()
        const results = await Promise.allSettled([ordinary(a, auth, false, false, trace)('alice', 'catalog', patch('A', 'Pendiente')), ordinary(b, auth, false, false, trace)('alice', 'catalog', patch('B', 'Aprobada')), ordinary(c, auth, false, false, trace)('alice', 'catalog', patch('C', 'Cursando'))])
        const stored = (await sdk.getDocFromServer(sdk.doc(a, path))).data()
        t.diagnostic(JSON.stringify({ trace, outcomes: results.map(r => r.status === 'fulfilled' ? 'fulfilled' : r.reason.code || r.reason.message), stored }))
        assert.equal(results.filter(r => r.status === 'fulfilled').length, 3)
        assert.deepEqual(await read(), { OLD: 'Regularizada', A: 'Pendiente', B: 'Aprobada', C: 'Cursando' })
      })
      await scenario('same subject: one winner, no overwrite; Pending is registered', async () => {
        await seed()
        const results = await Promise.allSettled([save('alice', 'catalog', patch('A', 'Pendiente')), saveOther('alice', 'catalog', patch('A', 'Aprobada'))])
        assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
        assert.match(results.find(r => r.status === 'rejected').reason.message, /CONFLICT/)
        assert.ok(['Pendiente', 'Aprobada'].includes((await read()).A))
      })
      await scenario('explicit delete conflicts when stale and preserves unrelated keys', async () => {
        await seed({ A: 'Pendiente', OLD: 'Regularizada' })
        const removal = { type: 'patch', operations: [{ code: 'A', operation: 'delete', expected: { exists: true, status: 'Pendiente' } }] }
        await saveOther('alice', 'catalog', patch('A', 'Cursando', { exists: true, status: 'Pendiente' }))
        await assert.rejects(save('alice', 'catalog', removal), /CONFLICT/)
        removal.operations[0].expected.status = 'Cursando'
        await save('alice', 'catalog', removal)
        assert.deepEqual(await read(), { OLD: 'Regularizada' })
      })
      await scenario('reset has whole-document precondition including server timestamp', async () => {
        await seed({ A: 'Aprobada' })
        const readDocument = async () => {
          const snap = await sdk.getDocFromServer(sdk.doc(a, path)), d = snap.data()
          return { exists: snap.exists(), writeRevision: d.writeRevision ?? 0, statusMap: d.statusMap, updatedAt: { seconds: d.updatedAt.seconds, nanoseconds: d.updatedAt.nanoseconds } }
        }
        const reset = { type: 'reset', expected: await readDocument(), statusMap: {} }
        await saveOther('alice', 'catalog', patch('B', 'Pendiente'))
        await assert.rejects(save('alice', 'catalog', reset), /CONFLICT/)
        assert.deepEqual(await read(), { A: 'Aprobada', B: 'Pendiente' })
        reset.expected = await readDocument()
        await save('alice', 'catalog', reset)
        assert.deepEqual(await read(), {})
      })
      for (const consentVersion of [1, 2]) await scenario('merged snapshot respects consent ' + consentVersion, async () => {
        await seed()
        await h.seed(env, { 'planningSharing/alice': { enabled: true, sharedCareerId: 'catalog', consentVersion, updatedAt: h.TIME } })
        await saveOther('alice', 'catalog', patch('B', 'Regularizada'))
        const confirmed = await save('alice', 'catalog', patch('A', 'Aprobada'))
        const snapshot = (await sdk.getDocFromServer(sdk.doc(a, 'planningSnapshots/alice/careers/catalog'))).data()
        assert.deepEqual(confirmed.statusMap, { B: 'Regularizada', A: 'Aprobada' })
        assert.deepEqual(snapshot.approvedCodes, ['A'])
        assert.equal(snapshot.schemaVersion, consentVersion)
        assert.equal(snapshot.sourceUpdatedAt.seconds, confirmed.updatedAt.seconds)
        assert.equal(snapshot.sourceUpdatedAt.nanoseconds, confirmed.updatedAt.nanoseconds)
        if (consentVersion === 1) assert.equal('pendingFinalCodes' in snapshot, false)
        else assert.deepEqual(snapshot.pendingFinalCodes, ['B'])
      })
      if (rules.startsWith('rules/')) {
        const target = sdk.doc(a, path)
        const denied = async operation => {
          let error
          try { await operation() } catch (e) { error = e }
          assert.equal(error?.code, 'permission-denied')
          assert.doesNotMatch(error.message, /1000 expressions|service call|resource.exhaust/i)
        }
        await scenario('first write enrolls; old real writer, replacement, merge and DELETE denied', async () => {
          await seed({ A: 'Pendiente' })
          const result = await save('alice', 'catalog', patch('B', 'Aprobada'))
          assert.equal(result.writeRevision, 1)
          const before = (await sdk.getDocFromServer(target)).data()
          await denied(() => ordinary(b, auth, true)('alice', 'catalog', { A: 'Cursando' }))
          await denied(() => sdk.setDoc(target, { statusMap: {}, updatedAt: sdk.serverTimestamp() }))
          await denied(() => sdk.setDoc(target, { statusMap: {} }, { mergeFields: ['statusMap'] }))
          await denied(() => sdk.deleteDoc(target))
          for (const writeRevision of [sdk.deleteField(), 1, 0, 3, null, '2', 2.5]) {
            await denied(() => sdk.updateDoc(target, { writeRevision, updatedAt: sdk.serverTimestamp() }))
          }
          assert.deepEqual((await sdk.getDocFromServer(target)).data(), before)
          await save('alice', 'catalog', patch('C', 'Cursando'))
          assert.equal((await sdk.getDocFromServer(target)).data().writeRevision, 2)
        })
        await scenario('unprotected old writer allowed only in transition; strict protects absent revision immediately', async () => {
          await seed({ A: 'Pendiente' })
          const write = () => ordinary(b, auth, true)('alice', 'catalog', { A: 'Cursando' })
          if (rules.includes('transition')) await write()
          else await denied(write)
          await save('alice', 'catalog', patch('B', 'Aprobada'))
          assert.equal((await sdk.getDocFromServer(target)).data().writeRevision, 1)
        })
        await scenario('sharing initializes with revision and preserves existing protected progress', async () => {
          await env.clearFirestore()
          await h.seed(env, { 'users/alice': { activeCareerId: 'catalog', updatedAt: h.TIME } })
          await ordinary(a, auth, false, true)('alice', 'catalog', true)
          assert.equal((await sdk.getDocFromServer(target)).data().writeRevision, 1)
          await save('alice', 'catalog', patch('A', 'Aprobada'))
          await ordinary(a, auth, false, true)('alice', 'catalog', false)
          assert.equal((await sdk.getDocFromServer(target)).data().writeRevision, 2)
        })
        await scenario('protected consent requires atomic snapshot; private reads remain isolated', async () => {
          await seed()
          await ordinary(a, auth, false, true)('alice', 'catalog', true)
          await save('alice', 'catalog', patch('A', 'Aprobada'))
          const before = (await sdk.getDocFromServer(target)).data()
          await denied(() => sdk.updateDoc(target, { statusMap: { B: 'Aprobada' }, writeRevision: before.writeRevision + 1, updatedAt: sdk.serverTimestamp() }))
          const outsider = env.authenticatedContext('bob', h.claims('bob')).firestore()
          await denied(() => sdk.getDocFromServer(sdk.doc(outsider, path)))
          assert.deepEqual((await sdk.getDocFromServer(target)).data(), before)
        })
      }
    } finally { await env.cleanup() }
  })
}
