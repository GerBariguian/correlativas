// Focused diagnostics; never imported by app or consolidated test runner.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const sdk = require('firebase/firestore')
const h = require('./helpers.cjs')
let source = fs.readFileSync('tests/rules/friendship-cycle-design.test.cjs', 'utf8')
source = source.slice(source.indexOf('let constructors ='), source.indexOf('for (const padding of'))
const { augmented, fixture, patch, isolatedJoin } = new Function('require', 'fs', 'assert', source + ';return {augmented,fixture,patch,isolatedJoin}')(require, fs, assert)
const originalLifecycle = fs.readFileSync('tests/rules/fixtures/friendship-cycle-design.rules', 'utf8')
const canonical = originalLifecycle.replace('&& d.participants[0] != d.participants[1]', '&& d.participants[0] < d.participants[1]')
  .replace(/\s*&& !existsAfter\([^\n]+\)/, '')
test('fixture contamination reproduced and fixed without changing authorization', () => {
  let broken = fs.readFileSync('tests/rules/joint-join-diagnostic.test.cjs', 'utf8')
  broken = broken.slice(0, broken.indexOf("for (const variant of ['real', 'join-only'])"))
    .replace('= { ...metadata }', '= metadata')
  const old = new Function('require', broken + '\nreturn fixture')(require)
  const first = old(4); first['users/four/careerInstances/i_four'].lifecycle = 'archived'
  assert.equal(first['users/owner/careerInstances/i_owner'].lifecycle, 'archived')
  assert.equal(old(4)['users/four/careerInstances/i_four'].lifecycle, 'archived')
  const fixed = fixture(4); fixed['users/four/careerInstances/i_four'].lifecycle = 'archived'
  assert.equal(fixed['users/owner/careerInstances/i_owner'].lifecycle, 'active')
  assert.equal(fixture(4)['users/four/careerInstances/i_four'].lifecycle, 'active')
})
const client = (env, uid) => env.authenticatedContext(uid, h.claims(uid)).firestore()
const cycle = n => 'cycle_' + String(n).padStart(16, '0')
const friendship = (n, sender = 'a', participants = ['a', 'b'], status = 'pending') => ({ participants, senderId: sender,
  recipientId: participants.find(u => u !== sender), status, cycleId: cycle(n) })
