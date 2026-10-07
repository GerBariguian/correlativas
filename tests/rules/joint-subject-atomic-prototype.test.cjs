const { before, after, beforeEach, test } = require('node:test')
const assert = require('node:assert/strict')
const { doc, writeBatch, getDocFromServer, updateDoc, runTransaction, serverTimestamp } = require('firebase/firestore')
const { initialize, seed, claims, TIME, assertSucceeds: allow, assertFails: deny } = require('./helpers.cjs')
const fixture = require('./fixtures/joint-subject-atomic-prototype.cjs')
let env
const ids = ['owner', 'one', 'two', 'three', 'four']
const pp = 'jointPlans/p', sp = `${pp}/subjects/A`, wp = `${pp}/subjectChecks/A`
const ip = uid => `users/${uid}/careerInstances/i_${uid}`
const client = uid => uid ? env.authenticatedContext(uid, claims(uid)).firestore() : env.unauthenticatedContext().firestore()
const control = uid => ({ schemaVersion: 1, generation: 'multicareer-v1', authority: 'instances',
  phase: 'complete', origin: 'legacy', manifestId: uid, updatedAt: TIME })
const instance = (patch = {}) => ({ schemaVersion: 1, catalogId: 'catalog', lifecycle: 'active',
  createdAt: TIME, updatedAt: TIME, archivedAt: null, ...patch })
const plan = () => ({ schemaVersion: 2, ownerId: 'owner', catalogId: 'catalog', inviteeIds: ids.slice(1),
  memberIds: ids, closed: false, deleting: false,
  participants: Object.fromEntries(ids.map(uid => [uid, { careerInstanceId: `i_${uid}`, bindingState: 'resolved' }])) })
