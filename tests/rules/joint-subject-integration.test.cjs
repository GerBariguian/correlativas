// Replay the unchanged adversarial corpus against the complete repository Rules.
const fs = require('node:fs')
const sdk = require('firebase/firestore')
const helpers = require('./helpers.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
let integrationEnv
const realHelpers = { ...helpers,
  initialize: async () => { integrationEnv = await helpers.initialize(); return integrationEnv },
  seed: async (env, entries) => {
    const expanded = { ...entries }
    for (const [path, value] of Object.entries(entries)) {
      const m = /^users\/([^/]+)\/careerInstances\/([^/]+)$/.exec(path)
      if (m && value.catalogId === 'catalog' && value.createdAt) {
        expanded[`users/${m[1]}`] = { schemaVersion: 2, activeCareerInstanceId: null, updatedAt: helpers.TIME }
        expanded[`users/${m[1]}/catalogMemberships/catalog`] = { schemaVersion: 1, careerInstanceId: m[2] }
      }
    }
    return helpers.seed(env, expanded)
  },
}
const fullLifecycleSdk = { ...sdk, updateDoc: (ref, patch) => sdk.updateDoc(ref,
  Object.hasOwn(patch, 'lifecycle') ? { ...patch, archivedAt: patch.lifecycle === 'archived' ? sdk.serverTimestamp() : null, updatedAt: sdk.serverTimestamp() }
    : Object.hasOwn(patch, 'closed') ? { ...patch, updatedAt: sdk.serverTimestamp() } : patch) }
const source = fs.readFileSync(require.resolve('./joint-subject-atomic-prototype.test.cjs'), 'utf8')
new Function('require', source)(id => id === './helpers.cjs' ? realHelpers
  : id === 'firebase/firestore' ? fullLifecycleSdk
    : id === './fixtures/joint-subject-atomic-prototype.cjs' ? () => undefined : require(id))

function services(client, uid = 'owner') {
  const source = ['src/socialMaintenance.js', 'src/activityLogic.js', 'src/jointPlanLogic.js', 'src/services/friends.js', 'src/services/jointPlans.js']
    .map(file => fs.readFileSync(file, 'utf8').replace(/import[\s\S]*?from ['"][^'"]+['"]\s*/g, '').replace(/export /g, '')).join('\n')
  return new Function('sdk', 'db', 'auth', 'const {' + Object.keys(sdk).join(',') + '}=sdk;\n' + source
    + '\nreturn {saveJointSubject,removeJointSubject,closeJointPlan,deleteJointPlan}')
    (sdk, client, { currentUser: { uid, emailVerified: true } })
}
const client = uid => integrationEnv.authenticatedContext(uid, helpers.claims(uid)).firestore()
async function adminRead(path) {
  let result
  await integrationEnv.withSecurityRulesDisabled(async c => { result = await sdk.getDocFromServer(sdk.doc(c.firestore(), path)) })
  return result
}
test('REAL service max save, idempotent retry, deletion and recreation retain revision', async () => {
  const c = client('owner'), service = services(c), ids = ['owner', 'one', 'two', 'three', 'four']
  await service.saveJointSubject('owner', 'p', 'A', ids)
  const check = (await adminRead('jointPlans/p/subjectChecks/A')).data()
  await service.saveJointSubject('owner', 'p', 'A', ids)
  assert.deepEqual((await adminRead('jointPlans/p/subjectChecks/A')).data(), check)
  await service.removeJointSubject('owner', 'p', 'A')
  assert.equal((await adminRead('jointPlans/p/subjects/A')).exists(), false)
  assert.equal((await adminRead('jointPlans/p/subjectChecks/A')).data().revision, 1)
  await service.saveJointSubject('owner', 'p', 'A', ids.slice(1))
  assert.equal((await adminRead('jointPlans/p/subjectChecks/A')).data().revision, 2)
})
test('REAL service locked cleanup drains subjects and checks, retires notices and reserves plan ID', async () => {
  const c = client('owner'), service = services(c)
  await service.saveJointSubject('owner', 'p', 'A', ['owner', 'one'])
  await service.saveJointSubject('owner', 'p', 'B', ['one', 'two', 'three', 'four'])
  await service.removeJointSubject('owner', 'p', 'B')
  await service.closeJointPlan('owner', 'p')
  await service.deleteJointPlan('owner', 'p')
  for (const path of ['jointPlans/p', 'jointPlans/p/subjects/A', 'jointPlans/p/subjectChecks/A', 'jointPlans/p/subjectChecks/B']) assert.equal((await adminRead(path)).exists(), false)
  assert.equal((await adminRead('jointPlanTombstones/p')).exists(), true)
  await assert.rejects(service.saveJointSubject('owner', 'p', 'A', ['owner', 'one']))
})
test('REAL Rules: complete lifecycle/archive and proposal in one batch rejected atomically', async () => {
  const c = client('owner'), b = sdk.writeBatch(c)
  b.update(sdk.doc(c, 'users/owner/careerInstances/i_owner'), { lifecycle: 'archived', archivedAt: sdk.serverTimestamp(), updatedAt: sdk.serverTimestamp() })
  b.set(sdk.doc(c, 'jointPlans/p/subjects/A'), { code: 'A', proposedParticipantIds: ['owner', 'one'], addedByUid: 'owner', createdAt: sdk.serverTimestamp(), updatedAt: sdk.serverTimestamp() })
  b.set(sdk.doc(c, 'jointPlans/p/subjectChecks/A'), { revision: 1, actorUid: 'owner', updatedAt: sdk.serverTimestamp() })
  await helpers.assertFails(b.commit())
  assert.equal((await adminRead('users/owner/careerInstances/i_owner')).data().lifecycle, 'active')
  assert.equal((await adminRead('jointPlans/p/subjectChecks/A')).exists(), false)
})
test('REAL service: concurrent saves and explicit retry never leave half a proposal', async () => {
  const service = services(client('owner'))
  await service.saveJointSubject('owner', 'p', 'A', ['owner', 'one'])
  const results = await Promise.allSettled([service.saveJointSubject('owner', 'p', 'A', ['owner', 'two']), service.saveJointSubject('owner', 'p', 'A', ['owner', 'three'])])
  const count = results.filter(r => r.status === 'fulfilled').length
  assert.ok(count >= 1)
  for (const r of results.filter(r => r.status === 'rejected')) assert.ok(['aborted', 'permission-denied'].includes(r.reason.code))
  assert.equal((await adminRead('jointPlans/p/subjectChecks/A')).data().revision, 1 + count)
  await service.saveJointSubject('owner', 'p', 'A', ['one', 'two', 'three', 'four'])
  assert.equal((await adminRead('jointPlans/p/subjectChecks/A')).data().revision, 2 + count)
})
test('REAL cleanup resumes locked plan, drains multiple pages and missing invitation slots', async () => {
  const entries = {}, c = client('owner'), service = services(c)
  for (let n = 0; n < 105; n++) {
    entries[`jointPlans/p/subjectChecks/C${n}`] = { revision: n + 1, actorUid: 'owner', updatedAt: helpers.TIME }
    entries[`jointPlans/p/subjects/C${n}`] = { code: `C${n}`, proposedParticipantIds: ['owner', 'one'], addedByUid: 'owner', createdAt: helpers.TIME, updatedAt: helpers.TIME }
  }
  const p = (await adminRead('jointPlans/p')).data()
  entries['jointPlans/p'] = { ...p, closed: true, deleting: true }
  await helpers.seed(integrationEnv, entries)
  // Simulate a previous interrupted drain: a child has gone, its revision remains.
  await sdk.deleteDoc(sdk.doc(c, 'jointPlans/p/subjects/C0'))
  await service.deleteJointPlan('owner', 'p')
  await integrationEnv.withSecurityRulesDisabled(async context => {
    for (const kind of ['subjects', 'subjectChecks']) assert.equal((await sdk.getDocsFromServer(sdk.collection(context.firestore(), `jointPlans/p/${kind}`))).size, 0)
  })
})
test('REAL Rules: stale revision after delete/recreate and standalone check delete denied', async () => {
  const c = client('owner'), service = services(c)
  await service.saveJointSubject('owner', 'p', 'A', ['owner', 'one'])
  await service.removeJointSubject('owner', 'p', 'A')
  await helpers.assertFails(sdk.deleteDoc(sdk.doc(c, 'jointPlans/p/subjectChecks/A')))
  const b = sdk.writeBatch(c)
  b.set(sdk.doc(c, 'jointPlans/p/subjectChecks/A'), { revision: 1, actorUid: 'owner', updatedAt: sdk.serverTimestamp() })
  b.set(sdk.doc(c, 'jointPlans/p/subjects/A'), { code: 'A', proposedParticipantIds: ['owner', 'one'], addedByUid: 'owner', createdAt: sdk.serverTimestamp(), updatedAt: sdk.serverTimestamp() })
  await helpers.assertFails(b.commit())
  assert.equal((await adminRead('jointPlans/p/subjects/A')).exists(), false)
})
test('REAL Rules: historical orphan check cannot authorize after parent retirement', async () => {
  const c = client('owner'), service = services(c)
  await service.saveJointSubject('owner', 'p', 'A', ['owner', 'one'])
  await service.closeJointPlan('owner', 'p')
  await sdk.updateDoc(sdk.doc(c, 'jointPlans/p'), { deleting: true, updatedAt: sdk.serverTimestamp() })
  const b = sdk.writeBatch(c)
  b.set(sdk.doc(c, 'jointPlanTombstones/p'), { deletedAt: sdk.serverTimestamp() })
  b.delete(sdk.doc(c, 'jointPlans/p'))
  for (const uid of ['one', 'two', 'three', 'four']) b.delete(sdk.doc(c, `users/${uid}/activityInbox/jp_p`))
  await b.commit()
  assert.equal((await adminRead('jointPlans/p/subjectChecks/A')).exists(), true)
  await assert.rejects(service.saveJointSubject('owner', 'p', 'A', ['owner', 'two']))
  await helpers.assertFails(sdk.getDocFromServer(sdk.doc(c, 'jointPlans/p/subjectChecks/A')))
})