function writeRequest(db, d, certificate = true) {
  const id = d.participants.join(':'), batch = sdk.writeBatch(db)
  batch.set(sdk.doc(db, 'friendships', id), d)
  if (certificate) batch.set(sdk.doc(db, 'usedFriendshipCycles', d.cycleId), { relationshipId: id, participants: d.participants })
  return batch.commit()
}
async function records(env) {
  let value
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore()
    value = { friendships: (await sdk.getDocs(sdk.collection(db, 'friendships'))).docs.map(d => ({ id: d.id, ...d.data() })),
      certificates: (await sdk.getDocs(sdk.collection(db, 'usedFriendshipCycles'))).docs.map(d => ({ id: d.id, ...d.data() })) }
  })
  return value
}
async function transactionalRequest(db, d, trace) {
  const pair = [...d.participants].sort(), id = pair.join(':'), ref = sdk.doc(db, 'friendships', id)
  const proposed = { ...d, participants: pair }
  try { return await sdk.runTransaction(db, async tx => {
    trace.callbacks++
    const current = await tx.get(ref)
    if (current.exists() && ['pending', 'accepted'].includes(current.data().status)) return 'existing-request'
    tx.set(ref, proposed)
    tx.set(sdk.doc(db, 'usedFriendshipCycles', d.cycleId), { relationshipId: id, participants: pair })
    return 'created'
  }, { maxAttempts: 5 }) } catch (error) {
    if (error.code !== 'permission-denied') throw error
    trace.denied = (trace.denied || 0) + 1
    const found = await sdk.getDocFromServer(ref)
    const value = found.data()
    if (!found.exists() || value.participants.join(':') !== id || value.status !== 'pending'
      || !pair.includes(value.senderId) || !pair.includes(value.recipientId) || value.senderId === value.recipientId
      || !/^[A-Za-z0-9_-]{16,64}$/.test(value.cycleId)) throw error
    // Read-only recognition, not a successful creation and never a write retry.
    return 'recognized-request'
  }
}
test('opposite requests repeated diagnostic and canonical prototype', async t => {
  for (const mode of ['old-batch', 'old-without-certificate', 'canonical-transaction']) await t.test(mode, async t => {
    const old = mode !== 'canonical-transaction'
    const rules = mode === 'old-without-certificate'
      ? originalLifecycle.replace(/&& !exists\(c\)[\s\S]*?== d.participants;/, ';') : old ? originalLifecycle : canonical
    const env = await h.initialize(rules)
    const distribution = { A: 0, B: 0, bothRejected: 0, bothCreated: 0, loserExisting: 0, loserRecognized: 0, loserDenied: 0, callbacks: 0, sdkDenied: 0 }
    try {
      for (let round = 0; round < 12; round++) {
        await env.clearFirestore()
        const a = client(env, 'a'), b = client(env, 'b'), trace = { callbacks: 0 }
        const ops = old
          ? [() => writeRequest(a, friendship(round * 2 + 1), mode === 'old-batch'), () => writeRequest(b, friendship(round * 2 + 2, 'b', ['b', 'a']), mode === 'old-batch')]
          : [() => transactionalRequest(a, friendship(round * 2 + 1), trace), () => transactionalRequest(b, friendship(round * 2 + 2, 'b'), trace)]
        const order = round % 2 ? [1, 0] : [0, 1]
        const result = await Promise.allSettled(order.map(i => ops[i]()))
        const state = await records(env)
        assert.ok(state.friendships.length <= 1); assert.equal(state.certificates.length, mode === 'old-without-certificate' ? 0 : state.friendships.length)
        if (!state.friendships.length) distribution.bothRejected++
        else distribution[state.friendships[0].senderId === 'a' ? 'A' : 'B']++
        const created = result.filter(r => r.status === 'fulfilled' && (r.value === 'created' || old)).length
        if (created === 2) distribution.bothCreated++
        distribution.loserExisting += result.filter(r => r.status === 'fulfilled' && r.value === 'existing-request').length
        distribution.loserRecognized += result.filter(r => r.status === 'fulfilled' && r.value === 'recognized-request').length
        distribution.loserDenied += result.filter(r => r.status === 'rejected' && r.reason.code === 'permission-denied').length
        distribution.callbacks += trace.callbacks
        distribution.sdkDenied += trace.denied || 0
        if (!old) {
          assert.equal(state.friendships.length, 1, JSON.stringify(distribution))
          // If SDK surfaces permission-denied, read-only recognition is coherent, never write retry.
          for (const r of result.filter(r => r.status === 'rejected')) {
            assert.equal(r.reason.code, 'permission-denied')
            assert.equal((await sdk.getDocFromServer(sdk.doc(a, 'friendships/a:b'))).data().status, 'pending')
          }
        }
      }
      t.diagnostic(JSON.stringify(distribution))
      assert.equal(distribution.bothCreated, 0)
    } finally { await env.cleanup() }
  })
})

test('canonical lifecycle attacks and certificate binding', async t => {
  const env = await h.initialize(canonical)
  const a = client(env, 'a'), b = client(env, 'b'), x = client(env, 'x')
  try {
    for (const kind of ['inverse', 'missing-certificate', 'mismatched-certificate', 'wrong-pair', 'spoof-sender', 'reused-cycle', 'changed-accepted-cycle']) await t.test(kind, async () => {
      await env.clearFirestore()
      if (kind === 'inverse') return h.assertFails(writeRequest(b, friendship(1, 'b', ['b', 'a'])))
      if (kind === 'spoof-sender') return h.assertFails(writeRequest(x, friendship(1)))
      if (kind === 'missing-certificate') return h.assertFails(sdk.setDoc(sdk.doc(a, 'friendships/a:b'), friendship(1)))
      if (kind === 'mismatched-certificate' || kind === 'wrong-pair') {
        const batch = sdk.writeBatch(a)
        batch.set(sdk.doc(a, 'friendships/a:b'), friendship(1))
        batch.set(sdk.doc(a, 'usedFriendshipCycles', cycle(1)), { relationshipId: kind === 'wrong-pair' ? 'a:x' : 'a:b', participants: ['a', 'x'] })
        await h.assertFails(batch.commit()); assert.equal((await records(env)).friendships.length, 0); return
      }
      await writeRequest(a, friendship(1)); await sdk.updateDoc(sdk.doc(b, 'friendships/a:b'), { status: 'accepted' })
      if (kind === 'changed-accepted-cycle') return h.assertFails(sdk.updateDoc(sdk.doc(a, 'friendships/a:b'), { cycleId: cycle(2) }))
      await sdk.updateDoc(sdk.doc(a, 'friendships/a:b'), { status: 'withdrawn' })
      await h.assertFails(writeRequest(a, friendship(1)))
      await h.assertSucceeds(writeRequest(b, friendship(2, 'b')))
      assert.equal((await records(env)).certificates.length, 2)
    })
  } finally { await env.cleanup() }
})

