// Isolated lifecycle proof and in-memory augmentation of real JOIN Rules.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const sdk = require('firebase/firestore')
const h = require('./helpers.cjs')
const C1 = 'cycle_00000000001', C2 = 'cycle_00000000002'
const client = (env, uid) => env.authenticatedContext(uid, h.claims(uid)).firestore()
const data = (cycle = C1, sender = 'a', status = 'pending') => ({ participants: ['a', 'b'], senderId: sender,
  recipientId: sender === 'a' ? 'b' : 'a', status, cycleId: cycle })
function request(db, d, id = 'a:b', certificate = true) {
  const b = sdk.writeBatch(db)
  b.set(sdk.doc(db, 'friendships', id), d)
  if (certificate) b.set(sdk.doc(db, 'usedFriendshipCycles', d.cycleId), { relationshipId: id, participants: d.participants })
  return b.commit()
}
test('cycle lifecycle isolated proof', async t => {
  const env = await h.initialize(fs.readFileSync('tests/rules/fixtures/friendship-cycle-design.rules', 'utf8'))
  const a = client(env, 'a'), b = client(env, 'b'), outsider = client(env, 'outsider')
  const update = (db, change) => sdk.updateDoc(sdk.doc(db, 'friendships/a:b'), change)
  const reset = async () => { await env.clearFirestore(); await request(a, data()) }
  try {
    await t.test('atomic request, accept, withdraw, reverse sender new cycle', async () => {
      await reset(); await h.assertSucceeds(update(b, { status: 'accepted' }))
      await h.assertSucceeds(update(a, { status: 'withdrawn' }))
      await h.assertSucceeds(request(b, data(C2, 'b')))
      await h.assertSucceeds(update(a, { status: 'accepted' }))
    })
    await t.test('neither half accepted alone', async () => {
      await env.clearFirestore(); await h.assertFails(request(a, data(), 'a:b', false))
      await h.assertFails(sdk.setDoc(sdk.doc(a, 'usedFriendshipCycles', C1), { relationshipId: 'a:b', participants: ['a', 'b'] }))
    })
    await t.test('old cycle cannot be reused after withdrawal', async () => {
      await reset(); await update(b, { status: 'accepted' }); await update(a, { status: 'withdrawn' })
      await h.assertFails(request(a, data()))
      await h.assertFails(request(a, data(), 'a:b', false))
    })
    await t.test('accepted cycle immutable and outsider denied', async () => {
      await reset(); await update(b, { status: 'accepted' })
      await h.assertFails(update(a, { cycleId: C2 }))
      await h.assertFails(update(outsider, { status: 'withdrawn' }))
    })
    await t.test('certificate and relationship cannot be deleted', async () => {
      await reset(); await h.assertFails(sdk.deleteDoc(sdk.doc(a, 'usedFriendshipCycles', C1)))
      await h.assertFails(sdk.deleteDoc(sdk.doc(a, 'friendships/a:b')))
    })
    await t.test('reject then new cycle; sender cannot accept own request', async () => {
      await reset(); await h.assertFails(update(a, { status: 'accepted' })); await update(b, { status: 'rejected' })
      await h.assertSucceeds(request(a, data(C2)))
    })
    await t.test('opposite orientation cannot coexist', async () => {
      await reset(); await h.assertFails(request(b, { ...data(C2, 'b'), participants: ['b', 'a'] }, 'b:a'))
    })
    await t.test('simultaneous opposite initial requests: one succeeds', async () => {
      await env.clearFirestore()
      const r = await Promise.allSettled([request(a, data()), request(b, { ...data(C2, 'b'), participants: ['b', 'a'] }, 'b:a')])
      assert.equal(r.filter(x => x.status === 'fulfilled').length, 1)
    })
    await t.test('simultaneous re-friend: one cycle wins', async () => {
      await reset(); await update(a, { status: 'withdrawn' })
      const r = await Promise.allSettled([request(a, data(C2)), request(b, data('cycle_00000000003', 'b'))])
      assert.equal(r.filter(x => x.status === 'fulfilled').length, 1)
    })
  } finally { await env.cleanup() }
})

