// Diagnostic only. Never imported by the application or the consolidated runner.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const sdk = require('firebase/firestore')
const { FirebaseError } = require('firebase/app')
const h = require('./helpers.cjs')
const original = fs.readFileSync('firestore.rules', 'utf8')
const users = ['owner', 'one', 'two', 'three', 'four']
const metadata = { schemaVersion: 1, catalogId: 'catalog', lifecycle: 'active', createdAt: h.TIME, updatedAt: h.TIME, archivedAt: null }
const control = uid => ({ schemaVersion: 1, generation: 'multicareer-v1', authority: 'instances', phase: 'complete', origin: 'legacy', manifestId: uid, updatedAt: h.TIME })
function fixture(count = 1, legacy = false) {
  const p = { schemaVersion: 2, ownerId: 'owner', catalogId: 'catalog', name: 'Plan', inviteeIds: users.slice(1),
    memberIds: users.slice(0, count), participants: Object.fromEntries(users.map((u, i) => [u, { careerInstanceId: i < count ? `i_${u}` : null, bindingState: i < count ? 'resolved' : 'unresolved' }])),
    invitedBy: Object.fromEntries(users.slice(1).map(u => [u, 'owner'])), closed: false, deleting: false, createdAt: h.TIME, updatedAt: h.TIME }
  if (legacy) { delete p.schemaVersion; delete p.catalogId; delete p.participants; p.careerId = 'catalog' }
  const entries = { 'jointPlans/p': p }
  for (const uid of users) {
    if (!legacy) entries[`migrationUsers/${uid}`] = control(uid)
    entries[`users/${uid}`] = legacy ? { activeCareerId: 'catalog', updatedAt: h.TIME } : { schemaVersion: 2, activeCareerInstanceId: null, updatedAt: h.TIME }
    // Each fixture owns its mutable metadata: negative lifecycle cases must not
    // archive other users or subsequent calibration fixtures.
    entries[`users/${uid}/careerInstances/i_${uid}`] = { ...metadata }
    entries[`users/${uid}/catalogMemberships/catalog`] = { schemaVersion: 1, careerInstanceId: `i_${uid}` }
    if (uid !== 'owner') {
      entries[`friendships/owner:${uid}`] = h.friendship('owner', uid)
      entries[`users/${uid}/activityInbox/jp_p`] = { schemaVersion: 1, type: 'JOINT_PLAN_INVITATION', actorUid: 'owner',
        createdAt: h.TIME, target: { kind: 'jointPlan', id: 'p' }, readAt: null }
    }
  }
  return entries
}
const patch = (p, uid) => ({ memberIds: [...p.memberIds, uid], participants: { ...p.participants,
  [uid]: { careerInstanceId: `i_${uid}`, bindingState: 'resolved' } }, updatedAt: sdk.serverTimestamp() })
const client = (env, uid) => env.authenticatedContext(uid, h.claims(uid)).firestore()
const read = async (env, path = 'jointPlans/p') => {
  let result
  await env.withSecurityRulesDisabled(async c => { result = (await sdk.getDocFromServer(sdk.doc(c.firestore(), path))).data() })
  return result
}
async function outcome(fn) {
  try { await fn(); return { code: 'ALLOW', expressions: false } }
  catch (e) { assert.equal(e.code, 'permission-denied'); return { code: e.code, expressions: /1000 expressions/.test(e.message) } }
}
function isolatedJoin(rules, keep = []) {
  // Diagnostic suppression of alternative UPDATE branches, preserving the JOIN predicate/shape.
  if (!keep.includes('close')) rules = rules.replace('allow update: if socialUser() && instancePlan(resource.data) && proposalAuthority(request.auth.uid)',
    'allow update: if false && socialUser() && instancePlan(resource.data) && proposalAuthority(request.auth.uid)')
  if (!keep.includes('invite')) rules = rules.replace('(inviteInstanceMember() || joinInstanceMember())', 'joinInstanceMember()')
  if (!keep.includes('legacy')) rules = rules.replace('allow update: if socialUser() && !instancePlan(resource.data) && legacyPlan(resource.data)',
      'allow update: if false && socialUser() && !instancePlan(resource.data) && legacyPlan(resource.data)')
  return rules
}
function service(db, uid, afterRead, trace) {
  const source = ['src/jointPlanLogic.js', 'tests/rules/fixtures/joint-membership-before-v2.js'].map(f => fs.readFileSync(f, 'utf8')
    .replace(/^import .*\r?\n/gm, '').replace(/export /g, '')).join('\n')
  const wrapped = { ...sdk, runTransaction: (database, callback) => sdk.runTransaction(database, tx => callback({
    get: async ref => { const snap = await tx.get(ref); trace.push({ uid, members: snap.data()?.memberIds }); await afterRead?.(); return snap },
    update: (...args) => tx.update(...args), delete: (...args) => tx.delete(...args), set: (...args) => tx.set(...args),
  })) }
  return new Function('sdk', 'db', 'auth', `const {${Object.keys(sdk).join(',')}}=sdk;\n${source}\nreturn updatePlanMembership`)(wrapped, db, { currentUser: { uid } })
}
// Explicit isolated builder for v2. This is NOT the current production service and has no manual retry.
async function joinV2(db, uid, afterRead = async () => {}, trace = []) {
  return sdk.runTransaction(db, async tx => {
    const ref = sdk.doc(db, 'jointPlans/p'), p = (await tx.get(ref)).data()
    trace.push({ uid, members: p.memberIds }); await afterRead()
    tx.update(ref, patch(p, uid))
  })
}

