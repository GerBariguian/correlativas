const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const sdk = require('firebase/firestore')
const h = require('./helpers.cjs')
const { load: loadPlans, fixture } = require('../joint-c-invite-harness.cjs')
const C1 = 'cycle_00000000001', C2 = 'cycle_00000000002'
const relationship = 'friendships/german:juan'
const resource = /1000\s+expressions|service[ -]call|resource[ -]exhaust|maximum.*(?:access|calls)/i

// Loads the actual D1/D2/D3 modules with the real Emulator SDK, not policy mocks.
function loadFriends(db, uid) {
  const context = { ...sdk, db, auth: { currentUser: { uid, emailVerified: true } } }
  for (const file of ['friendshipCycleLogic.js', 'activityLogic.js', 'socialMaintenance.js', 'services/friends.js']) {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src', file), 'utf8')
    const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(x => x[1])
    const code = source.replace(/import[\s\S]*?from ['"][^'"]+['"]\s*/g, '').replace(/export /g, '')
    Object.assign(context, new Function(...Object.keys(context), `${code};return {${names.join(',')}}`)(...Object.values(context)))
  }
  return context
}
function timestamps(v) {
  if (Array.isArray(v)) return v.map(timestamps)
  if (v && typeof v === 'object') {
    if (Object.keys(v).sort().join() === 'nanoseconds,seconds') return new sdk.Timestamp(v.seconds, v.nanoseconds)
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, timestamps(x)]))
  }
  return v
}

