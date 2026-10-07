const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const sdk = require('firebase/firestore')
const { FirebaseError } = require('firebase/app')
const h = require('./helpers.cjs')
const { load } = require('../joint-join-harness.cjs')
// Fixture builders only: no diagnostic test registration or Rules replacement.
let constructors = fs.readFileSync(require.resolve('./joint-join-diagnostic.test.cjs'), 'utf8')
constructors = constructors.slice(0, constructors.indexOf("for (const variant of ['real', 'join-only'])"))
const { fixture, read, patch } = new Function('require', constructors + '\nreturn {fixture,read,patch}')(require)
test('integrated JOIN service, real Rules and bounded recovery', async t => {
  const env = await h.initialize()
  const dbs = new Map()
  const db = uid => { if (!dbs.has(uid)) dbs.set(uid, env.authenticatedContext(uid, h.claims(uid)).firestore()); return dbs.get(uid) }
  const setup = async (n = 1, legacy = false) => { await env.clearFirestore(); await h.seed(env, fixture(n, legacy)) }
  const api = (uid, hooks = {}) => {
    const state = { calls: 0, writes: 0, reads: [], evidenceReads: 0 }
    const auth = { currentUser: { uid } }
    const wrapped = { ...sdk,
      getDocFromServer: ref => { state.evidenceReads++; return sdk.getDocFromServer(ref) },
      runTransaction: (database, fn, options) => {
        const attempt = ++state.calls
        return sdk.runTransaction(database, async tx => {
          const result = await fn({
            get: async ref => { const s = await tx.get(ref); state.reads.push(ref.path); if (ref.path === 'jointPlans/p') await hooks.afterPlanRead?.(attempt, s); return s },
            update: (...args) => { state.writes++; return tx.update(...args) },
            set: (...args) => tx.set(...args), delete: (...args) => tx.delete(...args),
          })
          await hooks.beforeCommit?.(attempt)
          return result
        }, options)
      },
    }
    const service = load(wrapped, db(uid), auth)
    return { state, auth, join: id => service.updatePlanMembership(uid, 'p', true, id ?? null) }
  }
  try {
    for (let n = 1; n <= 4; n++) await t.test(`fresh actual service ${n} members`, async () => {
      await setup(n); const uid = ['owner', 'one', 'two', 'three', 'four'][n], a = api(uid)
      assert.equal(await a.join(), 'joined'); assert.equal(a.state.calls, 1)
      const p = await read(env); assert.equal(p.memberIds.length, n + 1); assert.equal(p.participants[uid].careerInstanceId, `i_${uid}`)
    })
    await t.test('legacy stays legacy, no binding writes', async () => {
      await setup(1, true); const a = api('one'); await a.join()
      const p = await read(env); assert.equal(p.participants, undefined); assert.deepEqual(p.memberIds, ['owner', 'one'])
    })
    await t.test('overlapping real joins recover with one fresh external transaction', async () => {
      await setup(); let once = true
      const b = api('two'), a = api('one', { afterPlanRead: async () => { if (once) { once = false; await b.join() } } })
      await a.join(); assert.equal(a.state.calls, 2); assert.equal(b.state.calls, 1)
      const p = await read(env); assert.deepEqual(p.memberIds, ['owner', 'two', 'one'])
      assert.equal(p.participants.one.careerInstanceId, 'i_one'); assert.equal(p.participants.two.careerInstanceId, 'i_two')
    })
    await t.test('simultaneous last two joins never exceed five', async () => {
      await setup(3); let release; const gate = new Promise(r => { release = r }); let arrived = 0
      const barrier = async n => { if (n === 1) { if (++arrived === 2) release(); await gate } }
      const a = api('three', { afterPlanRead: barrier }), b = api('four', { afterPlanRead: barrier })
      await Promise.all([a.join(), b.join()]); const p = await read(env)
      assert.equal(p.memberIds.length, 5); assert.equal(new Set(p.memberIds).size, 5)
      assert.ok(a.state.calls <= 2 && b.state.calls <= 2)
    })
    await t.test('duplicate same-user JOIN becomes verified no-op, notices unchanged', async () => {
      await setup(); const paths = ['one', 'two', 'three', 'four'].map(u => `users/${u}/activityInbox/jp_p`)
      const before = await Promise.all(paths.map(p => read(env, p))); let once = true
      const a = api('one', { afterPlanRead: async () => { if (once) { once = false; await api('one').join() } } })
      assert.equal(await a.join(), 'already-joined'); assert.equal(a.state.calls, 2); assert.equal(a.state.writes, 1)
      assert.deepEqual((await read(env)).memberIds, ['owner', 'one'])
      assert.deepEqual(await Promise.all(paths.map(p => read(env, p))), before)
    })
    await t.test('genuine permission-denied with unchanged plan does not retry', async () => {
      await setup(); const a = api('one', { beforeCommit: () => { throw new FirebaseError('permission-denied', 'diagnostic denial') } })
      await assert.rejects(a.join(), { code: 'permission-denied' }); assert.equal(a.state.calls, 1)
      assert.deepEqual((await read(env)).memberIds, ['owner'])
    })
    await t.test('second failure is definitive, no third attempt', async () => {
      await setup(); const a = api('one', { beforeCommit: async n => {
        if (n === 1) await api('two').join()
        else throw new FirebaseError('permission-denied', 'second denial')
      } })
      await assert.rejects(a.join(), { code: 'permission-denied' }); assert.equal(a.state.calls, 2)
      assert.deepEqual((await read(env)).memberIds, ['owner', 'two'])
    })
    for (const mutation of ['closed', 'archived', 'frozen', 'catalog', 'missing', 'binding', 'invitation']) await t.test(`concurrent ${mutation} aborts, not retry-success`, async () => {
      await setup()
      const a = api('one', { beforeCommit: async () => {
        if (mutation === 'closed') await sdk.updateDoc(sdk.doc(db('owner'), 'jointPlans/p'), { closed: true, updatedAt: sdk.serverTimestamp() })
        if (mutation === 'archived') await sdk.updateDoc(sdk.doc(db('one'), 'users/one/careerInstances/i_one'), { lifecycle: 'archived', archivedAt: sdk.serverTimestamp(), updatedAt: sdk.serverTimestamp() })
        if (mutation === 'frozen') await h.seed(env, { 'migrationUsers/one': { ...fixture()['migrationUsers/one'], authority: 'frozen', phase: 'copying' } })
        if (mutation === 'catalog') await h.seed(env, { 'users/one/careerInstances/i_one': { ...fixture()['users/one/careerInstances/i_one'], catalogId: 'wrong' } })
        if (mutation === 'missing') await env.withSecurityRulesDisabled(c => sdk.deleteDoc(sdk.doc(c.firestore(), 'users/one/careerInstances/i_one')))
        if (mutation === 'binding' || mutation === 'invitation') {
          const p = await read(env)
          if (mutation === 'binding') p.participants.one = { careerInstanceId: 'foreign', bindingState: 'resolved' }
          else { p.inviteeIds = p.inviteeIds.filter(u => u !== 'one'); delete p.participants.one; delete p.invitedBy.one }
          await h.seed(env, { 'jointPlans/p': p })
        }
      } })
      await assert.rejects(a.join()); assert.equal(a.state.calls, 1); assert.equal((await read(env)).memberIds.includes('one'), false)
    })
    await t.test('second attempt rechecks archive occurring after evidence reads', async () => {
      await setup(); const a = api('one', { beforeCommit: async n => {
        if (n === 1) await api('two').join()
        else await sdk.updateDoc(sdk.doc(db('one'), 'users/one/careerInstances/i_one'), { lifecycle: 'archived', archivedAt: sdk.serverTimestamp(), updatedAt: sdk.serverTimestamp() })
      } })
      await assert.rejects(a.join()); assert.equal(a.state.calls, 2); assert.deepEqual((await read(env)).memberIds, ['owner', 'two'])
    })
    await t.test('unproved client instance is rejected without writes', async () => {
      await setup(); const a = api('one'); await assert.rejects(a.join('i_owner')); assert.equal(a.state.writes, 0)
    })
    await t.test('incoherent existing member fails closed instead of repair', async () => {
      await setup(); const p = await read(env); p.memberIds.push('one'); await h.seed(env, { 'jointPlans/p': p })
      const a = api('one'); await assert.rejects(a.join()); assert.equal(a.state.writes, 0)
    })
    await t.test('Rules still reject raw stale payload', async () => {
      await setup(); const stale = patch(await read(env), 'one'); await api('two').join()
      await assert.rejects(sdk.updateDoc(sdk.doc(db('one'), 'jointPlans/p'), stale), { code: 'permission-denied' })
      assert.deepEqual((await read(env)).memberIds, ['owner', 'two'])
    })
  } finally { await env.cleanup() }
})
