const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const source = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8')

// Local SDK/authorization model, not the Firestore Rules interpreter. See the manual rules matrix.
function setup() {
  const records = new Map()
  const relationships = new Set(['alice:bob', 'alice:carol', 'bob:dave'])
  const auth = { currentUser: { uid: 'alice' } }
  const listeners = []
  let serial = 0
  let fail = false
  const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
  const accepted = (a, b) => relationships.has([a, b].sort().join(':'))
  const canRead = (plan, uid, subjects = false) => plan && (plan.ownerId === uid
    || (plan.inviteeIds.includes(uid) && accepted(uid, plan.ownerId) && (!subjects || (!plan.closed && plan.memberIds.includes(uid)))))
  const api = { auth, db: {},
    collection: (_db, ...parts) => parts.join('/'),
    doc: (db, ...parts) => parts.length ? parts.join('/') : `${db}/p${++serial}`,
    serverTimestamp: () => ++serial,
    where: (...args) => args,
    query: (ref, ...filters) => ({ ref, filters }),
    runTransaction: async (_db, action) => {
      const writes = []
      await action({
        get: async (ref) => {
          assert.equal(writes.length, 0)
          const plan = records.get(ref.split('/').slice(0, 2).join('/'))
          if (!canRead(plan, auth.currentUser?.uid, ref.includes('/subjects/'))) throw new Error('permission-denied')
          return { exists: () => records.has(ref), data: () => clone(records.get(ref)) }
        },
        set: (ref, data) => writes.push(['set', ref, clone(data)]),
        update: (ref, data) => writes.push(['set', ref, { ...clone(records.get(ref)), ...clone(data) }]),
        delete: (ref) => writes.push(['delete', ref]),
      })
      if (fail) throw new Error('unavailable')
      for (const [op, ref, data] of writes) {
        const uid = auth.currentUser?.uid
        const before = records.get(ref)
        const plan = records.get(ref.split('/').slice(0, 2).join('/'))
        if (ref.includes('/subjects/')) {
          if (plan?.ownerId !== uid || plan.closed) throw new Error('permission-denied')
        } else if (!before) {
          if (data.ownerId !== uid || data.inviteeIds.some((id) => !accepted(uid, id))) throw new Error('permission-denied')
        } else if (!canRead(before, uid)) throw new Error('permission-denied')
        if (op === 'delete') records.delete(ref); else records.set(ref, data)
      }
    },
    onSnapshot: (ref, options, callback, error) => {
      const listener = { ref, callback, error, stopped: false }; listeners.push(listener)
      return () => { listener.stopped = true }
    },
  }
  vm.createContext(api)
  for (const name of ['src/jointPlanLogic.js', 'src/services/jointPlans.js']) {
    vm.runInContext(source(name).replace(/import[\s\S]*?from ['"][^'"]+['"]\s*/g, '').replace(/export /g, ''), api)
  }
  return { api, auth, records, relationships, listeners, canRead, clone, fail: (value) => { fail = value } }
}

test('explicit creation starts with only the creator joined; no academic fields', async () => {
  const { api, records } = setup()
  assert.equal(records.size, 0)
  await api.createJointPlan('alice', 'career', ['bob', 'carol'])
  const plan = [...records.values()][0]
  assert.deepEqual(plan.memberIds, ['alice'])
  assert.deepEqual(plan.inviteeIds, ['bob', 'carol'])
  assert.deepEqual(Object.keys(plan).sort(), ['careerId', 'closed', 'createdAt', 'inviteeIds', 'memberIds', 'ownerId', 'updatedAt'])
  for (const ids of [[], ['alice'], ['bob', 'bob'], ['a', 'b', 'c', 'd', 'e'], ['dave']]) {
    await assert.rejects(api.createJointPlan('alice', 'career', ids))
  }
})

test('creator proposes subjects for different subsets and can remove them', async () => {
  const { api, records } = setup()
  await api.createJointPlan('alice', 'career', ['bob', 'carol'])
  const id = [...records.keys()][0].split('/')[1]
  await api.saveJointSubject('alice', id, 'A', ['alice', 'bob'])
  await api.saveJointSubject('alice', id, 'B', ['alice', 'carol'])
  const row = records.get(`jointPlans/${id}/subjects/A`)
  assert.deepEqual(Object.keys(row).sort(), ['code', 'proposedParticipantIds', 'updatedAt'])
  assert.deepEqual(row.proposedParticipantIds, ['alice', 'bob'])
  await assert.rejects(api.saveJointSubject('alice', id, 'C', ['alice']))
  await assert.rejects(api.saveJointSubject('alice', id, 'C', ['alice', 'outsider']))
  await api.removeJointSubject('alice', id, 'A')
  assert.equal(records.has(`jointPlans/${id}/subjects/A`), false)
  assert.equal(records.has(`jointPlans/${id}/subjects/B`), true)
})