test('lifecycle access calibration WITHOUT Activity', async t => {
  for (const operation of ['create', 'certificate', 'accept', 'withdraw']) await t.test(operation, async t => {
    const results = []
    for (let n = 0; n <= 11; n++) {
      const padding = Array.from({ length: n }, (_, i) => ` && get(/databases/$(database)/documents/lifecycleProbe/p${i}).data.allowed == true`).join('')
      const prefix = operation === 'create' ? 'allow create: if actor() && shape' : 'allow update: if actor() && shape'
      const rules = operation === 'certificate' ? canonical.replace('return a.cycleId == cycle', 'return true' + padding + ' && a.cycleId == cycle')
        : canonical.replace(prefix, prefix.replace(' && shape', padding + ' && shape'))
      const env = await h.initialize(rules)
      try {
        await env.clearFirestore(); const entries = {}
        if (!['create', 'certificate'].includes(operation)) entries['friendships/a:b'] = friendship(1, 'a', ['a', 'b'], operation === 'accept' ? 'pending' : 'accepted')
        for (let i = 0; i < n; i++) entries[`lifecycleProbe/p${i}`] = { allowed: true }
        await h.seed(env, entries)
        let error
        try {
          if (['create', 'certificate'].includes(operation)) await writeRequest(client(env, 'a'), friendship(1))
          else await sdk.updateDoc(sdk.doc(client(env, operation === 'accept' ? 'b' : 'a'), 'friendships/a:b'), { status: operation === 'accept' ? 'accepted' : 'withdrawn' })
        } catch (err) { error = err }
        if (error) assert.equal(error.code, 'permission-denied')
        results.push({ n, allowed: !error, expressions: /1000 expressions/.test(error?.message || '') })
      } finally { await env.cleanup() }
    }
    t.diagnostic(JSON.stringify({ operation, results })); assert.equal(results[0].allowed, true); assert.equal(results.at(-1).allowed, false)
  })
})

test('CREATE aggregate access calibration WITHOUT Activity', async t => {
  for (const extra of [2, 3]) await t.test(`8 + 8 + ${extra} independent probes`, async () => {
    const checks = (prefix, count) => Array.from({ length: count }, (_, i) => `get(/databases/$(database)/documents/aggregateProbe/${prefix}${i}).data.allowed == true`).join(' && ')
    let rules = canonical.replace('allow create: if actor() && shape', 'allow create: if actor() && ' + checks('request', 8) + ' && shape')
      .replace('return a.cycleId == cycle', 'return ' + checks('certificate', 8) + ' && a.cycleId == cycle')
    rules = rules.replace('function actor()', `match /aggregateWrite/probe { allow create: if ${checks('third', extra)}; }\n    function actor()`)
    const env = await h.initialize(rules)
    try {
      await env.clearFirestore(); const entries = {}
      for (const [prefix, count] of [['request', 8], ['certificate', 8], ['third', extra]])
        for (let i = 0; i < count; i++) entries[`aggregateProbe/${prefix}${i}`] = { allowed: true }
      await h.seed(env, entries)
      const db = client(env, 'a'), batch = sdk.writeBatch(db)
      batch.set(sdk.doc(db, 'friendships/a:b'), friendship(1))
      batch.set(sdk.doc(db, 'usedFriendshipCycles', cycle(1)), { relationshipId: 'a:b', participants: ['a', 'b'] })
      batch.set(sdk.doc(db, 'aggregateWrite/probe'), { probe: true })
      if (extra === 2) await h.assertSucceeds(batch.commit())
      else await h.assertFails(batch.commit())
    } finally { await env.cleanup() }
  })
})

test('old failed calibration: field and placement controls', async t => {
  for (const field of ['ok', 'allowed']) for (const placement of ['before', 'after']) await t.test(field + ' ' + placement, async t => {
    let rules = isolatedJoin(augmented(0))
    const check = ` && get(/databases/$(database)/documents/controlProbe/p0).data.${field} == true`
    rules = placement === 'before' ? rules.replace('&& cycleMatches(before, uid)', '&& cycleMatches(before, uid)' + check)
      : rules.replace('&& joinInstanceMember();', '&& joinInstanceMember()' + check + ';')
    const env = await h.initialize(rules)
    try {
      await env.clearFirestore(); const entries = joinEntries(); entries['controlProbe/p0'] = { [field]: true }; await h.seed(env, entries)
      let error
      try { await sdk.updateDoc(sdk.doc(client(env, 'four'), 'jointPlans/p'), patch(entries['jointPlans/p'], 'four')) } catch (e) { error = e }
      t.diagnostic(JSON.stringify({ field, placement, allowed: !error, error: error?.message }))
      assert.equal(error, undefined)
    } finally { await env.cleanup() }
  })
})

