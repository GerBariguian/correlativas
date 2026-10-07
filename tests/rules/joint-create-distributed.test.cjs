// Prototype evaluation against full Rules plus one isolated distribution change.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { initialize, seed, claims, TIME, friendship } = require('./helpers.cjs')
const { doc, writeBatch, serverTimestamp, getDoc, getDocFromServer, updateDoc, deleteDoc } = require('firebase/firestore')
const distributed = require('./fixtures/joint-create-distributed.cjs')
const original = fs.readFileSync('tests/rules/fixtures/joint-create-pre-distribution.rules', 'utf8')

function scenario(count = 4, orientation = 'direct', planId = 'p') {
  const ids = ['one', 'two', 'three', 'four'].slice(0, count), entries = {}
  for (const uid of ['owner', ...ids]) entries[`migrationUsers/${uid}`] = { schemaVersion: 1,
    generation: 'multicareer-v1', authority: 'instances', phase: 'complete', origin: 'legacy', manifestId: uid, updatedAt: TIME }
  entries['users/owner/careerInstances/i_owner'] = { schemaVersion: 1, catalogId: 'catalog', lifecycle: 'active', createdAt: TIME, updatedAt: TIME, archivedAt: null }
  entries['users/owner/catalogMemberships/catalog'] = { schemaVersion: 1, careerInstanceId: 'i_owner' }
  for (const [i, uid] of ids.entries()) {
    const reverse = orientation === 'inverse' || (orientation === 'mixed' && i % 2)
    entries[`friendships/${reverse ? uid + ':owner' : 'owner:' + uid}`] = reverse ? friendship(uid, 'owner') : friendship('owner', uid)
  }
  const plan = { schemaVersion: 2, ownerId: 'owner', catalogId: 'catalog', inviteeIds: ids, memberIds: ['owner'],
    participants: { owner: { careerInstanceId: 'i_owner', bindingState: 'resolved' }, ...Object.fromEntries(ids.map(uid => [uid, { careerInstanceId: null, bindingState: 'unresolved' }])) },
    name: 'Plan', invitedBy: Object.fromEntries(ids.map(uid => [uid, 'owner'])), closed: false, deleting: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
  const notices = Object.fromEntries(ids.map(uid => [uid, { schemaVersion: 1, type: 'JOINT_PLAN_INVITATION', actorUid: 'owner', createdAt: serverTimestamp(), target: { kind: 'jointPlan', id: planId }, readAt: null }]))
  return { plan, notices, entries, planId, actor: 'owner' }
}
async function commit(env, s) {
  const db = env.authenticatedContext(s.actor, claims(s.actor)).firestore(), batch = writeBatch(db)
  if (s.plan) batch.set(doc(db, `jointPlans/${s.planId}`), s.plan)
  for (const [uid, notice] of Object.entries(s.notices)) batch.set(doc(db, `users/${uid}/activityInbox/jp_${s.planId}`), notice)
  for (const [path, value] of s.extraWrites || []) batch.set(doc(db, path), value)
  return batch.commit()
}
async function absent(env, s) {
  await env.withSecurityRulesDisabled(async c => {
    assert.equal((await getDoc(doc(c.firestore(), `jointPlans/${s.planId}`))).exists(), false)
    for (const uid of Object.keys(s.notices)) assert.equal((await getDoc(doc(c.firestore(), `users/${uid}/activityInbox/jp_${s.planId}`))).exists(), false)
    for (const [path] of s.extraWrites || []) assert.equal((await getDoc(doc(c.firestore(), path))).exists(), false)
  })
}
const attacks = {
  ownerSpoof: s => { s.plan.ownerId = 'one' },
  inviteeSpoof: s => { s.plan.invitedBy.one = 'one' },
  duplicateInvitee: s => { s.plan.inviteeIds.push('one') },
  extraInvitee: s => { s.plan.inviteeIds.push('extra') },
  missingInvitee: s => { s.plan.inviteeIds = s.plan.inviteeIds.slice(1) },
  ownerInvited: s => { s.plan.inviteeIds[0] = 'owner' },
  noFriendship: s => { delete s.entries['friendships/owner:one'] },
  staleFriendship: s => { s.entries['friendships/owner:one'].status = 'rejected' },
  wrongFriendship: s => { s.entries['friendships/owner:one'] = friendship('other', 'one', 'pending') },
  ownerLegacy: s => { Object.assign(s.entries['migrationUsers/owner'], { authority: 'legacy', phase: 'pending' }) },
  ownerFrozen: s => { Object.assign(s.entries['migrationUsers/owner'], { authority: 'frozen', phase: 'copying' }) },
  ownerBlocked: s => { s.entries['migrationUsers/owner'].phase = 'blocked' },
  ownerInvalid: s => { s.entries['migrationUsers/owner'].manifestId = 'one' },
  recipientFrozen: s => { Object.assign(s.entries['migrationUsers/one'], { authority: 'frozen', phase: 'copying' }) },
  recipientBlocked: s => { s.entries['migrationUsers/one'].phase = 'blocked' },
  recipientInvalid: s => { s.entries['migrationUsers/one'].schemaVersion = 9 },
  foreignInstance: s => { s.entries['users/one/careerInstances/i_owner'] = s.entries['users/owner/careerInstances/i_owner']; delete s.entries['users/owner/careerInstances/i_owner'] },
  archivedInstance: s => { s.entries['users/owner/careerInstances/i_owner'].lifecycle = 'archived' },
  catalogMismatch: s => { s.plan.catalogId = 'another' },
  ownerBindingSpoof: s => { s.plan.participants.owner.bindingState = 'unresolved' },
  pendingBindingSpoof: s => { s.plan.participants.one = { careerInstanceId: 'fake', bindingState: 'resolved' } },
  pendingBindingExtra: s => { s.plan.participants.one.extra = true },
  pendingBindingMissing: s => { delete s.plan.participants.one.careerInstanceId },
  missingBinding: s => { delete s.plan.participants.one },
  extraBinding: s => { s.plan.participants.other = { careerInstanceId: null, bindingState: 'unresolved' } },
  otherInviteeBinding: s => { s.plan.participants.one = 'participants.two' },
  otherPlanBinding: s => { s.plan.participants.one = { careerInstanceId: null, bindingState: 'unresolved', sourcePlanId: 'other' } },
  swappedOwnerBinding: s => { [s.plan.participants.owner, s.plan.participants.one] = [s.plan.participants.one, s.plan.participants.owner] },
  noActivity: s => { s.notices = {} },
  partialActivity: s => { delete s.notices.one },
  actorActivity: s => { s.notices.one.actorUid = 'one' },
  otherPlanActivity: s => { s.notices.one.target.id = 'other' },
  activityTimestamp: s => { s.notices.one.createdAt = TIME },
  activitySchema: s => { s.notices.one.extra = true },
  activityOnly: s => { s.plan = null },
  extraNotice: s => { s.notices.other = { ...s.notices.one } },
  duplicateNoticeDifferentPath: s => { s.extraWrites = [['users/one/activityInbox/duplicate_p', { ...s.notices.one }]] },
  otherInviteeNotice: s => { s.notices.other = s.notices.one; delete s.notices.one },
  compensationNotice: s => { s.extraWrites = [['users/one/activityInbox/jp_other', { ...s.notices.one, target: { kind: 'jointPlan', id: 'other' } }]]; delete s.notices.one },
  noticeReadAtSpoof: s => { s.notices.one.readAt = serverTimestamp() },
  ownerMissingAuthority: s => { delete s.entries['migrationUsers/owner'] },
  crossUserActor: s => { s.actor = 'one' },
  wrongPlanType: s => { s.plan.schemaVersion = 1 },
  nonIntegerPlanType: s => { s.plan.schemaVersion = '2' },
  schemaExtra: s => { s.plan.extra = true },
  schemaMissing: s => { delete s.plan.name },
  extraMember: s => { s.plan.memberIds.push('one') },
  duplicateMember: s => { s.plan.memberIds.push('owner') },
  fakeActiveState: s => { s.plan.creationState = 'active' },
  staleRevision: s => { s.plan.creationRevision = 1 },
  closed: s => { s.plan.closed = true },
  deleting: s => { s.plan.deleting = true },
  zeroInvitees: s => { s.plan.inviteeIds = []; s.plan.participants = { owner: s.plan.participants.owner }; s.plan.invitedBy = {}; s.notices = {} },
}

for (const variant of ['current', 'distributed']) test(`${variant} creation comparison`, async t => {
  const env = await initialize(variant === 'current' ? original : distributed(original))
  try {
    for (const count of [1, 2, 3, 4]) for (const orientation of ['direct', 'inverse', 'mixed']) await t.test(`valid ${count} ${orientation}`, async () => {
      await env.clearFirestore()
      const s = scenario(count, orientation)
      await seed(env, s.entries)
      if (variant === 'current' && count >= 3) {
        // Diagnostic comparison only; original functional failures are preserved.
        await assert.rejects(commit(env, s), { code: 'permission-denied' })
        await absent(env, s)
      } else await commit(env, s)
    })
    for (const [name, mutate] of Object.entries(attacks)) for (const count of [1, 4]) await t.test(`reject ${name} ${count}`, async () => {
      await env.clearFirestore()
      const s = scenario(count); mutate(s)
      await seed(env, s.entries)
      await assert.rejects(commit(env, s), { code: 'permission-denied' })
      await absent(env, s)
    })
  } finally { await env.cleanup() }
})

test('distributed atomic lifecycle, retries and isolation', async t => {
  const env = await initialize(distributed(original))
  const ownerDb = () => env.authenticatedContext('owner', claims('owner')).firestore()
  try {
    for (const uid of ['one', 'two', 'three', 'four']) await t.test(`invalid binding at ${uid} rejects entire commit`, async () => {
      await env.clearFirestore(); const s = scenario(4, 'mixed')
      s.plan.participants[uid].careerInstanceId = 'invented'
      await seed(env, s.entries)
      await assert.rejects(commit(env, s), { code: 'permission-denied' }); await absent(env, s)
    })
    await t.test('array reorder and identical null bindings preserve UID-based validation', async () => {
      await env.clearFirestore(); const s = scenario(4, 'mixed')
      s.plan.inviteeIds.reverse()
      ;[s.plan.participants.one, s.plan.participants.four] = [s.plan.participants.four, s.plan.participants.one]
      await seed(env, s.entries); await commit(env, s)
    })
    await t.test('bad binding cannot hide behind reordered indices', async () => {
      await env.clearFirestore(); const s = scenario(4, 'mixed')
      s.plan.inviteeIds.reverse(); s.plan.participants.four.bindingState = 'resolved'
      await seed(env, s.entries)
      await assert.rejects(commit(env, s), { code: 'permission-denied' }); await absent(env, s)
    })
    await t.test('failed partial construction is absent and same ID can retry completely', async () => {
      await env.clearFirestore(); const s = scenario(4, 'inverse'), notice = s.notices.four
      await seed(env, s.entries); delete s.notices.four
      await assert.rejects(commit(env, s), { code: 'permission-denied' }); await absent(env, s)
      const member = env.authenticatedContext('one', claims('one')).firestore()
      await assert.rejects(getDocFromServer(doc(member, 'jointPlans/p')), { code: 'permission-denied' })
      await assert.rejects(updateDoc(doc(member, 'jointPlans/p'), { memberIds: ['owner', 'one'], updatedAt: serverTimestamp() }), { code: 'permission-denied' })
      s.notices.four = notice; await commit(env, s)
    })
    await t.test('replay rejected; read-confirm retry is a no-op and deleted notice is not regenerated', async () => {
      await env.clearFirestore(); const s = scenario(); await seed(env, s.entries); await commit(env, s)
      const before = (await getDocFromServer(doc(ownerDb(), 'jointPlans/p'))).data()
      await assert.rejects(commit(env, s), { code: 'permission-denied' })
      const recovered = (await getDocFromServer(doc(ownerDb(), 'jointPlans/p'))).data()
      assert.deepEqual(recovered, before)
      assert.equal(recovered.ownerId, s.actor); assert.equal(recovered.catalogId, s.plan.catalogId)
      assert.deepEqual(recovered.participants, s.plan.participants)
      assert.deepEqual(recovered.inviteeIds, s.plan.inviteeIds)
      const recipient = env.authenticatedContext('one', claims('one')).firestore()
      await deleteDoc(doc(recipient, 'users/one/activityInbox/jp_p'))
      const onlyNotice = { ...s, plan: null, notices: { one: s.notices.one } }
      await assert.rejects(commit(env, onlyNotice), { code: 'permission-denied' })
      assert.deepEqual((await getDocFromServer(doc(ownerDb(), 'jointPlans/p'))).data(), before)
    })
    await t.test('two tabs same ID: exactly one atomic winner', async () => {
      await env.clearFirestore(); const s = scenario(4, 'inverse'); await seed(env, s.entries)
      const results = await Promise.allSettled([commit(env, s), commit(env, s)])
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
      assert.equal(results.find(r => r.status === 'rejected').reason.code, 'permission-denied')
      await env.withSecurityRulesDisabled(async c => {
        const db = c.firestore(); assert.ok((await getDoc(doc(db, 'jointPlans/p'))).exists())
        for (const uid of s.plan.inviteeIds) assert.ok((await getDoc(doc(db, `users/${uid}/activityInbox/jp_p`))).exists())
      })
    })
    await t.test('cross-plan notice reuse cannot constitute another plan', async () => {
      await env.clearFirestore(); const s = scenario(); await seed(env, s.entries); await commit(env, s)
      const other = scenario(4, 'direct', 'q'); other.notices = {}
      await assert.rejects(commit(env, other), { code: 'permission-denied' }); await absent(env, other)
      await commit(env, scenario(4, 'direct', 'q'))
    })
    await t.test('preexisting matching notice cannot be reused as a persistent credential', async () => {
      await env.clearFirestore(); const s = scenario()
      await seed(env, { ...s.entries, 'users/one/activityInbox/jp_p': { ...s.notices.one, createdAt: TIME } })
      await assert.rejects(commit(env, s), { code: 'permission-denied' })
      await env.withSecurityRulesDisabled(async c => assert.equal((await getDoc(doc(c.firestore(), 'jointPlans/p'))).exists(), false))
    })
    await t.test('historical notice is not current authority or binding authorization', async () => {
      await env.clearFirestore(); const s = scenario(); await seed(env, s.entries); await commit(env, s)
      const recipient = env.authenticatedContext('one', claims('one')).firestore(), b = writeBatch(recipient)
      b.set(doc(recipient, 'jointPlans/p/subjects/A'), { code: 'A', proposedParticipantIds: ['owner', 'one'], addedByUid: 'one', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      b.set(doc(recipient, 'jointPlans/p/subjectChecks/A'), { revision: 1, actorUid: 'one', updatedAt: serverTimestamp() })
      await assert.rejects(b.commit(), { code: 'permission-denied' })
      await assert.rejects(getDocFromServer(doc(recipient, 'users/owner/careers/catalog')), { code: 'permission-denied' })
    })
    await t.test('owner freeze or archive after preparation is checked at commit, restore permits a fresh create', async () => {
      await env.clearFirestore(); const s = scenario()
      await seed(env, { ...s.entries, 'users/owner/careerInstances/i_owner': { ...s.entries['users/owner/careerInstances/i_owner'], lifecycle: 'archived', archivedAt: TIME } })
      await assert.rejects(commit(env, s), { code: 'permission-denied' }); await absent(env, s)
      await seed(env, s.entries); await commit(env, s)
      const next = scenario(4, 'direct', 'q')
      await seed(env, { 'migrationUsers/owner': { ...s.entries['migrationUsers/owner'], authority: 'frozen', phase: 'copying' } })
      await assert.rejects(commit(env, next), { code: 'permission-denied' }); await absent(env, next)
    })
    await t.test('legacy recipient remains an invitation only, without fabricated trajectory', async () => {
      await env.clearFirestore(); const s = scenario()
      Object.assign(s.entries['migrationUsers/one'], { authority: 'legacy', phase: 'pending' })
      await seed(env, s.entries); await commit(env, s)
      await env.withSecurityRulesDisabled(async c => assert.equal((await getDoc(doc(c.firestore(), 'users/one/careerInstances/i_owner'))).exists(), false))
    })
  } finally { await env.cleanup() }
})