test('invitations grant metadata only; join grants subjects, leave revokes access and retains proposals', async () => {
  const { api, auth, records, canRead } = setup()
  await api.createJointPlan('alice', 'career', ['bob'])
  const ref = [...records.keys()][0]; const id = ref.split('/')[1]
  await api.saveJointSubject('alice', id, 'A', ['alice', 'bob'])
  assert.equal(canRead(records.get(ref), 'bob'), true)
  assert.equal(canRead(records.get(ref), 'bob', true), false)
  auth.currentUser = { uid: 'bob' }
  await api.updatePlanMembership('bob', id, true)
  assert.equal(canRead(records.get(ref), 'bob', true), true)
  await api.updatePlanMembership('bob', id, false)
  assert.equal(canRead(records.get(ref), 'bob'), false)
  assert.equal(records.has(`${ref}/subjects/A`), true)
  await assert.rejects(api.updatePlanMembership('bob', id, true))
})

test('members cannot edit courses, close the plan, impersonate the owner or enroll others', async () => {
  const { api, auth, records } = setup()
  await api.createJointPlan('alice', 'career', ['bob'])
  const id = [...records.keys()][0].split('/')[1]
  auth.currentUser = { uid: 'bob' }
  await api.updatePlanMembership('bob', id, true)
  await assert.rejects(api.saveJointSubject('bob', id, 'A', ['alice', 'bob']))
  await assert.rejects(api.removeJointSubject('bob', id, 'A'))
  await assert.rejects(api.closeJointPlan('bob', id))
  await assert.rejects(api.updatePlanMembership('alice', id, true))
  auth.currentUser = { uid: 'alice' }
  await assert.rejects(api.updatePlanMembership('alice', id, true))
})

test('no transitive friendship access; revoked direct friendship removes all nonowner access', async () => {
  const { api, records, canRead, relationships } = setup()
  await api.createJointPlan('alice', 'career', ['bob', 'carol'])
  const plan = [...records.values()][0]
  assert.equal(canRead(plan, 'dave'), false)
  relationships.delete('alice:bob')
  assert.equal(canRead(plan, 'bob'), false)
  assert.equal(canRead(plan, 'bob', true), false)
  assert.equal(canRead(plan, 'alice', true), true)
})

test('closed plans cannot be edited or joined but invitees can leave', async () => {
  const { api, auth, records } = setup()
  await api.createJointPlan('alice', 'career', ['bob'])
  const id = [...records.keys()][0].split('/')[1]
  await api.closeJointPlan('alice', id)
  await assert.rejects(api.saveJointSubject('alice', id, 'A', ['alice', 'bob']))
  auth.currentUser = { uid: 'bob' }
  await assert.rejects(api.updatePlanMembership('bob', id, true))
  await api.updatePlanMembership('bob', id, false)
  assert.deepEqual(records.get(`jointPlans/${id}`).inviteeIds, [])
})

test('failed writes are not applied; session replacement aborts an in-flight transaction', async () => {
  const { api, auth, records, fail } = setup()
  fail(true)
  await assert.rejects(api.createJointPlan('alice', 'career', ['bob']))
  assert.equal(records.size, 0)
  fail(false)
  await api.createJointPlan('alice', 'career', ['bob'])
  const id = [...records.keys()][0].split('/')[1]
  const request = api.saveJointSubject('alice', id, 'A', ['alice', 'bob'])
  auth.currentUser = { uid: 'alice' } // New auth object, even if same uid.
  await assert.rejects(request)
  assert.equal(records.has(`jointPlans/${id}/subjects/A`), false)
})

test('plan queries are scoped to owner and invitation; offline responses are cleared', () => {
  const { api, listeners, clone } = setup()
  const result = []
  const stop = api.subscribeJointPlans('bob', 'alice', (rows) => result.push(rows), () => {})
  assert.deepEqual(clone(listeners[0].ref.filters), [['ownerId', '==', 'alice'], ['inviteeIds', 'array-contains', 'bob']])
  listeners[0].callback({ metadata: { fromCache: true }, docs: [{ id: 'p', data: () => ({ ownerId: 'alice' }) }] })
  assert.equal(result.at(-1), null)
  stop(); assert.equal(listeners[0].stopped, true)
  api.subscribeJointSubjects('p', (rows) => result.push(rows), () => {})
  listeners[1].callback({ metadata: { hasPendingWrites: true }, docs: [] })
  assert.equal(result.at(-1), null)
})

test('rule source preserves private progress, field allowlists and guards joint access', () => {
  const rules = source('firestore.rules')
  const privateCareers = rules.match(/match \/careers\/\{careerId\} \{([\s\S]*?)\}/)[1]
  assert.match(privateCareers, /request.auth.uid == uid/)
  assert.doesNotMatch(privateCareers, /acceptedPlanningFriend/)
  assert.match(rules, /data\.get\('consentVersion', 1\) == 2/)
  assert.match(rules, /request.auth.uid in plan\(\).memberIds/)
  assert.match(rules, /acceptedPlanningFriend\(plan\(\).ownerId\)/)
  assert.match(rules, /hasOnly\(\['code', 'proposedParticipantIds', 'updatedAt'\]\)/)
  assert.match(rules, /after\.diff\(before\).affectedKeys\(\).hasOnly\(\['memberIds', 'inviteeIds', 'updatedAt'\]\)/)
  assert.match(rules, /allow list: if false;/)
})