test('RC-2/RC-3 real services, product Rules, and accepted RC-1 boundary', async t => {
  const env = await h.initialize(), clients = new Map(), evidence = []
  let validFailure = null
  const db = uid => {
    if (!clients.has(uid)) clients.set(uid, env.authenticatedContext(uid, h.claims(uid)).firestore())
    return clients.get(uid)
  }
  const api = uid => loadFriends(db(uid), uid)
  const ref = (uid, p) => sdk.doc(db(uid), p)
  const get = async (uid, p) => (await sdk.getDoc(ref(uid, p))).data()
  const request = (cycle = C1, sender = 'german', recipient = 'juan') => api(sender).sendFriendshipCycleRequest(sender, recipient, cycle)
  const accept = (cycle = C1) => api('juan').respondToFriendshipCycle('juan', 'german', cycle, 'accepted')
  const withdraw = (cycle = C1, uid = 'german') => api(uid).withdrawFriendshipCycle(uid, uid === 'german' ? 'juan' : 'german', cycle)
  async function adminGet(p) {
    // withSecurityRulesDisabled returns Promise<void>, not the callback result.
    let data
    await env.withSecurityRulesDisabled(async c => {
      data = (await sdk.getDocFromServer(sdk.doc(c.firestore(), p))).data()
    })
    return data
  }
  async function reset() { await h.baseline(env) }
  // A failing valid path halts subsequent work, including negative probes.
  async function valid(label, fn) {
    if (validFailure) throw validFailure
    try { const value = await fn(); evidence.push({ label, classification: 'PASS' }); return value }
    catch (error) {
      evidence.push({ label, classification: resource.test(error.message) ? 'VALID PATH RESOURCE BLOCKED' : 'VALID PATH FAILED', code: error.code, message: error.message })
      validFailure = error; throw error
    }
  }
  async function denied(label, fn) {
    let error
    try { await fn() } catch (e) { error = e }
    assert.ok(error, label + ': unexpectedly ALLOWED')
    assert.equal(error.code, 'permission-denied', label + ': unexpected error')
    const classification = resource.test(error.message) ? 'RESOURCE BLOCKED' : 'LOGICAL DENY'
    evidence.push({ label, classification, message: error.message })
    t.diagnostic(JSON.stringify({ label, classification }))
    // Resource denial is recorded debt, NEVER reported as logical proof.
  }
  async function run(label, fn) {
    if (validFailure) return
    await t.test(label, async () => { await reset(); await fn() })
  }
  function requestWrites(cycle = C1, sender = 'german', recipient = 'juan') {
    const a = api(sender), id = a.canonicalFriendshipId(sender, recipient)
    const next = a.buildFriendshipCycleRequest({ senderId: sender, recipientId: recipient, cycleId: cycle, reservations: [] })
    return [
      ['friendships/' + id, next.friendship],
      ['usedFriendshipCycles/' + cycle, next.reservation.data],
      [`users/${recipient}/activityInbox/fr_${cycle}`, a.newFriendshipCycleActivity('FRIEND_REQUEST', sender, id, cycle, sdk.serverTimestamp())],
    ]
  }
  const write = async (uid, entries) => {
    const batch = sdk.writeBatch(db(uid))
    for (const [p, data] of entries) batch.set(ref(uid, p), data)
    return batch.commit()
  }
  const pending = () => valid('setup REQUEST', () => request())
  async function rejectedBatch(label, entries, actor = 'german') {
    const before = await Promise.all(entries.map(([p]) => adminGet(p)))
    await denied(label, () => write(actor, entries))
    assert.deepEqual(await Promise.all(entries.map(([p]) => adminGet(p))), before, 'no partial state')
  }
  try {
    await run('REQUEST + ACCEPT real services / exact DTOs / atomic notices', async () => {
      await pending()
      assert.deepEqual(await adminGet('usedFriendshipCycles/' + C1), { relationshipId: 'german:juan', participants: ['german', 'juan'] })
      await valid('ACCEPT', () => accept())
      assert.equal((await get('german', relationship)).status, 'accepted')
      assert.deepEqual(await adminGet('usedFriendshipCycles/' + C1), { relationshipId: 'german:juan', participants: ['german', 'juan'] })
      for (const [uid, type, prefix] of [['juan', 'FRIEND_REQUEST', 'fr_'], ['german', 'FRIEND_ACCEPTED', 'fa_']]) {
        const n = await get(uid, `users/${uid}/activityInbox/${prefix}${C1}`)
        assert.equal(n.type, type); assert.equal(n.schemaVersion, 2); assert.equal(n.friendshipCycleId, C1)
        assert.equal(n.readAt, null); assert.ok(n.createdAt instanceof sdk.Timestamp)
      }
    })
    await run('reverse sender uses the same canonical identity', async () => {
      await valid('reverse REQUEST', () => request(C1, 'juan', 'german'))
      await valid('reverse ACCEPT', () => api('german').respondToFriendshipCycle('german', 'juan', C1, 'accepted'))
      assert.equal((await get('juan', relationship)).senderId, 'juan')
      assert.equal(await adminGet('friendships/juan:german'), undefined)
    })
    for (const ending of ['rejected', 'pending-withdraw', 'accepted-withdraw']) await run('RC-3 ' + ending + ' C1 -> C2', async () => {
      await pending()
      if (ending === 'accepted-withdraw') await valid('C1 ACCEPT', () => accept())
      await valid('end C1', () => ending === 'rejected'
        ? api('juan').respondToFriendshipCycle('juan', 'german', C1, 'rejected') : withdraw())
      const cert = await adminGet('usedFriendshipCycles/' + C1)
      assert.deepEqual(cert, { relationshipId: 'german:juan', participants: ['german', 'juan'] })
      const history = await get('juan', 'users/juan/activityInbox/fr_' + C1)
      if (ending !== 'rejected') await valid('repeated WITHDRAW no-op', () => withdraw())
      await valid('C2 REQUEST', () => request(C2)); await valid('C2 ACCEPT', () => accept(C2))
      assert.equal((await get('german', relationship)).cycleId, C2)
      assert.equal((await get('german', relationship)).status, 'accepted')
      assert.deepEqual(await adminGet('usedFriendshipCycles/' + C1), cert)
      assert.notEqual(C1, C2) // Identity lives in the path, not in the reservation DTO.
      assert.deepEqual(await adminGet('usedFriendshipCycles/' + C2), cert)
      assert.deepEqual(await get('juan', 'users/juan/activityInbox/fr_' + C1), history)
      await assert.rejects(accept(C1), /STALE/); await assert.rejects(withdraw(C1), /STALE/)
      for (const status of ['accepted', 'withdrawn']) await denied('raw stale C1 ' + status, () => sdk.updateDoc(ref('juan', relationship), { cycleId: C1, status }))
      await valid('end C2', () => withdraw(C2))
      await rejectedBatch('reserved C1 reuse', requestWrites(C1))
    })
    await run('historical Activity readAt is independent and cannot be replayed after deletion', async () => {
      await pending(); await valid('withdraw', () => withdraw()); await valid('C2 request', () => request(C2))
      const p = 'users/juan/activityInbox/fr_' + C1
      await valid('historical readAt', () => sdk.updateDoc(ref('juan', p), { readAt: sdk.serverTimestamp() }))
      assert.ok((await get('juan', p)).readAt instanceof sdk.Timestamp)
      assert.equal((await get('juan', 'users/juan/activityInbox/fr_' + C2)).readAt, null)
      await valid('owner deletes historical notice', () => sdk.deleteDoc(ref('juan', p)))
      await rejectedBatch('historical notice recreation', [requestWrites(C1)[2]])
    })
    for (const [label, keep] of [['request without reservation', [0, 2]], ['request without Activity', [0, 1]], ['orphan reservation', [1]], ['orphan Activity', [2]]]) {
      await run(label, () => rejectedBatch(label, requestWrites().filter((_, i) => keep.includes(i))))
    }
    const mutations = [
      ['cycle mismatch', w => { w[0][1] = { ...w[0][1], cycleId: C2 } }],
      ['invalid cycle', w => { w[0][1] = { ...w[0][1], cycleId: 'short' } }],
      ['friendship extra', w => { w[0][1] = { ...w[0][1], extra: true } }],
      ['noncanonical orientation', w => { w[0] = ['friendships/juan:german', { ...w[0][1], participants: ['juan', 'german'] }] }],
      ['reservation relationship spoof', w => { w[1][1] = { ...w[1][1], relationshipId: 'german:pedro' } }],
      ['reservation extra', w => { w[1][1] = { ...w[1][1], extra: true } }],
      ['Activity cycle spoof', w => { w[2][1] = { ...w[2][1], friendshipCycleId: C2 } }],
      ['Activity actor spoof', w => { w[2][1] = { ...w[2][1], actorUid: 'pedro' } }],
      ['Activity target spoof', w => { w[2][1] = { ...w[2][1], target: { kind: 'friendship', id: 'german:pedro' } } }],
      ['Activity schema spoof', w => { w[2][1] = { ...w[2][1], schemaVersion: 1 } }],
      ['Activity timestamp spoof', w => { w[2][1] = { ...w[2][1], createdAt: h.TIME } }],
      ['Activity extra', w => { w[2][1] = { ...w[2][1], extra: true } }],
      ['Activity readAt spoof', w => { w[2][1] = { ...w[2][1], readAt: h.TIME } }],
    ]
    for (const [label, mutate] of mutations) await run(label, async () => { const w = requestWrites(); mutate(w); await rejectedBatch(label, w) })
    await run('outsider/anonymous cannot request or read private source', async () => {
      await rejectedBatch('outsider sender', requestWrites(), 'pedro')
      const anon = env.unauthenticatedContext().firestore(), b = sdk.writeBatch(anon)
      for (const [p, d] of requestWrites()) b.set(sdk.doc(anon, p), d)
      await denied('anonymous request', () => b.commit())
    })
    await run('accept missing notice and notice missing transition leave source unchanged', async () => {
      await pending()
      await denied('accept without notice', () => sdk.updateDoc(ref('juan', relationship), { status: 'accepted' }))
      const n = api('juan').newFriendshipCycleActivity('FRIEND_ACCEPTED', 'juan', 'german:juan', C1, sdk.serverTimestamp())
      await rejectedBatch('accept notice without transition', [['users/german/activityInbox/fa_' + C1, n]], 'juan')
      assert.equal((await get('juan', relationship)).status, 'pending')
    })
    await run('C1 notices cannot satisfy C2 request or acceptance', async () => {
      await pending(); await valid('C1 accept', () => accept()); await valid('C1 withdraw', () => withdraw())
      const writes = requestWrites(C2)
      await rejectedBatch('historical fr_C1 does not satisfy REQUEST C2', writes.slice(0, 2))
      await valid('real REQUEST C2', () => request(C2))
      await denied('historical fa_C1 does not satisfy ACCEPT C2', () => sdk.updateDoc(ref('juan', relationship), { status: 'accepted' }))
      const current = await get('juan', relationship)
      assert.equal(current.status, 'pending'); assert.equal(current.cycleId, C2)
      await valid('real ACCEPT C2', () => accept(C2))
    })
    await run('replay request/accept and unauthorized responses', async () => {
      await pending(); await rejectedBatch('request replay', requestWrites())
      await denied('sender cannot accept', () => sdk.updateDoc(ref('german', relationship), { status: 'accepted' }))
      await denied('outsider cannot withdraw', () => sdk.updateDoc(ref('pedro', relationship), { status: 'withdrawn' }))
      await valid('accept once', () => accept())
      await denied('raw acceptance replay', () => sdk.updateDoc(ref('juan', relationship), { status: 'accepted' }))
      await assert.rejects(accept())
    })
    await run('immutable reservation and private Activity / no automatic academic access', async () => {
      await pending(); await valid('ACCEPT for privacy', () => accept())
      const p = 'usedFriendshipCycles/' + C1
      await denied('reservation mutation', () => sdk.updateDoc(ref('german', p), { relationshipId: 'german:pedro' }))
      await denied('reservation identical rewrite', () => sdk.setDoc(ref('german', p), { relationshipId: 'german:juan', participants: ['german', 'juan'] }))
      await denied('reservation delete', () => sdk.deleteDoc(ref('german', p)))
      await denied('reservation read', () => sdk.getDoc(ref('german', p)))
      await denied('other inbox GET', () => sdk.getDoc(ref('german', 'users/juan/activityInbox/fr_' + C1)))
      await denied('other inbox LIST', () => sdk.getDocs(sdk.collection(db('german'), 'users/juan/activityInbox')))
      await denied('other readAt', () => sdk.updateDoc(ref('german', 'users/juan/activityInbox/fr_' + C1), { readAt: sdk.serverTimestamp() }))
      for (const p of ['users/juan/careers/test-career', 'users/juan/careerInstances/private', 'users/juan/careerProjections/test-career']) {
        await denied('private ' + p, () => sdk.getDoc(ref('german', p)))
      }
      await valid('owner inbox LIST', () => sdk.getDocs(sdk.collection(db('juan'), 'users/juan/activityInbox')))
    })
    await run('legacy friendship is not converted; legacy request/accept still works', async () => {
      await valid('legacy request', () => api('german').sendFriendRequest('german', 'juan'))
      await valid('legacy accept', () => api('juan').respondToFriendRequest('juan', 'german:juan', 'accepted'))
      assert.equal((await get('german', relationship)).cycleId, undefined)
      await rejectedBatch('legacy conversion', requestWrites())
      await h.seed(env, { [relationship]: h.friendship('german', 'juan', 'rejected') })
      await rejectedBatch('ended legacy conversion', requestWrites())
    })
    await run('reverse legacy relationship blocks versioned parallel request', async () => {
      await h.seed(env, { 'friendships/juan:german': h.friendship('juan', 'german', 'rejected') })
      await rejectedBatch('reverse legacy coexistence', requestWrites())
    })
    await run('old client cannot update versioned friendship through legacy branch', async () => {
      await pending()
      await denied('legacy reject on C', () => sdk.updateDoc(ref('juan', relationship), { status: 'rejected', updatedAt: sdk.serverTimestamp() }))
      assert.equal((await get('juan', relationship)).status, 'pending')
    })
    await run('opposed concurrent requests: one source, certificate, notice, never autoaccept', async () => {
      const results = await Promise.allSettled([request(C1), request(C2, 'juan', 'german')])
      for (const x of results) if (x.status === 'rejected' && resource.test(x.reason.message)) {
        validFailure = x.reason; throw x.reason
      }
      assert.equal(results.filter(x => x.status === 'fulfilled').length, 1)
      const current = await get('german', relationship)
      assert.equal(current.status, 'pending'); assert.equal(await adminGet('friendships/juan:german'), undefined)
      const certs = await Promise.all([C1, C2].map(c => adminGet('usedFriendshipCycles/' + c)))
      assert.equal(certs.filter(Boolean).length, 1)
      const winner = [C1, C2].indexOf(current.cycleId)
      assert.notEqual(winner, -1)
      assert.deepEqual(certs[winner], { relationshipId: 'german:juan', participants: ['german', 'juan'] })
      assert.equal(certs[1 - winner], undefined)
      const notices = await Promise.all(['users/juan/activityInbox/fr_' + C1, 'users/german/activityInbox/fr_' + C2].map(adminGet))
      assert.equal(notices.filter(Boolean).length, 1)
      assert.equal(notices[winner].friendshipCycleId, current.cycleId)
      assert.equal(notices[winner].actorUid, current.senderId)
      assert.equal(notices[1 - winner], undefined)
    })
    // Minimal RC-1 regression: existing known resource denials remain debt, not proof.
    for (const version of ['legacy', 'v2']) await run('RC-1 ' + version + ' JOIN denied / history preserved', async () => {
      const data = version === 'legacy' ? h.plan('german', ['juan'], ['german']) : {
        schemaVersion: 2, ownerId: 'alice', catalogId: 'catalog', inviteeIds: ['bob'], memberIds: ['alice'],
        participants: { alice: { careerInstanceId: 'ia', bindingState: 'resolved' }, bob: { careerInstanceId: null, bindingState: 'unresolved' } },
        name: 'Plan', invitedBy: { bob: 'alice' }, closed: false, deleting: false, createdAt: h.TIME, updatedAt: h.TIME,
      }
      await h.seed(env, { ...timestamps(fixture()), ['jointPlans/' + version]: data })
      const actor = version === 'legacy' ? 'juan' : 'bob', owner = data.ownerId
      const patch = { memberIds: [owner, actor], updatedAt: sdk.serverTimestamp() }
      if (version === 'v2') patch.participants = { ...data.participants, bob: { careerInstanceId: 'i_bob', bindingState: 'resolved' } }
      await denied('RC1 ' + version + ' JOIN', () => sdk.updateDoc(ref(actor, 'jointPlans/' + version), patch))
      await valid('RC1 historical read', () => get(owner, 'jointPlans/' + version))
      await valid('RC1 owner close', () => sdk.updateDoc(ref(owner, 'jointPlans/' + version), { closed: true, updatedAt: sdk.serverTimestamp() }))
    })
    await run('RC-1 legacy leave/rename and native C create remain available', async () => {
      await h.seed(env, { ...timestamps(fixture()), 'jointPlans/legacy': h.plan('german', ['juan'], ['german', 'juan']) })
      await valid('RC1 rename', () => sdk.updateDoc(ref('juan', 'jointPlans/legacy'), { name: 'Renamed', updatedAt: sdk.serverTimestamp() }))
      await valid('RC1 leave', async () => {
        const b = sdk.writeBatch(db('juan'))
        b.update(ref('juan', 'jointPlans/legacy'), { memberIds: ['german'], inviteeIds: [], invitedBy: {}, updatedAt: sdk.serverTimestamp() })
        b.delete(ref('juan', 'users/juan/activityInbox/jp_legacy')); await b.commit()
      })
      await valid('RC1 C CREATE', () => loadPlans(sdk, { currentUser: { uid: 'alice' } }, db('alice')).createJointCPlan('alice', 'ia', 'catalog'))
    })
  } finally {
    t.diagnostic(JSON.stringify({ evidence, validPathFailure: validFailure?.message || null, negativeResourceDebt: evidence.filter(x => x.classification === 'RESOURCE BLOCKED').map(x => x.label) }))
    await env.cleanup()
  }
})
