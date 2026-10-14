const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs')
const sdk = require('firebase/firestore'), h = require('./helpers.cjs')
const api = require('../final-grades-harness.cjs')(sdk)
const onboarding = require('../academic-onboarding-persistence-harness.cjs').load(sdk)
const control = model => ({ schemaVersion: 1, generation: 'multicareer-v1', authority: model, phase: model === 'legacy' ? 'pending' : 'complete', origin: 'legacy', manifestId: 'alice', updatedAt: h.TIME })
for (const [base, model] of [['hotfix', 'legacy'], ['full', 'legacy'], ['full', 'instances']]) test(`private grades ${base}/${model}`, async t => {
  const file = `rules/final-grades/${base}-strict.rules`, rules = fs.readFileSync(file, 'utf8')
  t.diagnostic(`${file} SHA256=${require('node:crypto').createHash('sha256').update(rules).digest('hex')}`)
  const env = await h.initialize(rules)
  try {
    const scope = { uid: 'alice', model, id: model === 'legacy' ? 'catalog' : 'ix', catalogId: 'catalog' }
    const parent = `users/alice/${model === 'legacy' ? 'careers/catalog' : 'careerInstances/ix'}`
    const progress = model === 'legacy' ? parent : `${parent}/academic/progress`
    const auth = { currentUser: { uid: 'alice' } }, career = { id: 'catalog', subjects: [{ code: 'A', prereqs: [] }, { code: 'B', prereqs: [] }, { code: 'C', prereqs: [] }], initialStatus: {} }
    const a = env.authenticatedContext('alice', h.claims('alice')).firestore(), b = env.authenticatedContext('alice', h.claims('alice')).firestore()
    const repo = db => api.finalGradesRepository({ db, auth }, scope, career.subjects)
    const gradeRef = (db, code = 'A') => sdk.doc(db, api.finalGradePath(scope, code))
    const read = async (path) => (await sdk.getDocFromServer(sdk.doc(a, path))).data()
    const seed = async () => {
      await env.clearFirestore()
      await h.seed(env, { 'users/alice': { activeCareerId: 'catalog', updatedAt: h.TIME },
        ...(model === 'instances' ? { 'migrationUsers/alice': control(model), 'users/alice/catalogMemberships/catalog': { schemaVersion: 1, careerInstanceId: 'ix' }, [parent]: { schemaVersion: 1, catalogId: 'catalog', lifecycle: 'active', createdAt: h.TIME, updatedAt: h.TIME, archivedAt: null } } : {}),
        [progress]: { ...(model === 'instances' ? { schemaVersion: 1, revision: 1 } : { writeRevision: 1 }), statusMap: { A: 'Aprobada', B: 'Aprobada', C: 'Pendiente' }, updatedAt: h.TIME } })
    }
    const denied = async fn => { await assert.rejects(fn(), e => e.code === 'permission-denied' && !/1000 expressions|service call|resource.exhaust/i.test(e.message)) }
    const note = (grade = 8, revision = 1) => ({ schemaVersion: 1, grade, revision, updatedAt: sdk.serverTimestamp() })
    await t.test('real save/edit/null preserve progress and increment only grade revision', async () => {
      await seed(); const before = await read(progress)
      await repo(a).save('A', 8, null); await repo(a).save('A', 10, 1); await repo(a).save('A', null, 2)
      const stored = (await sdk.getDocFromServer(gradeRef(a))).data()
      assert.equal(stored.grade, null); assert.equal(stored.revision, 3); assert.deepEqual(await read(progress), before)
      await repo(a).save('A', 9, 3)
      assert.equal((await sdk.getDocsFromServer(sdk.collection(a, api.finalGradeScope(scope)))).size, 1)
    })
    await t.test('same grade two tabs one winner; independent subjects both succeed', async () => {
      await seed()
      const outcomes = await Promise.allSettled([repo(a).save('A', 8, null), repo(b).save('A', 9, null)])
      assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1)
      const loser = outcomes.find(r => r.status === 'rejected').reason
      assert.ok(loser.message.includes('CONFLICT') || loser.code === 'permission-denied')
      assert.doesNotMatch(loser.message, /1000 expressions|service call|resource.exhaust/i)
      await seed()
      const independent = await Promise.allSettled([repo(a).save('A', 8, null), repo(b).save('B', 7, null)])
      assert.ok(independent.every(r => r.status === 'fulfilled'))
    })
    await t.test('range, schema, fields, timestamp, revision and physical delete denied', async () => {
      await seed()
      for (const grade of [0, 11, 7.5, '8', true]) await denied(() => sdk.setDoc(gradeRef(a), note(grade)))
      for (const patch of [{ extra: true }, { schemaVersion: 2 }, { revision: 0 }, { updatedAt: h.TIME }]) await denied(() => sdk.setDoc(gradeRef(a), { ...note(), ...patch }))
      for (const field of ['schemaVersion', 'grade', 'revision', 'updatedAt']) { const d = note(); delete d[field]; await denied(() => sdk.setDoc(gradeRef(a), d)) }
      await repo(a).save('A', 8, null)
      for (const revision of [1, 3, null, sdk.deleteField()]) await denied(() => sdk.updateDoc(gradeRef(a), { revision, updatedAt: sdk.serverTimestamp() }))
      await denied(() => sdk.deleteDoc(gradeRef(a)))
      assert.equal((await sdk.getDocFromServer(gradeRef(a))).data().grade, 8)
    })
    await t.test('private despite friendship, membership and sharing; get/list/write blocked to outsider and anonymous', async () => {
      await seed(); await repo(a).save('A', 8, null)
      await h.seed(env, { 'friendships/alice:bob': h.friendship('alice', 'bob'), 'jointPlans/private': h.plan('alice', ['bob'], ['alice', 'bob']), 'planningSharing/alice': { enabled: true, sharedCareerId: 'catalog', updatedAt: h.TIME } })
      for (const client of [env.authenticatedContext('bob', h.claims('bob')).firestore(), env.unauthenticatedContext().firestore()]) {
        await denied(() => sdk.getDocFromServer(gradeRef(client)))
        await denied(() => sdk.getDocsFromServer(sdk.collection(client, api.finalGradeScope(scope))))
        await denied(() => sdk.setDoc(gradeRef(client), note(9, 2)))
      }
    })
    await t.test('nonapproved and simultaneous downgrade reject numeric grade; stored note retained after reset', async () => {
      await seed(); await denied(() => sdk.setDoc(gradeRef(a, 'C'), note()))
      await repo(a).save('A', 8, null)
      const batch = sdk.writeBatch(a)
      batch.update(sdk.doc(a, progress), { statusMap: {}, [model === 'legacy' ? 'writeRevision' : 'revision']: 2, updatedAt: sdk.serverTimestamp() })
      batch.set(gradeRef(a), note(9, 2)); await denied(() => batch.commit())
      await sdk.updateDoc(sdk.doc(a, progress), { statusMap: {}, [model === 'legacy' ? 'writeRevision' : 'revision']: 2, updatedAt: sdk.serverTimestamp() })
      assert.equal((await sdk.getDocFromServer(gradeRef(a))).data().grade, 8)
      await assert.rejects(repo(a).save('A', 9, 1), /APPROVED/)
      await repo(a).save('A', null, 1)
    })
    await t.test('authority change blocks grade writes; session change does not report success', async () => {
      await seed(); await h.seed(env, { 'migrationUsers/alice': { ...control(model), authority: 'frozen', phase: 'copying' } })
      await denied(() => sdk.setDoc(gradeRef(a), note()))
      await assert.rejects(repo(a).save('A', 8, null), /AUTHORITY/)
      await seed(); const old = repo(a); auth.currentUser = { uid: 'alice' }
      await assert.rejects(old.save('A', 8, null), /SESSION/)
    })
    await t.test('same code in different careers/instances stays independent', async () => {
      await seed()
      const otherScope = { ...scope, id: 'other', catalogId: 'other' }
      const otherParent = `users/alice/${model === 'legacy' ? 'careers' : 'careerInstances'}/other`
      await h.seed(env, model === 'legacy' ? { [otherParent]: await read(progress) } : { [otherParent]: { ...await read(parent), catalogId: 'other' }, 'users/alice/catalogMemberships/other': { schemaVersion: 1, careerInstanceId: 'other' }, [`${otherParent}/academic/progress`]: await read(progress) })
      await repo(a).save('A', 8, null)
      await api.finalGradesRepository({ db: a, auth }, otherScope, career.subjects).save('A', 6, null)
      assert.equal((await sdk.getDocFromServer(gradeRef(a))).data().grade, 8)
      assert.equal((await sdk.getDocFromServer(sdk.doc(a, api.finalGradePath(otherScope, 'A')))).data().grade, 6)
    })
    if (model === 'instances') await t.test('archived instance denies grade writes, retains private history', async () => {
      await seed(); await repo(a).save('A', 8, null)
      await h.seed(env, { [parent]: { ...await read(parent), lifecycle: 'archived', archivedAt: h.TIME } })
      await denied(() => sdk.setDoc(gradeRef(a), note(9, 2)))
      await assert.rejects(repo(a).save('A', 9, 1), /INSTANCE/)
      assert.equal((await sdk.getDocFromServer(gradeRef(a))).data().grade, 8)
    })
    if (model === 'legacy') await t.test('onboarding and ordinary reset preserve notes; social snapshot has no grades', async () => {
      await seed(); await repo(a).save('A', 8, null)
      const deps = { ...onboarding, ...sdk, db: a, auth, careers: [career] }
      const source = fs.readFileSync('src/services/planning.js', 'utf8').replace(/^import .*$/gm, '').replace(/export /g, '')
      const planning = new Function(...Object.keys(deps), source + ';return {savePlanningProgress,setPlanningSharing,legacyProgressDocument}')(...Object.values(deps))
      await planning.setPlanningSharing('alice', 'catalog', true)
      const onb = onboarding.legacyOnboardingRepository({ db: a, auth }, scope, career, () => {})
      // C is explicitly pending, so onboarding cannot replace it. Add a new subject.
      await onb.save({ scope, entries: [{ code: 'D', status: 'Aprobada', expectedAbsent: true }] })
      const expected = planning.legacyProgressDocument(await sdk.getDocFromServer(sdk.doc(a, progress)))
      await planning.savePlanningProgress('alice', 'catalog', { type: 'reset', expected, statusMap: {} })
      assert.equal((await sdk.getDocFromServer(gradeRef(a))).data().grade, 8)
      const snapshot = await read('planningSnapshots/alice/careers/catalog')
      assert.deepEqual(snapshot.approvedCodes, [])
      assert.equal(Object.hasOwn(snapshot, 'grade'), false); assert.equal(Object.hasOwn(snapshot, 'finalGrades'), false)
    })
  } finally { await env.cleanup() }
})
