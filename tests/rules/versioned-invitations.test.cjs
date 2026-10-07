// CREATE E feasibility gate before completing INVITE/reinvite. Full actual Rules extended in memory.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const sdk = require('firebase/firestore')
const h = require('./helpers.cjs')
const { versionedInvitations } = require('./fixtures/versioned-invitations.cjs')
let source = fs.readFileSync('tests/rules/joint-join-diagnostic.test.cjs', 'utf8')
source = source.slice(0, source.indexOf("for (const variant of ['real', 'join-only'])"))
const { fixture } = new Function('require', source + '\nreturn {fixture}')(require)
const CYCLE = 'cycle_00000000001'
function input(count, orientation) {
  const entries = fixture(1), plan = entries['jointPlans/p']
  delete entries['jointPlans/p']
  for (const key of Object.keys(entries).filter(k => k.includes('/activityInbox/'))) delete entries[key]
  plan.inviteeIds = plan.inviteeIds.slice(0, count)
  plan.participants = Object.fromEntries(Object.entries(plan.participants).filter(([id]) => id === 'owner' || plan.inviteeIds.includes(id)))
  plan.invitedBy = Object.fromEntries(plan.inviteeIds.map(id => [id, 'owner']))
  plan.invitationSerial = count
  plan.invitationCycles = Object.fromEntries(plan.inviteeIds.map(id => [id, CYCLE]))
  plan.invitationOccurrences = Object.fromEntries(plan.inviteeIds.map((id, i) => [id, i + 1]))
  plan.createdAt = sdk.serverTimestamp(); plan.updatedAt = sdk.serverTimestamp()
  plan.inviteeIds.forEach((uid, i) => {
    const path = 'friendships/owner:' + uid
    entries[path].cycleId = CYCLE
    if (orientation === 'inverse' || (orientation === 'mixed' && i % 2)) {
      entries['friendships/' + uid + ':owner'] = entries[path]; delete entries[path]
    }
  })
  return { entries, plan }
}
function create(db, plan) {
  const batch = sdk.writeBatch(db)
  batch.set(sdk.doc(db, 'jointPlans/p'), plan)
  for (const uid of plan.inviteeIds) {
    const occurrence = plan.invitationOccurrences[uid]
    batch.set(sdk.doc(db, 'users', uid, 'activityInbox', `jp_p_${occurrence}`), {
      schemaVersion: 2, type: 'JOINT_PLAN_INVITATION', actorUid: 'owner', createdAt: sdk.serverTimestamp(), readAt: null,
      target: { kind: 'jointPlan', id: 'p' }, friendshipCycleId: plan.invitationCycles[uid], occurrence,
    })
  }
  return batch.commit()
}
test('complete CREATE E + versioned notices valid path feasibility', async t => {
  const rules = versionedInvitations(fs.readFileSync('firestore.rules', 'utf8'))
  fs.writeFileSync('.tools/versioned-invitations-generated.rules', rules)
  const env = await h.initialize(rules)
  try {
    for (const count of [1, 2, 3, 4]) for (const orientation of ['direct', 'inverse', 'mixed']) await t.test(`${count} ${orientation}`, async t => {
      await env.clearFirestore(); const { entries, plan } = input(count, orientation); await h.seed(env, entries)
      let error
      try { await create(env.authenticatedContext('owner', h.claims('owner')).firestore(), plan) } catch (e) { error = e }
      t.diagnostic(JSON.stringify({ count, orientation, allowed: !error, code: error?.code, expressions: /1000 expressions/.test(error?.message || '') }))
      if (error) await env.withSecurityRulesDisabled(async c => {
        assert.equal((await sdk.getDocFromServer(sdk.doc(c.firestore(), 'jointPlans/p'))).exists(), false)
        for (const uid of plan.inviteeIds) assert.equal((await sdk.getDocs(sdk.collection(c.firestore(), 'users', uid, 'activityInbox'))).size, 0)
      })
      assert.equal(error, undefined)
    })
  } finally { await env.cleanup() }
})