for (const variant of ['real', 'join-only']) test(`${variant}: fresh/stale size matrix`, async t => {
  const env = await h.initialize(variant === 'real' ? original : isolatedJoin(original))
  try {
    for (let count = 1; count <= 4; count++) await t.test(`fresh ${count} existing members`, async () => {
      await env.clearFirestore(); await h.seed(env, fixture(count))
      const uid = users[count], db = client(env, uid)
      const result = await outcome(() => joinV2(db, uid))
      t.diagnostic(JSON.stringify({ variant, count, kind: 'fresh', ...result }))
      assert.equal(result.code, 'ALLOW'); assert.equal((await read(env)).memberIds.length, count + 1)
    })
    for (let count = 1; count <= 4; count++) await t.test(`stale ${count} existing members`, async () => {
      await env.clearFirestore(); await h.seed(env, fixture(count))
      const p = await read(env), uid = users[count], winner = users[Math.min(count + 1, 4)]
      const stale = patch(p, uid)
      await joinV2(client(env, winner), winner)
      const before = await read(env), db = client(env, uid)
      const result = await outcome(() => sdk.updateDoc(sdk.doc(db, 'jointPlans/p'), stale))
      t.diagnostic(JSON.stringify({ variant, count, kind: count === 4 ? 'same-user replay at full capacity' : 'stale', ...result }))
      assert.equal(result.code, 'permission-denied'); assert.deepEqual(await read(env), before)
      if (count < 4) { await joinV2(db, uid); assert.equal((await read(env)).memberIds.length, count + 2) }
    })
  } finally { await env.cleanup() }
})