let constructors = fs.readFileSync('tests/rules/joint-join-diagnostic.test.cjs', 'utf8')
constructors = constructors.slice(0, constructors.indexOf("for (const variant of ['real', 'join-only'])"))
const { fixture, patch, isolatedJoin } = new Function('require', constructors + '\nreturn {fixture,patch,isolatedJoin}')(require)
function augmented(padding = 0) {
  let rules = fs.readFileSync('firestore.rules', 'utf8')
  const marker = "'participants', 'name', 'invitedBy', 'closed', 'deleting', 'createdAt', 'updatedAt']"
  assert.equal(rules.split(marker).length - 1, 2)
  rules = rules.replaceAll(marker, "'participants', 'name', 'invitedBy', 'closed', 'deleting', 'createdAt', 'updatedAt', 'invitationCycles']")
  rules = rules.replace('function joinInstanceMember() {', `function cycleMatches(p, uid) {
    let inviter = p.invitedBy[uid];
    let f = getAfter(/databases/$(database)/documents/friendships/$(inviter + ':' + uid));
    let r = getAfter(/databases/$(database)/documents/friendships/$(uid + ':' + inviter));
    return (f != null && r == null && f.data.status == 'accepted' && f.data.cycleId == p.invitationCycles[uid])
      || (r != null && f == null && r.data.status == 'accepted' && r.data.cycleId == p.invitationCycles[uid]);
  }
  function joinInstanceMember() {`)
  const needle = '&& !before.closed && !before.deleting && proposalAuthority(uid)'
  assert.ok(rules.includes(needle))
  rules = rules.replace(needle, needle + ' && cycleMatches(before, uid)' + Array.from({ length: padding }, (_, n) =>
    ` && get(/databases/$(database)/documents/cycleProbe/p${n}).data.ok == true`).join(''))
  // Calibration must not confuse rejection alternatives with the access boundary.
  return padding ? isolatedJoin(rules) : rules
}
for (const padding of [0, 1, 2, 3, 4, 5, 6, 7]) test(`real JOIN structure + cycle design; padding ${padding}`, async t => {
  const env = await h.initialize(augmented(padding))
  try {
    const cases = padding ? ['direct', 'inverse'] : ['direct', 'inverse', 'mismatch', 'withdrawn', 'missing', 'wrong-inviter', 'member-inviter', 'closed', 'archived', 'frozen', 'both-orientations']
    for (const kind of cases) await t.test(kind, async () => {
      await env.clearFirestore(); const entries = fixture(4), p = entries['jointPlans/p']
      p.invitationCycles = Object.fromEntries(p.inviteeIds.map(u => [u, C1]))
      for (const path of Object.keys(entries).filter(x => x.startsWith('friendships/'))) entries[path].cycleId = C1
      if (kind === 'inverse') { entries['friendships/four:owner'] = entries['friendships/owner:four']; delete entries['friendships/owner:four'] }
      if (kind === 'mismatch') entries['friendships/owner:four'].cycleId = C2
      if (kind === 'withdrawn') entries['friendships/owner:four'].status = 'withdrawn'
      if (kind === 'missing') delete entries['friendships/owner:four']
      if (kind === 'wrong-inviter' || kind === 'member-inviter') p.invitedBy.four = 'one'
      if (kind === 'member-inviter') entries['friendships/one:four'] = { ...h.friendship('one', 'four'), cycleId: C1 }
      if (kind === 'closed') p.closed = true
      if (kind === 'archived') entries['users/four/careerInstances/i_four'].lifecycle = 'archived'
      if (kind === 'frozen') entries['migrationUsers/four'].authority = 'frozen'
      if (kind === 'both-orientations') entries['friendships/four:owner'] = entries['friendships/owner:four']
      for (let n = 0; n < padding; n++) entries[`cycleProbe/p${n}`] = { ok: true }
      if (padding === 1) fs.writeFileSync(`.tools/cycle-original-${kind}.json`, JSON.stringify({ rules: augmented(padding), entries }))
      await h.seed(env, entries)
      let error
      try { await sdk.updateDoc(sdk.doc(client(env, 'four'), 'jointPlans/p'), patch(p, 'four')) } catch (e) { error = e }
      if (!padding) {
        const allowed = ['direct', 'inverse', 'member-inviter'].includes(kind)
        if (allowed) assert.equal(error, undefined)
        else assert.equal(error?.code, 'permission-denied')
      } else {
        // Observation, not a claimed authorization regression PASS. Earlier numeric
        // estimates failed; report actual boundary without assuming path == call.
        if (error) assert.equal(error.code, 'permission-denied')
        if (padding === 1) assert.equal(error, undefined)
        if (padding === 7) assert.equal(error?.code, 'permission-denied')
      }
      t.diagnostic(`allow=${!error}; expressions1000=${/1000 expressions/.test(error?.message || '')}; extraDistinctReads=${padding}`)
    })
  } finally { await env.cleanup() }
})