before(async () => { env = await initialize(fixture()) }, { timeout: 30000 })
after(async () => { if (env) await env.cleanup() })
beforeEach(async () => {
  await env.clearFirestore()
  const entries = { [pp]: plan() }
  for (const uid of ids) {
    entries[`migrationUsers/${uid}`] = control(uid)
    entries[ip(uid)] = instance()
  }
  await seed(env, entries)
})
function batch(c, proposed = ids, { actor = 'owner', revision = 1, subject = true, check = true,
  subjectPath = sp, checkPath = wp, patch = {}, checkPatch = {} } = {}) {
  const b = writeBatch(c)
  if (subject) b.set(doc(c, subjectPath), { code: 'A', proposedParticipantIds: proposed,
    addedByUid: actor, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...patch })
  if (check) b.set(doc(c, checkPath), { revision, actorUid: actor, updatedAt: serverTimestamp(), ...checkPatch })
  return b
}
async function stored(path) {
  let result
  await env.withSecurityRulesDisabled(async context => { result = await getDocFromServer(doc(context.firestore(), path)) })
  return result
}
async function absent() { assert.equal((await stored(sp)).exists(), false); assert.equal((await stored(wp)).exists(), false) }
// Prototype client, isolated from production: CAS transaction preserves attribution.
async function save(c, proposed = ids, afterRead = async () => {}) {
  return runTransaction(c, async tx => {
    const s = await tx.get(doc(c, sp)), w = await tx.get(doc(c, wp))
    await afterRead()
    // Retry after a lost acknowledgement is a no-op if the decision is already present.
    if (s.exists() && JSON.stringify(s.data().proposedParticipantIds) === JSON.stringify(proposed)) return 'unchanged'
    tx.set(doc(c, sp), { code: 'A', proposedParticipantIds: proposed, addedByUid: s.data()?.addedByUid || 'owner',
      createdAt: s.data()?.createdAt || serverTimestamp(), updatedAt: serverTimestamp() })
    tx.set(doc(c, wp), { revision: (w.data()?.revision || 0) + 1, actorUid: 'owner', updatedAt: serverTimestamp() })
    return 'saved'
  })
}
test('actor alone remains rejected by existing minimum two assignees', async () => {
  await deny(batch(client('owner'), ['owner']).commit()); await absent()
})
for (const [label, proposed] of [['actor + 1', ids.slice(0, 2)], ['actor + 4', ids], ['four targets, actor fifth', ids.slice(1)]]) {
  test(`atomic protocol ALLOW ${label}`, async () => { await allow(batch(client('owner'), proposed).commit()) })
}
for (const orientation of ['direct', 'inverse']) test(`existing plan saves with ${orientation} friendships`, async () => {
  await seed(env, Object.fromEntries(ids.slice(1).map(uid => [`friendships/${orientation === 'direct' ? `owner:${uid}` : `${uid}:owner`}`,
    { status: 'accepted', participants: ['owner', uid] }])))
  await allow(batch(client('owner')).commit())
})
test('save does not invent a friendship requirement for existing membership', async () => {
  await allow(batch(client('owner')).commit())
})
for (const [label, patch] of [['frozen', { authority: 'frozen', phase: 'copying' }], ['invalid', { generation: 'bad' }],
  ['blocked', { phase: 'blocked' }], ['legacy', { authority: 'legacy', phase: 'pending' }]]) {
  for (const uid of ['owner', 'four']) test(`DENY ${label} authority of ${uid}`, async () => {
    await seed(env, { [`migrationUsers/${uid}`]: { ...control(uid), ...patch } })
    await deny(batch(client('owner')).commit()); await absent()
  })
}
for (const uid of ['owner', 'four']) for (const [label, patch] of [['archived', { lifecycle: 'archived' }], ['catalog mismatch', { catalogId: 'other' }]]) {
  test(`DENY ${label} instance of ${uid}`, async () => {
    await seed(env, { [ip(uid)]: instance(patch) })
    await deny(batch(client('owner')).commit()); await absent()
  })
}
test('foreign instance ID cannot resolve against another owner path', async () => {
  const p = plan(); p.participants.four.careerInstanceId = 'i_one'
  await seed(env, { [pp]: p }); await deny(batch(client('owner')).commit()); await absent()
})
for (const state of ['unresolved', 'catalog-unavailable']) test(`DENY binding ${state}`, async () => {
  const p = plan(); p.participants.four.bindingState = state
  await seed(env, { [pp]: p }); await deny(batch(client('owner')).commit()); await absent()
})
for (const field of ['closed', 'deleting']) test(`DENY plan ${field}`, async () => {
  await seed(env, { [pp]: { ...plan(), [field]: true } }); await deny(batch(client('owner')).commit()); await absent()
})
test('nonmember and anonymous cannot create either document', async () => {
  for (const uid of ['stranger', null]) { await deny(batch(client(uid), ids, { actor: uid || 'owner' }).commit()); await absent() }
})
for (const field of ['participants', 'memberIds']) test(`binding/membership spoof via atomic plan ${field} update denied`, async () => {
  const c = client('one'), b = batch(c, ids, { actor: 'one' })
  b.update(doc(c, pp), { [field]: field === 'memberIds' ? ['one'] : {} })
  await deny(b.commit()); await absent()
})
for (const options of [{ check: false }, { subject: false }, { checkPath: `${pp}/subjectChecks/B` },
  { checkPatch: { actorUid: 'one' } }, { checkPatch: { revision: 9 } }, { checkPatch: { enabled: true } },
  { patch: { addedByUid: 'one' } }, { patch: { statusMap: {} } }]) {
  test(`DENY partial/spoof ${JSON.stringify(options)}`, async () => { await deny(batch(client('owner'), ids, options).commit()); await absent() })
}
test('single check cannot certify two subjects', async () => {
  const c = client('owner'), b = batch(c)
  b.set(doc(c, `${pp}/subjects/B`), { code: 'B', proposedParticipantIds: ids, addedByUid: 'owner', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  await deny(b.commit()); await absent(); assert.equal((await stored(`${pp}/subjects/B`)).exists(), false)
})
test('check-only first phase rejected; later subject-only rejected; atomic retry succeeds', async () => {
  const c = client('owner')
  await deny(batch(c, ids, { subject: false }).commit()); await absent()
  await deny(batch(c, ids, { check: false }).commit()); await absent()
  await allow(save(c))
})
test('stale check cannot authorize a second subject write; exact replay denied', async () => {
  const c = client('owner'); await save(c)
  const old = (await stored(sp)).data()
  await deny(batch(c, ids.slice(0, 2), { check: false, patch: { createdAt: old.createdAt } }).commit())
  await deny(batch(c, ids.slice(0, 2), { revision: 1, patch: { createdAt: old.createdAt } }).commit())
  assert.deepEqual((await stored(sp)).data(), old)
})
test('lost acknowledgement retry is idempotent; next edit increments witness with original attribution', async () => {
  const c = client('owner'); assert.equal(await save(c), 'saved')
  const s = (await stored(sp)).data(), w = (await stored(wp)).data()
  assert.equal(await save(c), 'unchanged'); assert.deepEqual((await stored(wp)).data(), w)
  await save(c, ids.slice(1)); assert.equal((await stored(wp)).data().revision, 2)
  assert.equal((await stored(sp)).data().createdAt.isEqual(s.createdAt), true)
})
test('concurrent edits serialize without lost witness increments or partial payload', async () => {
  const c = client('owner'); await save(c)
  const results = await Promise.allSettled([save(c, ['owner', 'one']), save(c, ['owner', 'two'])])
  const succeeded = results.filter(r => r.status === 'fulfilled').length
  assert.ok(succeeded >= 1)
  for (const result of results.filter(r => r.status === 'rejected')) assert.ok(['permission-denied', 'aborted'].includes(result.reason.code))
  assert.equal((await stored(wp)).data().revision, 1 + succeeded)
  assert.ok(['one', 'two'].includes((await stored(sp)).data().proposedParticipantIds[1]))
  // A contending client can receive explicit denial before SDK retry. Re-read/retry.
  await allow(save(c, ['owner', 'three']))
  assert.equal((await stored(wp)).data().revision, 2 + succeeded)
})
test('archive same atomic commit cannot assign archived actor', async () => {
  const c = client('owner'), b = batch(c); b.update(doc(c, ip('owner')), { lifecycle: 'archived' })
  await deny(b.commit()); await absent(); assert.equal((await stored(ip('owner'))).data().lifecycle, 'active')
})
test('close same atomic commit cannot save', async () => {
  const c = client('owner'), b = batch(c); b.update(doc(c, pp), { closed: true })
  await deny(b.commit()); await absent(); assert.equal((await stored(pp)).data().closed, false)
})
test('archive after client reads and before commit is enforced by Rules', async () => {
  const c = client('owner')
  await deny(save(c, ids, () => updateDoc(doc(client('four'), ip('four')), { lifecycle: 'archived' })))
  await absent()
})
test('close after client reads and before commit is enforced by Rules', async () => {
  const c = client('owner'); await deny(save(c, ids, () => updateDoc(doc(c, pp), { closed: true }))); await absent()
})
test('restore permits a fresh edit but never reopens closed plan', async () => {
  const c = client('owner'), target = client('four')
  await updateDoc(doc(target, ip('four')), { lifecycle: 'archived' }); await deny(batch(c).commit())
  await updateDoc(doc(target, ip('four')), { lifecycle: 'active' }); await allow(save(c))
  await updateDoc(doc(c, pp), { closed: true })
  await updateDoc(doc(target, ip('four')), { lifecycle: 'archived' })
  await updateDoc(doc(target, ip('four')), { lifecycle: 'active' })
  await deny(save(c, ['owner', 'four']))
})
test('selection irrelevant; witness/binding/membership never grant private academic or snapshot reads', async () => {
  await seed(env, { 'users/owner': { activeCareerInstanceId: null }, 'users/four': { activeCareerInstanceId: 'other' },
    [`${ip('four')}/academic/progress`]: { statusMap: { A: 'Aprobada' } },
    [`${ip('four')}/sharing/snapshot`]: { approvedCodes: ['A'] } })
  const c = client('owner'); await allow(save(c))
  for (const path of [`${ip('four')}/academic/progress`, `${ip('four')}/sharing/snapshot`, ip('four')]) await deny(getDocFromServer(doc(c, path)))
})
test('archive participant retains historical assignment while other members edit', async () => {
  const c = client('owner'); await save(c)
  await updateDoc(doc(client('four'), ip('four')), { lifecycle: 'archived' })
  await allow(save(c, ['owner', 'one', 'four']))
  await allow(save(c, ['owner', 'one']))
  await deny(save(c, ['owner', 'one', 'four']))
  assert.deepEqual((await stored(sp)).data().proposedParticipantIds, ['owner', 'one'])
})
test('archived owner does not suspend other members or close plan', async () => {
  await updateDoc(doc(client('owner'), ip('owner')), { lifecycle: 'archived' })
  const c = client('one'); await allow(batch(c, ['one', 'two'], { actor: 'one' }).commit())
  assert.equal((await stored(pp)).data().closed, false)
})
test('membership removed after preparation prevents actor commit', async () => {
  await deny(save(client('owner'), ids, () => seed(env, { [pp]: { ...plan(), memberIds: ids.slice(1) } })))
  await absent()
})
test('binding changed after preparation cannot authorize wrong catalog', async () => {
  await deny(save(client('owner'), ids, () => seed(env, { [ip('four')]: instance({ catalogId: 'different' }) })))
  await absent()
})
test('authority frozen after preparation invalidates commit', async () => {
  await deny(save(client('owner'), ids, () => seed(env, { 'migrationUsers/four': { ...control('four'), authority: 'frozen', phase: 'copying' } })))
  await absent()
})
test('client cannot forge authority or manufacture an instance alongside a proposal', async () => {
  const c = client('owner'), b = batch(c)
  b.set(doc(c, 'migrationUsers/four'), control('four'))
  b.set(doc(c, 'users/four/careerInstances/fabricated'), { catalogId: 'catalog', lifecycle: 'active' })
  await deny(b.commit()); await absent()
})
test('restore completed after preparation permits fresh final-state validation', async () => {
  await updateDoc(doc(client('four'), ip('four')), { lifecycle: 'archived' })
  await allow(save(client('owner'), ids, () => updateDoc(doc(client('four'), ip('four')), { lifecycle: 'active' })))
})
test('incompatible instance schema cannot be certified', async () => {
  await seed(env, { [ip('four')]: instance({ schemaVersion: 99 }) })
  await deny(batch(client('owner')).commit()); await absent()
})
test('existing witness cannot advance without a changed subject', async () => {
  const c = client('owner'); await save(c)
  await deny(batch(c, ids, { subject: false, revision: 2 }).commit())
  assert.equal((await stored(wp)).data().revision, 1)
})
test('client cannot delete/reset witness to replay revision one', async () => {
  const c = client('owner'); await save(c)
  const b = writeBatch(c); b.delete(doc(c, wp)); await deny(b.commit())
  assert.equal((await stored(wp)).data().revision, 1)
})
test('non-social authentication rejected without academic writes', async () => {
  const c = env.authenticatedContext('owner', claims('owner', { email_verified: false })).firestore()
  await deny(batch(c).commit()); await absent()
})
test('forged witness timestamp rejected', async () => {
  await deny(batch(client('owner'), ids, { checkPatch: { updatedAt: TIME } }).commit()); await absent()
})
test('another plan check cannot certify this subject', async () => {
  await seed(env, { 'jointPlans/q': plan() })
  await deny(batch(client('owner'), ids, { checkPath: 'jointPlans/q/subjectChecks/A' }).commit()); await absent()
})
test('unsent preparation creates no documents; new client can recover from acknowledged-or-lost commit', async () => {
  batch(client('owner')) // Constructed only: simulates closing before sending.
  await absent()
  await save(client('owner'))
  assert.equal(await save(client('owner')), 'unchanged')
  assert.equal((await stored(wp)).data().revision, 1)
})
test('sixth new participant cannot fit plan membership/bindings even with a real instance', async () => {
  await seed(env, { 'migrationUsers/sixth': control('sixth'), [ip('sixth')]: instance() })
  await deny(batch(client('owner'), ['one', 'two', 'three', 'four', 'sixth']).commit()); await absent()
})
test('prototype refuses legacy plan envelope even if extra binding data was seeded', async () => {
  await seed(env, { [pp]: { ...plan(), schemaVersion: 1 } })
  await deny(batch(client('owner')).commit()); await absent()
})
test('another operative member edits with own check actor but preserves original subject attribution', async () => {
  await save(client('owner'))
  const previous = (await stored(sp)).data()
  await allow(batch(client('one'), ['one', 'two'], { actor: 'one', revision: 2,
    patch: { addedByUid: previous.addedByUid, createdAt: previous.createdAt } }).commit())
  assert.equal((await stored(wp)).data().actorUid, 'one')
  assert.equal((await stored(sp)).data().addedByUid, 'owner')
})