test('actual production service versus isolated v2 builder', async t => {
  const env = await h.initialize(original)
  try {
    for (const legacy of [true, false]) await t.test(`JOIN preserves all Activity notices legacy=${legacy}`, async () => {
      await env.clearFirestore(); await h.seed(env, fixture(1, legacy))
      const paths = users.slice(1).map(u => `users/${u}/activityInbox/jp_p`)
      const before = await Promise.all(paths.map(p => read(env, p)))
      if (legacy) await service(client(env, 'one'), 'one', null, [])('one', 'p', true)
      else await joinV2(client(env, 'one'), 'one')
      assert.deepEqual(await Promise.all(paths.map(p => read(env, p))), before)
    })
    await t.test('sixth participant cannot join a full plan', async () => {
      await env.clearFirestore(); const entries = fixture(5)
      entries['migrationUsers/five'] = control('five')
      entries['users/five/careerInstances/i_five'] = metadata
      await h.seed(env, entries)
      const before = await read(env), db = client(env, 'five')
      const result = await outcome(() => sdk.updateDoc(sdk.doc(db, 'jointPlans/p'), patch(before, 'five')))
      assert.equal(result.code, 'permission-denied'); assert.deepEqual(await read(env), before)
    })
    await t.test('real service fresh v2 cannot create binding yet', async () => {
      await env.clearFirestore(); await h.seed(env, fixture()); const trace = []
      const result = await outcome(() => service(client(env, 'one'), 'one', null, trace)('one', 'p', true))
      assert.equal(result.code, 'permission-denied'); assert.deepEqual((await read(env)).memberIds, ['owner'])
      t.diagnostic(JSON.stringify({ kind: 'real-service-v2', trace, result }))
    })
    for (const legacy of [true, false]) await t.test(`deterministic race ${legacy ? 'real legacy service' : 'isolated v2 builder'}`, async () => {
      await env.clearFirestore(); await h.seed(env, fixture(1, legacy)); const trace = []
      let first = true
      const afterRead = async () => {
        if (!first) return; first = false
        if (legacy) await service(client(env, 'two'), 'two', null, trace)('two', 'p', true)
        else await joinV2(client(env, 'two'), 'two', undefined, trace)
      }
      const result = await outcome(() => legacy ? service(client(env, 'one'), 'one', afterRead, trace)('one', 'p', true)
        : joinV2(client(env, 'one'), 'one', afterRead, trace))
      assert.equal(result.code, 'permission-denied'); assert.deepEqual((await read(env)).memberIds, ['owner', 'two'])
      assert.equal(trace.filter(a => a.uid === 'one').length, 1)
      // A separate, fresh invocation is diagnostic, not a production/manual retry implementation.
      if (legacy) await service(client(env, 'one'), 'one', null, trace)('one', 'p', true)
      else await joinV2(client(env, 'one'), 'one', undefined, trace)
      const final = await read(env); assert.deepEqual(final.memberIds, ['owner', 'two', 'one'])
      t.diagnostic(JSON.stringify({ kind: legacy ? 'real-legacy' : 'isolated-v2', result, trace, finalMembers: final.memberIds }))
    })
    for (const mutation of ['close', 'archive', 'friendship', 'invitation', 'authority', 'catalog', 'same-user']) await t.test(`interleave ${mutation}`, async () => {
      await env.clearFirestore(); await h.seed(env, fixture()); let first = true
      const trace = []
      const result = await outcome(() => joinV2(client(env, 'one'), 'one', async () => {
        if (!first) return; first = false
        if (mutation === 'close') await sdk.updateDoc(sdk.doc(client(env, 'owner'), 'jointPlans/p'), { closed: true, updatedAt: sdk.serverTimestamp() })
        if (mutation === 'archive') await sdk.updateDoc(sdk.doc(client(env, 'one'), 'users/one/careerInstances/i_one'), { lifecycle: 'archived', archivedAt: sdk.serverTimestamp(), updatedAt: sdk.serverTimestamp() })
        // Withdrawal APIs are absent for v2/friendship: admin simulates external state change, never client authorization.
        if (mutation === 'friendship') await h.seed(env, { 'friendships/owner:one': h.friendship('owner', 'one', 'rejected') })
        if (mutation === 'invitation') { const p = await read(env); p.inviteeIds = p.inviteeIds.filter(u => u !== 'one'); delete p.participants.one; delete p.invitedBy.one; await h.seed(env, { 'jointPlans/p': p }) }
        if (mutation === 'authority') await h.seed(env, { 'migrationUsers/one': { ...control('one'), authority: 'frozen', phase: 'copying' } })
        if (mutation === 'catalog') await h.seed(env, { 'users/one/careerInstances/i_one': { ...metadata, catalogId: 'other' } })
        if (mutation === 'same-user') await joinV2(client(env, 'one'), 'one')
      }, trace))
      assert.equal(result.code, mutation === 'friendship' ? 'ALLOW' : 'permission-denied')
      const p = await read(env)
      assert.equal(p.memberIds.includes('one'), ['same-user', 'friendship'].includes(mutation))
      t.diagnostic(JSON.stringify({ mutation, result, attempts: trace.length, members: p.memberIds }))
    })
  } finally { await env.cleanup() }
})

