// Full repository Rules: incremental invitations are NOT create E.
const { test } = require('node:test')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const { initialize, seed, claims, TIME, friendship } = require('./helpers.cjs')
const { doc, writeBatch, serverTimestamp, getDoc, updateDoc, runTransaction } = require('firebase/firestore')
// Reuse only the pure fixture constructors; do not register its prototype tests.
let constructors = fs.readFileSync(require.resolve('./joint-create-distributed.test.cjs'), 'utf8')
constructors = constructors.slice(0, constructors.indexOf('const attacks = {'))
const { scenario, commit } = new Function('require', constructors + '\nreturn {scenario,commit}')(require)
test('real v2 invitation budget and atomic transition', async t => {
  const env = await initialize()
  try {
    const joinAttacks = {
      foreign: (s, d) => { d.participants.one.careerInstanceId = 'i_owner' },
      unresolved: (s, d) => { d.participants.one = { careerInstanceId: null, bindingState: 'unresolved' } },
      unavailable: (s, d) => { d.participants.one = { careerInstanceId: null, bindingState: 'catalog-unavailable' } },
      catalog: s => { s.entries['users/one/careerInstances/i_one'].catalogId = 'other' },
      archived: s => { s.entries['users/one/careerInstances/i_one'].lifecycle = 'archived' },
      frozen: s => { Object.assign(s.entries['migrationUsers/one'], { authority: 'frozen', phase: 'copying' }) },
      legacy: s => { Object.assign(s.entries['migrationUsers/one'], { authority: 'legacy', phase: 'pending' }) },
      blocked: s => { s.entries['migrationUsers/one'].phase = 'blocked' },
      owner: (s, d) => { d.ownerId = 'one' },
      members: (s, d) => { d.memberIds.push('two') },
      binding: (s, d) => { d.participants.owner.careerInstanceId = 'i_one' },
      extra: (s, d) => { d.participants.one.extra = true },
      timestamp: (s, d) => { d.updatedAt = TIME },
    }
    for (const [name, attack] of Object.entries(joinAttacks)) await t.test(`join denies ${name} without mutation`, async () => {
      await env.clearFirestore(); const s = scenario(4, 'mixed')
      s.entries['users/one/careerInstances/i_one'] = { ...s.entries['users/owner/careerInstances/i_owner'] }
      // Create first: faults in the joining account must not invalidate creation evidence.
      await seed(env, s.entries); await commit(env, s)
      const d = { memberIds: ['owner', 'one'], participants: structuredClone(s.plan.participants), updatedAt: serverTimestamp() }
      d.participants.one = { careerInstanceId: 'i_one', bindingState: 'resolved' }
      attack(s, d); await seed(env, s.entries)
      const db = env.authenticatedContext('one', claims('one')).firestore()
      await assert.rejects(updateDoc(doc(db, 'jointPlans/p'), d), { code: 'permission-denied' })
      assert.deepEqual((await getDoc(doc(db, 'jointPlans/p'))).data().memberIds, ['owner'])
    })
    for (const state of ['closed', 'deleting']) await t.test(`join cannot override ${state}`, async () => {
      await env.clearFirestore(); const s = scenario(4, 'mixed')
      s.entries['users/one/careerInstances/i_one'] = { ...s.entries['users/owner/careerInstances/i_owner'] }
      await seed(env, s.entries); await commit(env, s)
      const owner = env.authenticatedContext('owner', claims('owner')).firestore()
      await updateDoc(doc(owner, 'jointPlans/p'), { closed: true, updatedAt: serverTimestamp() })
      if (state === 'deleting') await updateDoc(doc(owner, 'jointPlans/p'), { deleting: true, updatedAt: serverTimestamp() })
      const db = env.authenticatedContext('one', claims('one')).firestore()
      await assert.rejects(updateDoc(doc(db, 'jointPlans/p'), { memberIds: ['owner', 'one'],
        participants: { ...s.plan.participants, one: { careerInstanceId: 'i_one', bindingState: 'resolved' } }, updatedAt: serverTimestamp() }), { code: 'permission-denied' })
    })
    await t.test('two joins retry against current membership and preserve both bindings', async () => {
      await env.clearFirestore(); const s = scenario(4, 'mixed')
      const attempts = []
      for (const uid of ['one', 'two']) s.entries[`users/${uid}/careerInstances/i_${uid}`] = { ...s.entries['users/owner/careerInstances/i_owner'] }
      await seed(env, s.entries); await commit(env, s)
      const join = uid => {
        const db = env.authenticatedContext(uid, claims(uid)).firestore(), ref = doc(db, 'jointPlans/p')
        return runTransaction(db, async tx => {
          const p = (await tx.get(ref)).data()
          attempts.push({ uid, membersRead: [...p.memberIds] })
          tx.update(ref, { memberIds: [...p.memberIds, uid], participants: { ...p.participants,
            [uid]: { careerInstanceId: `i_${uid}`, bindingState: 'resolved' } }, updatedAt: serverTimestamp() })
        })
      }
      const results = await Promise.allSettled([join('one'), join('two')])
      const db = env.authenticatedContext('owner', claims('owner')).firestore()
      const p = (await getDoc(doc(db, 'jointPlans/p'))).data()
      t.diagnostic(JSON.stringify({ attempts, results: results.map(r => ({ status: r.status, code: r.reason?.code })),
        persistedMembers: p.memberIds, persistedBindings: p.participants }))
      // Check atomicity even if the SDK does not retry a denied stale transition.
      for (const uid of ['one', 'two']) assert.equal(p.participants[uid].bindingState,
        p.memberIds.includes(uid) ? 'resolved' : 'unresolved')
      assert.ok(results.every(r => r.status === 'fulfilled'), 'Both valid concurrent joins must settle; see diagnostic for stale-read/retry evidence')
      assert.deepEqual([...p.memberIds].sort(), ['one', 'owner', 'two'])
      for (const uid of ['one', 'two']) assert.equal(p.participants[uid].careerInstanceId, `i_${uid}`)
    })
    for (const count of [1, 2, 3]) for (const reverse of [false, true]) await t.test(`invite ${count + 1} reverse=${reverse}`, async () => {
      await env.clearFirestore()
      const s = scenario(count, reverse ? 'inverse' : 'direct')
      const uid = ['one', 'two', 'three', 'four'][count]
      s.entries[`migrationUsers/${uid}`] = { ...s.entries['migrationUsers/owner'], manifestId: uid }
      s.entries[`friendships/${reverse ? uid + ':owner' : 'owner:' + uid}`] = reverse ? friendship(uid, 'owner') : friendship('owner', uid)
      await seed(env, s.entries); await commit(env, s)
      const db = env.authenticatedContext('owner', claims('owner')).firestore(), batch = writeBatch(db)
      batch.update(doc(db, 'jointPlans/p'), { inviteeIds: [...s.plan.inviteeIds, uid],
        participants: { ...s.plan.participants, [uid]: { careerInstanceId: null, bindingState: 'unresolved' } },
        invitedBy: { ...s.plan.invitedBy, [uid]: 'owner' }, updatedAt: serverTimestamp() })
      batch.set(doc(db, `users/${uid}/activityInbox/jp_p`), { schemaVersion: 1, type: 'JOINT_PLAN_INVITATION',
        actorUid: 'owner', createdAt: serverTimestamp(), target: { kind: 'jointPlan', id: 'p' }, readAt: null })
      await batch.commit()
      assert.equal((await getDoc(doc(db, 'jointPlans/p'))).data().inviteeIds.length, count + 1)
    })
    for (const count of [1, 2, 3, 4]) await t.test(`join with ${count} invitees`, async () => {
      await env.clearFirestore(); const s = scenario(count, 'inverse')
      s.entries['users/one/careerInstances/i_one'] = { ...s.entries['users/owner/careerInstances/i_owner'] }
      s.entries['users/one/catalogMemberships/catalog'] = { schemaVersion: 1, careerInstanceId: 'i_one' }
      await seed(env, s.entries); await commit(env, s)
      const db = env.authenticatedContext('one', claims('one')).firestore()
      await updateDoc(doc(db, 'jointPlans/p'), { memberIds: ['owner', 'one'],
        participants: { ...s.plan.participants, one: { careerInstanceId: 'i_one', bindingState: 'resolved' } }, updatedAt: serverTimestamp() })
      assert.deepEqual((await getDoc(doc(db, 'jointPlans/p'))).data().memberIds, ['owner', 'one'])
    })
    await t.test('all four invitees join sequentially with explicit personal bindings', async () => {
      await env.clearFirestore(); const s = scenario(4, 'inverse')
      for (const uid of s.plan.inviteeIds) {
        s.entries[`users/${uid}/careerInstances/i_${uid}`] = { ...s.entries['users/owner/careerInstances/i_owner'] }
        s.entries[`users/${uid}/catalogMemberships/catalog`] = { schemaVersion: 1, careerInstanceId: `i_${uid}` }
      }
      await seed(env, s.entries); await commit(env, s)
      const participants = { ...s.plan.participants }, members = ['owner']
      for (const uid of s.plan.inviteeIds) {
        members.push(uid); participants[uid] = { careerInstanceId: `i_${uid}`, bindingState: 'resolved' }
        const db = env.authenticatedContext(uid, claims(uid)).firestore()
        await updateDoc(doc(db, 'jointPlans/p'), { memberIds: [...members], participants: { ...participants }, updatedAt: serverTimestamp() })
      }
    })
    for (const reverse of [false, true]) await t.test(`joined non-owner invites fourth participant reverse=${reverse}`, async () => {
      await env.clearFirestore(); const s = scenario(3, 'inverse')
      s.entries['users/one/careerInstances/i_one'] = { ...s.entries['users/owner/careerInstances/i_owner'] }
      s.entries['migrationUsers/four'] = { ...s.entries['migrationUsers/owner'], manifestId: 'four' }
      s.entries[`friendships/${reverse ? 'four:one' : 'one:four'}`] = reverse ? friendship('four', 'one') : friendship('one', 'four')
      await seed(env, s.entries); await commit(env, s)
      const db = env.authenticatedContext('one', claims('one')).firestore()
      const participants = { ...s.plan.participants, one: { careerInstanceId: 'i_one', bindingState: 'resolved' } }
      await updateDoc(doc(db, 'jointPlans/p'), { memberIds: ['owner', 'one'], participants, updatedAt: serverTimestamp() })
      const batch = writeBatch(db)
      batch.update(doc(db, 'jointPlans/p'), { inviteeIds: [...s.plan.inviteeIds, 'four'],
        participants: { ...participants, four: { careerInstanceId: null, bindingState: 'unresolved' } },
        invitedBy: { ...s.plan.invitedBy, four: 'one' }, updatedAt: serverTimestamp() })
      batch.set(doc(db, 'users/four/activityInbox/jp_p'), { schemaVersion: 1, type: 'JOINT_PLAN_INVITATION', actorUid: 'one',
        createdAt: serverTimestamp(), target: { kind: 'jointPlan', id: 'p' }, readAt: null })
      await batch.commit()
    })
  } finally { await env.cleanup() }
})
