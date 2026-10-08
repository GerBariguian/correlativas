const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const sdk = require('firebase/firestore')
const h = require('./helpers.cjs')
const { load, career, control, instance } = require('../academic-onboarding-persistence-harness.cjs')
const api = load(sdk)

for (const [model, rulesFile] of [['legacy', 'firestore.migration-users-hotfix.rules'], ['legacy', 'firestore.rules'], ['instances', 'firestore.rules']]) {
  test(`${model} real onboarding services with ${rulesFile}`, async t => {
    const env = await h.initialize(fs.readFileSync(rulesFile, 'utf8'))
    try {
      const client = env.authenticatedContext('alice', h.claims('alice')).firestore()
      const auth = { currentUser: { uid: 'alice' } }
      const scope = { uid: 'alice', model, id: model === 'legacy' ? 'catalog' : 'ix', catalogId: 'catalog' }
      const target = model === 'legacy' ? 'users/alice/careers/catalog' : 'users/alice/careerInstances/ix/academic/progress'
      const initial = { A: 'Pendiente', OLD: 'Regularizada' }
      async function setup(sharing = false) {
        await env.clearFirestore()
        const entries = { 'users/alice': { activeCareerId: 'catalog', updatedAt: h.TIME } }
        // Legacy hotfix represents an actually absent migration control.
        if (model === 'instances') Object.assign(entries, {
          'migrationUsers/alice': { ...control(model), updatedAt: h.TIME },
          'users/alice/careerInstances/ix': { ...instance, createdAt: h.TIME, updatedAt: h.TIME },
          'users/alice/catalogMemberships/catalog': { schemaVersion: 1, careerInstanceId: 'ix' },
        })
        entries[target] = model === 'legacy' ? { statusMap: initial, updatedAt: h.TIME }
          : { schemaVersion: 1, statusMap: initial, revision: 1, updatedAt: h.TIME }
        if (sharing) entries['planningSharing/alice'] = { enabled: true, sharedCareerId: 'catalog', consentVersion: 2, updatedAt: h.TIME }
        await h.seed(env, entries)
      }
      function controller(db = client) {
        const assertLive = () => {}
        const repo = model === 'legacy' ? api.legacyOnboardingRepository({ db, auth }, scope, career, assertLive)
          : api.academicBridgeRepository({ db, auth }, 'alice')
        return api.createAcademicOnboardingController({ scope, subjects: career.subjects, assertLive,
          load: () => model === 'legacy' ? repo.load() : repo.loadProgress(scope),
          save: (changes, expected) => model === 'legacy' ? repo.save(changes) : repo.saveOnboardingProgress(scope, changes, expected, assertLive) })
      }
      const read = async path => (await sdk.getDocFromServer(sdk.doc(client, path))).data()
      const decide = (draft, code = 'B') => api.decideOnboardingSubjects(draft, [code], 'Aprobada')
      await t.test('confirmed partial read and save preserve pending and unknown keys', async () => {
        await setup(); const c = controller(), d = await c.load()
        assert.equal((await c.confirm(decide(d))).saved, true)
        assert.deepEqual((await read(target)).statusMap, { ...initial, B: 'Aprobada' })
      })
      await t.test('two tabs same subject: exactly one success, no overwrite', async () => {
        await setup()
        const a = controller(), b = controller(env.authenticatedContext('alice', h.claims('alice')).firestore())
        const da = decide(await a.load()), db = api.decideOnboardingSubjects(await b.load(), ['B', 'C'], 'Regularizada')
        const results = await Promise.allSettled([a.confirm(da), b.confirm(db)])
        assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
        const winner = results.findIndex(r => r.status === 'fulfilled'), loser = 1 - winner
        const error = results[loser].reason
        assert.doesNotMatch(error.message, /1000\s+expressions|service[ -]call|resource[ -]exhaust|maximum.*(?:access|calls)/i)
        // A retry observes CAS conflict; alternatively Rules reject the stale
        // revision at commit before the SDK retries. Never relabel permissions.
        if (model === 'instances' && error.code === 'permission-denied') {
          assert.equal(api.onboardingSaveError(error).kind, 'permission')
        } else assert.match(error.message, /CONFLICT/)
        t.diagnostic(`loser: ${error.code || error.message}; winner: ${winner}`)
        const saved = await read(target)
        assert.deepEqual(saved.statusMap, { ...initial, ...[da, db][winner].decisions })
        if (model === 'instances') assert.equal(saved.revision, 2)
        const losingController = [a, b][loser]
        assert.equal(losingController.getPhase(), 'error')
        await assert.rejects(losingController.confirm([da, db][loser]), /RELOAD_REQUIRED/)
        assert.deepEqual(await read(target), saved)
        const refreshed = await losingController.load()
        assert.throws(() => decide(refreshed), /PROTECTED/)
      })
      await t.test('other tab unrelated save preserved or CAS rejected', async () => {
        await setup(); const a = controller(), b = controller()
        const da = decide(await a.load()), db = decide(await b.load(), 'C')
        await b.confirm(db)
        if (model === 'instances') await assert.rejects(a.confirm(da), /CONFLICT/)
        else await a.confirm(da)
        assert.equal((await read(target)).statusMap.C, 'Aprobada')
      })
      await t.test('no decisions means no progress change', async () => {
        await setup(); const c = controller(), before = await read(target)
        assert.equal((await c.confirm(await c.load())).saved, false)
        assert.deepEqual(await read(target), before)
      })
      await t.test('permission-denied on read never creates a writable draft', async () => {
        await setup(); const c = controller(env.authenticatedContext('bob', h.claims('bob')).firestore())
        await assert.rejects(c.load(), e => e.code === 'permission-denied')
        await assert.rejects(c.confirm({}), /RELOAD_REQUIRED/)
      })
      if (model === 'legacy') await t.test('legacy shared snapshot matches merged map and source timestamp', async () => {
        await setup(true); const c = controller(); await c.confirm(decide(await c.load()))
        const p = await read(target), s = await read('planningSnapshots/alice/careers/catalog')
        assert.deepEqual(s, api.derivePlanningSnapshot(career, p.statusMap, p.updatedAt, p.updatedAt, true))
      })
      if (model === 'instances') {
        await t.test('archived instance blocks confirmation without writes', async () => {
          await setup(); const c = controller(), d = decide(await c.load())
          await h.seed(env, { 'users/alice/careerInstances/ix': { ...instance, lifecycle: 'archived', archivedAt: h.TIME, createdAt: h.TIME, updatedAt: h.TIME } })
          await assert.rejects(c.confirm(d), /INSTANCE_UNAVAILABLE/)
          assert.deepEqual((await read(target)).statusMap, initial)
        })
        await t.test('frozen authority blocks confirmation', async () => {
          await setup(); const c = controller(), d = decide(await c.load())
          await h.seed(env, { 'migrationUsers/alice': { ...control('frozen'), updatedAt: h.TIME } })
          await assert.rejects(c.confirm(d), /AUTHORITY_CHANGED/)
        })
      }
    } finally { await env.cleanup() }
  })
}