for (const variant of ['real', 'join-only']) for (const extra of [8, 9]) test(`${variant} JOIN access padding +${extra}`, async t => {
  const probes = Array.from({ length: extra }, (_, i) => `get(/databases/$(database)/documents/diagnosticLookups/p${i}).data.ok`).join(' && ')
  const rules = (variant === 'real' ? original : isolatedJoin(original)).replace('&& operationalBinding(after, uid);', `&& operationalBinding(after, uid) && ${probes};`)
  assert.notEqual(rules, original)
  const env = await h.initialize(rules)
  try {
    await env.clearFirestore(); await h.seed(env, { ...fixture(4), ...Object.fromEntries(Array.from({ length: extra }, (_, i) => [`diagnosticLookups/p${i}`, { ok: true }])) })
    const result = await outcome(() => joinV2(client(env, 'four'), 'four'))
    t.diagnostic(JSON.stringify({ extra, result }))
    assert.equal(result.code, extra === 8 ? 'ALLOW' : 'permission-denied')
  } finally { await env.cleanup() }
})

test('stale rejection branch-cost isolation (never production Rules)', async t => {
  for (const keep of [['close'], ['invite'], ['legacy'], ['close', 'invite'], ['close', 'legacy'], ['invite', 'legacy']]) await t.test(keep.join('+'), async () => {
    const env = await h.initialize(isolatedJoin(original, keep))
    try {
      await env.clearFirestore(); await h.seed(env, fixture())
      const stale = patch(await read(env), 'one')
      await joinV2(client(env, 'two'), 'two')
      const db = client(env, 'one'), result = await outcome(() => sdk.updateDoc(sdk.doc(db, 'jointPlans/p'), stale))
      assert.equal(result.code, 'permission-denied')
      t.diagnostic(JSON.stringify({ retainedBranches: keep, result }))
    } finally { await env.cleanup() }
  })
})

test('SDK version-conflict retry when isolated Rules do not reject payload first', async t => {
  // A counter is deliberately not academic authorization and is not a proposed JOIN rule.
  const rules = "rules_version = '2'; service cloud.firestore { match /databases/{database}/documents/diagnosticCounter/value { allow read, update: if request.auth.uid == 'one'; } }"
  const env = await h.initialize(rules)
  try {
    await h.seed(env, { 'diagnosticCounter/value': { count: 0 } })
    const db = client(env, 'one'), ref = sdk.doc(db, 'diagnosticCounter/value'), seen = []
    await sdk.runTransaction(db, async tx => {
      const snap = await tx.get(ref); seen.push(snap.data().count)
      if (seen.length === 1) await sdk.updateDoc(ref, { count: 1 })
      tx.update(ref, { count: snap.data().count + 1 })
    })
    assert.deepEqual(seen, [0, 1]); assert.equal((await sdk.getDocFromServer(ref)).data().count, 2)
    t.diagnostic('Real version-conflict: SDK callback runs twice, rereads 1, persists 2')
  } finally { await env.cleanup() }
})

test('restore and close interleavings preserve operational limits', async t => {
  const env = await h.initialize(original)
  try {
    for (const close of [false, true]) await t.test(`restore during JOIN closed=${close}`, async () => {
      await env.clearFirestore(); const entries = fixture()
      entries['users/one/careerInstances/i_one'] = { ...metadata, lifecycle: 'archived', archivedAt: h.TIME }
      await h.seed(env, entries); let first = true
      const db = client(env, 'one')
      const result = await outcome(() => joinV2(db, 'one', async () => {
        if (!first) return; first = false
        if (close) await sdk.updateDoc(sdk.doc(client(env, 'owner'), 'jointPlans/p'), { closed: true, updatedAt: sdk.serverTimestamp() })
        await sdk.updateDoc(sdk.doc(db, 'users/one/careerInstances/i_one'), { lifecycle: 'active', archivedAt: null, updatedAt: sdk.serverTimestamp() })
      }))
      assert.equal(result.code, close ? 'permission-denied' : 'ALLOW')
      assert.equal((await read(env)).closed, close)
    })
  } finally { await env.cleanup() }
})

test('installed SDK retries selected errors, not permission-denied', async t => {
  const env = await h.initialize(original)
  try {
    for (const code of ['aborted', 'failed-precondition', 'already-exists', 'unavailable', 'permission-denied']) await t.test(code, async () => {
      let calls = 0
      const promise = sdk.runTransaction(client(env, 'one'), async () => { if (++calls === 1) throw new FirebaseError(code, 'diagnostic'); return 'ok' }, { maxAttempts: 2 })
      if (code === 'permission-denied') { await assert.rejects(promise, { code }); assert.equal(calls, 1) }
      else { assert.equal(await promise, 'ok'); assert.equal(calls, 2) }
    })
  } finally { await env.cleanup() }
})
