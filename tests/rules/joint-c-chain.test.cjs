const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const sdk = require('firebase/firestore'), h = require('./helpers.cjs')
const C1 = 'chaincycle000001x', C2 = 'chaincycle000002x'
const X = 'chainoccurrence01', Y = 'chainoccurrence02'
const resource = /1000\s+expressions|service[ -]call|resource[ -]exhaust|maximum.*(?:access|calls)/i

function load(db, uid, reads) {
  const auth = { currentUser: { uid, emailVerified: true } }
  const checkRead = ref => {
    const p = ref.path
    reads.push({ uid, path: p })
    assert.ok(!p.startsWith('migrationUsers/') || p === `migrationUsers/${uid}`, 'foreign authority read')
    const owner = /^users\/([^/]+)\/careerInstances\//.exec(p)
    assert.ok(!owner || owner[1] === uid, 'foreign careerInstance read')
    assert.ok(!/\/(academic|sharing)\//.test(p), 'unexpected academic/sharing read')
  }
  const scope = { ...sdk, auth, db,
    getDocFromServer: r => { checkRead(r); return sdk.getDocFromServer(r) },
    getDocsFromServer: r => { checkRead(r); return sdk.getDocsFromServer(r) },
    runTransaction: (d, fn) => sdk.runTransaction(d, tx => fn({
      get: r => { checkRead(r); return tx.get(r) },
      set: (...a) => tx.set(...a), update: (...a) => tx.update(...a), delete: (...a) => tx.delete(...a),
    })),
  }
  for (const file of ['careerInstanceLogic.js', 'careerInstancePersistenceLogic.js', 'userDataAuthorityLogic.js',
    'friendshipCycleLogic.js', 'activityLogic.js', 'socialMaintenance.js', 'jointPlanLogic.js', 'jointJoinLogic.js',
    'services/friends.js', 'services/jointPlans.js', 'services/jointJoin.js']) {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src', file), 'utf8')
    const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(x => x[1])
    const code = source.replace(/import[\s\S]*?from ['"][^'"]+['"]\s*/g, '').replace(/export /g, '')
    Object.assign(scope, new Function(...Object.keys(scope), code + `;return {${names.join(',')}}`)(...Object.values(scope)))
  }
  return scope
}

test('S2-V integrated real-service chains / product Rules', async t => {
  const env = await h.initialize(), evidence = [], reads = []
  let validPathFailure = null
  async function valid(label, fn) {
    try { const value = await fn(); evidence.push({ label, result: 'PASS' }); return value }
    catch (e) {
      validPathFailure = { label, code: e.code, message: e.message, resource: resource.test(e.message) }
      throw e
    }
  }
  async function adminGet(p) {
    let result
    await env.withSecurityRulesDisabled(async c => { result = (await sdk.getDocFromServer(sdk.doc(c.firestore(), p))).data() })
    return result
  }
  async function denied(db, p) {
    await assert.rejects(sdk.getDocFromServer(sdk.doc(db, p)), e => {
      assert.equal(e.code, 'permission-denied')
      evidence.push({ label: p, result: resource.test(e.message) ? 'RESOURCE BLOCKED' : 'LOGICAL DENY' })
      return true
    })
  }
  try {
    for (const reinvite of [false, true]) {
      if (validPathFailure) break // No resource optimization or further probes after a valid failure.
      await t.test(reinvite ? 'real re-friend + pending REINVITE + JOIN + RELEASE' : 'REQUEST through RELEASE, explicit discovery and history', async () => {
        await env.clearFirestore()
        // Only external preconditions: legitimately established controls and own academic instances.
        const seed = {}
        for (const uid of ['alice', 'bob']) {
          seed[`migrationUsers/${uid}`] = { schemaVersion: 1, generation: 'multicareer-v1', authority: 'instances',
            phase: 'complete', origin: 'legacy', manifestId: uid, updatedAt: h.TIME }
          seed[`users/${uid}/careerInstances/i_${uid}`] = { schemaVersion: 1, catalogId: 'catalog', lifecycle: 'active',
            createdAt: h.TIME, updatedAt: h.TIME, archivedAt: null }
        }
        await h.seed(env, seed)
        const da = env.authenticatedContext('alice', h.claims('alice')).firestore()
        const db = env.authenticatedContext('bob', h.claims('bob')).firestore()
        const a = load(da, 'alice', reads), b = load(db, 'bob', reads)
        await valid('REQUEST C1', () => a.sendFriendshipCycleRequest('alice', 'bob', C1))
        await valid('ACCEPT C1', () => b.respondToFriendshipCycle('bob', 'alice', C1, 'accepted'))
        assert.equal((await adminGet('friendships/alice:bob')).status, 'accepted')
        await denied(da, 'users/bob/careerInstances/i_bob/sharing/snapshot')
        const p = await valid('CREATE C', () => a.createJointCPlan('alice', 'i_alice', 'catalog'))
        const root = `jointPlans/${p}`
        const found = await valid('owner discovery', () => a.discoverJointCPlans('alice'))
        assert.deepEqual(found.plans.map(x => x.planId), [p]); assert.deepEqual(found.unavailable, [])
        await valid('NEW', () => a.inviteJointCParticipant('alice', p, 'slot1', 'bob', X, C1, 0))
        await denied(da, `users/bob/jointPlanRefs/${p}`)
        const inviteeFound = await valid('invitee discovery', () => b.discoverJointCPlans('bob'))
        assert.deepEqual(inviteeFound.plans.map(x => x.planId), [p]); assert.deepEqual(inviteeFound.unavailable, [])
        let occurrence = X, cycle = C1, revision = 1
        if (reinvite) {
          await valid('withdraw C1', () => a.withdrawFriendshipCycle('alice', 'bob', C1))
          await valid('REQUEST C2', () => a.sendFriendshipCycleRequest('alice', 'bob', C2))
          await valid('ACCEPT C2', () => b.respondToFriendshipCycle('bob', 'alice', C2, 'accepted'))
          await assert.rejects(b.joinJointCPlan({ db, auth: b.auth }, 'bob', p, X, 'i_bob'))
          await valid('REINVITE', () => a.inviteJointCParticipant('alice', p, 'slot1', 'bob', Y, C2, 1, X))
          occurrence = Y; cycle = C2; revision = 2
          await assert.rejects(b.joinJointCPlan({ db, auth: b.auth }, 'bob', p, X, 'i_bob'))
          assert.ok(await adminGet(root + '/invitationOccurrences/' + X))
        }
        const o = await valid('exact occurrence', () => b.readJointCInvitationOccurrence('bob', p, occurrence))
        assert.equal(o.occurrence.cycle, cycle); assert.equal(o.occurrence.uid, 'bob')
        assert.equal(o.occurrence.slotId, 'slot1'); assert.equal(o.occurrence.revision, revision)
        const noticePath = `users/bob/activityInbox/sp_${p}_${occurrence}`
        const notice = await sdk.getDocFromServer(sdk.doc(db, noticePath))
        assert.equal(notice.data().cycle, cycle); assert.equal(notice.data().occurrence, occurrence)
        assert.equal((await adminGet('friendships/alice:bob')).cycleId, cycle)
        await valid('JOIN', () => b.joinJointCPlan({ db, auth: b.auth }, 'bob', p, occurrence, 'i_bob'))
        const plan = await valid('read parent', () => b.readJointCPlan('bob', p))
        assert.equal(plan.plan.schemaVersion, 3)
        const member = await valid('read member slot', () => b.readJointCSlot('bob', p, 'slot1'))
        assert.equal(member.slot.status, 'member'); assert.equal(member.slot.binding, 'i_bob')
        assert.equal(member.slot.joinedOccurrence, occurrence)
        for (const suffix of ['', '/academic/progress', '/sharing/snapshot']) await denied(da, 'users/bob/careerInstances/i_bob' + suffix)
        const history = await adminGet(root + '/invitationOccurrences/' + occurrence)
        await valid('RELEASE', () => b.releaseJointCSlot({ db, auth: b.auth }, 'bob', p, 'slot1', occurrence, revision))
        const released = await valid('owner reads empty slot', () => a.readJointCSlot('alice', p, 'slot1'))
        assert.equal(released.slot.status, 'empty'); assert.equal(released.slot.revision, revision + 1)
        assert.equal(released.slot.uid, null); assert.equal(released.slot.occurrence, null)
        assert.equal(await adminGet(root + '/inviteeIndex/bob'), undefined)
        assert.deepEqual(await adminGet(root + '/invitationOccurrences/' + occurrence), history)
        assert.deepEqual(await adminGet(noticePath), notice.data())
        assert.ok(await adminGet(`users/bob/jointPlanRefs/${p}`))
        await assert.rejects(b.joinJointCPlan({ db, auth: b.auth }, 'bob', p, occurrence, 'i_bob'))
        await assert.rejects(b.releaseJointCSlot({ db, auth: b.auth }, 'bob', p, 'slot1', occurrence, revision))
        assert.deepEqual(await adminGet(root + '/slots/slot1'), released.slot)
      })
    }
  } finally {
    t.diagnostic(JSON.stringify({ evidence, validPathFailure, clientReads: reads }))
    await env.cleanup()
  }
})