test('original two failed base-plus-one cases: unchanged expectation', async t => {
  for (const kind of ['direct', 'inverse']) await t.test(kind, async () => {
    const env = await h.initialize(augmented(1))
    try {
      await env.clearFirestore(); const entries = fixture(4), p = entries['jointPlans/p']
      p.invitationCycles = Object.fromEntries(p.inviteeIds.map(u => [u, 'cycle_00000000001']))
      for (const path of Object.keys(entries).filter(x => x.startsWith('friendships/'))) entries[path].cycleId = 'cycle_00000000001'
      if (kind === 'inverse') { entries['friendships/four:owner'] = entries['friendships/owner:four']; delete entries['friendships/owner:four'] }
      entries['cycleProbe/p0'] = { ok: true }
      fs.writeFileSync(`.tools/cycle-repro-${kind}.json`, JSON.stringify({ rules: augmented(1), entries }))
      await h.seed(env, entries)
      await h.assertSucceeds(sdk.updateDoc(sdk.doc(client(env, 'four'), 'jointPlans/p'), patch(p, 'four')))
    } finally { await env.cleanup() }
  })
})

function joinEntries(kind = 'direct') {
  const e = fixture(4), p = e['jointPlans/p']; p.invitedBy.four = 'one'
  p.invitationCycles = Object.fromEntries(p.inviteeIds.map(u => [u, cycle(1)]))
  const relationship = kind === 'inverse' ? 'four:one' : 'one:four'
  e['friendships/' + relationship] = { ...h.friendship('one', 'four'), cycleId: cycle(1) }
  if (kind === 'mismatch' || kind === 'stale') e['friendships/' + relationship].cycleId = cycle(2)
  if (kind === 'withdrawn') e['friendships/' + relationship].status = 'withdrawn'
  if (kind === 'owner-only') delete e['friendships/' + relationship]
  return e
}
test('JOIN calibration baseline identity and expressions', async t => {
  for (const mode of ['full', 'only']) for (const kind of ['direct', 'inverse', 'mismatch', 'withdrawn', 'stale', 'owner-only', 'stale-members', 'spoof-inviter']) await t.test(mode + ' ' + kind, async t => {
    const rules = mode === 'only' ? isolatedJoin(augmented(0)) : augmented(0)
    const env = await h.initialize(rules)
    try {
      await env.clearFirestore(); const e = joinEntries(kind); await h.seed(env, e)
      let error
      const change = patch(e['jointPlans/p'], 'four')
      if (kind === 'stale-members') change.memberIds = ['owner', 'four']
      if (kind === 'spoof-inviter') change.invitedBy = { ...e['jointPlans/p'].invitedBy, four: 'owner' }
      try { await sdk.updateDoc(sdk.doc(client(env, 'four'), 'jointPlans/p'), change) } catch (err) { error = err }
      const valid = ['direct', 'inverse'].includes(kind)
      if (valid) assert.equal(error, undefined)
      else assert.equal(error?.code, 'permission-denied')
      if (!valid) {
        let actual
        await env.withSecurityRulesDisabled(async c => { actual = (await sdk.getDocFromServer(sdk.doc(c.firestore(), 'jointPlans/p'))).data() })
        assert.deepEqual(actual, e['jointPlans/p'])
      }
      t.diagnostic(JSON.stringify({ mode, kind, allowed: !error, expressions: /1000 expressions/.test(error?.message || '') }))
    } finally { await env.cleanup() }
  })
})

test('separate valid JOIN padding sweep', async t => {
  for (const kind of ['direct', 'inverse']) await t.test(kind, async t => {
    const results = []
    for (let n = 0; n <= 8; n++) {
      // Identical base for ALL N including zero. Padding is evaluated AFTER complete JOIN.
      let rules = isolatedJoin(augmented(0))
      const reads = Array.from({ length: n }, (_, i) => `get(/databases/$(database)/documents/paddingDocs/p${i}).data.allowed == true`)
      rules = rules.replace('&& joinInstanceMember();', '&& joinInstanceMember()' + reads.map(x => ' && ' + x).join('') + ';')
      const env = await h.initialize(rules)
      try {
        await env.clearFirestore(); const e = joinEntries(kind)
        for (let i = 0; i < n; i++) e[`paddingDocs/p${i}`] = { allowed: true }
        await h.seed(env, e)
        let error
        try { await sdk.updateDoc(sdk.doc(client(env, 'four'), 'jointPlans/p'), patch(e['jointPlans/p'], 'four')) } catch (err) { error = err }
        if (error) assert.equal(error.code, 'permission-denied')
        results.push({ n, allowed: !error, expressions: /1000 expressions/.test(error?.message || '') })
      } finally { await env.cleanup() }
    }
    t.diagnostic(JSON.stringify(results)); assert.equal(results[0].allowed, true)
    assert.equal(results[1].allowed, true); assert.equal(results.at(-1).allowed, false)
  })
})
