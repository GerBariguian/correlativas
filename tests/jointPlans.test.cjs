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
  let batchNumber = 0
  let failBatch = 0
  let failFinalization = false
  let queue = Promise.resolve()
  const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
  const accepted = (a, b) => relationships.has([a, b].sort().join(':'))
  const canRead = (plan, uid, subjects = false) => plan && (plan.ownerId === uid
    || (plan.inviteeIds.includes(uid) && (!subjects || (!plan.deleting && plan.memberIds.includes(uid)))))
  const api = { auth, db: {},
    friendshipId: (a, b) => { if (a === b) throw new Error('self'); return [a, b].sort().join(':') },
    collection: (_db, ...parts) => parts.join('/'),
    doc: (db, ...parts) => {
      if (parts.length) return parts.join('/')
      const id = `p${++serial}`
      return { id, path: `${db}/${id}` }
    },
    serverTimestamp: () => ++serial,
    where: (...args) => args,
    query: (ref, ...filters) => ({ ref, filters }),
    limit: (size) => size,
    getDocsFromServer: async ({ ref, filters }) => {
      const plan = records.get(ref.split('/').slice(0, 2).join('/'))
      if (!canRead(plan, auth.currentUser?.uid, true)) throw new Error('permission-denied')
      const docs = [...records.keys()].filter((key) => key.startsWith(`${ref}/`)).slice(0, filters[0]).map((key) => ({ ref: key }))
      return { docs, empty: docs.length === 0 }
    },
    writeBatch: () => {
      const refs = []
      return { delete: (ref) => refs.push(ref), commit: async () => {
        if (++batchNumber === failBatch) throw new Error('unavailable')
        for (const ref of refs) {
          const plan = records.get(ref.split('/').slice(0, 2).join('/'))
          if (plan?.ownerId !== auth.currentUser?.uid || !plan.deleting || !plan.closed) throw new Error('permission-denied')
        }
        refs.forEach((ref) => records.delete(ref))
      } }
    },
    runTransaction: (_db, action) => {
      const result = queue.then(async () => {
      const writes = []
      await action({
        get: async (ref) => {
          assert.equal(writes.length, 0)
          if (ref.startsWith('friendships/')) {
            const ids = ref.split('/')[1].split(':')
            return { exists: () => accepted(...ids), data: () => accepted(...ids) ? { status: 'accepted' } : undefined }
          }
          const plan = records.get(ref.split('/').slice(0, 2).join('/'))
          if (!canRead(plan, auth.currentUser?.uid, ref.includes('/subjects/'))) throw new Error('permission-denied')
          return { exists: () => records.has(ref), data: () => clone(records.get(ref)) }
        },
        set: (ref, data) => writes.push(['set', ref.path || ref, clone(data)]),
        update: (ref, data) => writes.push(['set', ref, { ...clone(records.get(ref)), ...clone(data) }]),
        delete: (ref) => writes.push(['delete', ref]),
      })
      if (fail || (failFinalization && writes.some(([, ref]) => ref.startsWith('jointPlanTombstones/')))) throw new Error('unavailable')
      for (const [op, ref, data] of writes) {
        const uid = auth.currentUser?.uid
        const before = records.get(ref)
        const plan = records.get(ref.split('/').slice(0, 2).join('/'))
        if (ref.includes('/activityInbox/')) {
          // Atomic service adapter only; authorization is covered by real Emulator tests.
          assert.ok(writes.some(([,target]) => target.startsWith('jointPlans/')))
          if (op === 'set') assert.equal(data.actorUid, uid)
        } else if (ref.startsWith('jointPlanTombstones/')) {
          const parent = `jointPlans/${ref.split('/')[1]}`
          assert.equal(before, undefined)
          assert.deepEqual(Object.keys(data), ['deletedAt'])
          assert.ok(writes.some(([operation, target]) => operation === 'delete' && target === parent))
        } else if (ref.includes('/subjects/')) {
          if (!plan?.memberIds.includes(uid) || plan.closed || plan.deleting) throw new Error('permission-denied')
        } else if (!before) {
          if (data.ownerId !== uid || data.inviteeIds.some((id) => !accepted(uid, id))) throw new Error('permission-denied')
        } else {
          if (!canRead(before, uid)) throw new Error('permission-denied')
          if (op === 'delete') {
            assert.ok(writes.some(([operation, target]) => operation === 'set' && target === `jointPlanTombstones/${ref.split('/')[1]}`))
            if (before.ownerId !== uid || !before.closed || !before.deleting) throw new Error('permission-denied')
            assert.equal([...records.keys()].some((key) => key.startsWith(`${ref}/`)), false, 'parent must be deleted last')
          }
        }
      }
      for (const [op, ref, data] of writes) { if (op === 'delete') records.delete(ref); else records.set(ref, data) }
      })
      queue = result.catch(() => {})
      return result
    },
    onSnapshot: (ref, options, callback, error) => {
      const listener = { ref, callback, error, stopped: false }; listeners.push(listener)
      return () => { listener.stopped = true }
    },
  }
  vm.createContext(api)
  for (const name of ['src/socialMaintenance.js', 'src/activityLogic.js', 'src/jointPlanLogic.js', 'src/services/jointPlans.js']) {
    vm.runInContext(source(name).replace(/import[\s\S]*?from ['"][^'"]+['"]\s*/g, '').replace(/export /g, ''), api)
  }
  return { api, auth, records, relationships, listeners, canRead, clone, fail: (value) => { fail = value },
    failBatch: (value) => { failBatch = value }, failFinalization: (value) => { failFinalization = value } }
}

test('explicit creation starts with only the creator joined; no academic fields', async () => {
  const { api, records } = setup()
  assert.equal(records.size, 0)
  await api.createJointPlan('alice', 'career', ['bob', 'carol'])
  const plan = [...records.values()][0]
  assert.deepEqual(plan.memberIds, ['alice'])
  assert.deepEqual(plan.inviteeIds, ['bob', 'carol'])
  assert.deepEqual(Object.keys(plan).sort(), ['careerId', 'closed', 'createdAt', 'invitedBy', 'inviteeIds', 'memberIds', 'name', 'ownerId', 'updatedAt'])
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
  assert.deepEqual(Object.keys(row).sort(), ['addedByUid', 'code', 'createdAt', 'proposedParticipantIds', 'updatedAt'])
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

test('accepted members edit courses but cannot close, impersonate or enroll others', async () => {
  const { api, auth, records } = setup()
  await api.createJointPlan('alice', 'career', ['bob'])
  const id = [...records.keys()][0].split('/')[1]
  auth.currentUser = { uid: 'bob' }
  await api.updatePlanMembership('bob', id, true)
  await api.saveJointSubject('bob', id, 'A', ['alice', 'bob'])
  assert.equal(records.get(`jointPlans/${id}/subjects/A`).addedByUid, 'bob')
  await api.removeJointSubject('bob', id, 'A')
  await assert.rejects(api.closeJointPlan('bob', id))
  await assert.rejects(api.updatePlanMembership('alice', id, true))
  auth.currentUser = { uid: 'alice' }
  await assert.rejects(api.updatePlanMembership('alice', id, true))
})

test('plan invitation and membership are independent of friendship; outsiders still have no access', async () => {
  const { api, records, canRead, relationships } = setup()
  await api.createJointPlan('alice', 'career', ['bob', 'carol'])
  const plan = [...records.values()][0]
  assert.equal(canRead(plan, 'dave'), false)
  relationships.delete('alice:bob')
  assert.equal(canRead(plan, 'bob'), true)
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
  assert.deepEqual(clone(listeners[0].ref.filters), [['inviteeIds', 'array-contains', 'bob']])
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
  assert.doesNotMatch(rules, /acceptedPlanningFriend\(plan\(\).ownerId\)/)
  assert.match(rules, /hasOnly\(\['code', 'proposedParticipantIds', 'addedByUid', 'createdAt', 'updatedAt'\]\)/)
  assert.match(rules, /after\.diff\(before\).affectedKeys\(\).hasOnly\(\['memberIds', 'inviteeIds', 'invitedBy', 'updatedAt'\]\)/)
  const academic = rules.slice(rules.indexOf('match /planningSnapshots'), rules.indexOf('match /jointPlanTombstones'))
  assert.match(academic, /acceptedPlanningFriend\(uid\)/)
  assert.doesNotMatch(academic, /memberIds|jointPlans/)
  assert.match(rules, /allow list: if false;/)
})

test('manual names normalize whitespace and reject empty, long or control-character input', () => {
  const { api } = setup()
  assert.equal(api.planName('  2C   2027  '), '2C 2027')
  for (const name of ['', '   ', 'a'.repeat(81), 'hola\nplan', null, {}]) assert.throws(() => api.planName(name))
  assert.equal(api.fallbackPlanName(['Juan']), 'Plan con Juan')
  assert.equal(api.fallbackPlanName(['Juan', 'Nacho']), 'Plan con Juan y Nacho')
  assert.equal(api.fallbackPlanName(['Juan', 'Nacho', 'Pedro', 'Ana']), 'Plan con Juan, Nacho y 2 más')
  assert.equal(api.fallbackPlanName([]), 'Plan conjunto')
})

test('pending invitees cannot rename, add, remove or invite; accepted members can rename', async () => {
  const { api, auth, records } = setup()
  const id = await api.createJointPlan('alice', 'career', ['bob'], '2C 2027')
  auth.currentUser = { uid: 'bob' }
  await assert.rejects(api.renameJointPlan('bob', id, 'Cambio'))
  await assert.rejects(api.saveJointSubject('bob', id, 'A', ['alice', 'bob']))
  await assert.rejects(api.removeJointSubject('bob', id, 'A'))
  await assert.rejects(api.inviteJointParticipant('bob', id, 'dave'))
  await api.updatePlanMembership('bob', id, true)
  await api.renameJointPlan('bob', id, '  Plan de los pibes ')
  assert.equal(records.get(`jointPlans/${id}`).name, 'Plan de los pibes')
  assert.equal(records.get(`jointPlans/${id}`).ownerId, 'alice')
})

test('member invites their own friend who is not a friend of the owner, without academic sharing', async () => {
  const { api, auth, records, relationships, canRead } = setup()
  const id = await api.createJointPlan('alice', 'career', ['bob'])
  auth.currentUser = { uid: 'bob' }
  await api.updatePlanMembership('bob', id, true)
  await api.inviteJointParticipant('bob', id, 'dave')
  let plan = records.get(`jointPlans/${id}`)
  assert.equal(plan.invitedBy.dave, 'bob')
  assert.equal(relationships.has('alice:dave'), false)
  assert.equal(canRead(plan, 'dave'), true)
  assert.equal(canRead(plan, 'dave', true), false)
  auth.currentUser = { uid: 'dave' }
  await api.updatePlanMembership('dave', id, true)
  await api.renameJointPlan('dave', id, 'Plan colaborativo')
  await api.saveJointSubject('dave', id, 'A', ['alice', 'dave'])
  assert.equal(records.get(`jointPlans/${id}/subjects/A`).addedByUid, 'dave')
  plan = records.get(`jointPlans/${id}`)
  relationships.delete('bob:dave')
  assert.equal(canRead(plan, 'dave', true), true)
  assert.equal([...records.keys()].some((key) => key.startsWith('planning') || (key.startsWith('users/') && !key.includes('/activityInbox/'))), false)
})

test('a member cannot invite arbitrary users, and concurrent duplicate invitations yield only one invite', async () => {
  const { api, auth, records } = setup()
  const id = await api.createJointPlan('alice', 'career', ['bob'])
  auth.currentUser = { uid: 'bob' }
  await api.updatePlanMembership('bob', id, true)
  await assert.rejects(api.inviteJointParticipant('bob', id, 'carol')) // Owner's friend, not Bob's.
  const results = await Promise.allSettled([api.inviteJointParticipant('bob', id, 'dave'), api.inviteJointParticipant('bob', id, 'dave')])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.deepEqual(records.get(`jointPlans/${id}`).inviteeIds, ['bob', 'dave'])
  await assert.rejects(api.inviteJointParticipant('bob', id, 'bob'))
})

test('reject removes only oneself and inviter metadata; owner cannot leave', async () => {
  const { api, auth, records } = setup()
  const id = await api.createJointPlan('alice', 'career', ['bob', 'carol'])
  await assert.rejects(api.updatePlanMembership('alice', id, false))
  auth.currentUser = { uid: 'bob' }
  await api.updatePlanMembership('bob', id, false)
  assert.deepEqual(records.get(`jointPlans/${id}`).invitedBy, { carol: 'alice' })
  assert.deepEqual(records.get(`jointPlans/${id}`).inviteeIds, ['carol'])
})

test('attribution and original creation date survive edits from a different member', async () => {
  const { api, auth, records } = setup()
  const id = await api.createJointPlan('alice', 'career', ['bob', 'carol'])
  await api.saveJointSubject('alice', id, 'A', ['alice', 'bob'])
  const original = records.get(`jointPlans/${id}/subjects/A`)
  auth.currentUser = { uid: 'bob' }
  await api.updatePlanMembership('bob', id, true)
  await api.saveJointSubject('bob', id, 'A', ['alice', 'bob', 'carol'])
  const current = records.get(`jointPlans/${id}/subjects/A`)
  assert.equal(current.addedByUid, 'alice')
  assert.equal(current.createdAt, original.createdAt)
  assert.ok(current.updatedAt > original.updatedAt)
})

test('closed plans stay readable to members but deny renaming, invitations and subject mutations', async () => {
  const { api, auth, records, canRead } = setup()
  const id = await api.createJointPlan('alice', 'career', ['bob'])
  auth.currentUser = { uid: 'bob' }; await api.updatePlanMembership('bob', id, true)
  auth.currentUser = { uid: 'alice' }; await api.closeJointPlan('alice', id)
  auth.currentUser = { uid: 'bob' }
  assert.equal(canRead(records.get(`jointPlans/${id}`), 'bob', true), true)
  await assert.rejects(api.renameJointPlan('bob', id, 'No'))
  await assert.rejects(api.inviteJointParticipant('bob', id, 'dave'))
  await assert.rejects(api.saveJointSubject('bob', id, 'A', ['alice', 'bob']))
  await assert.rejects(api.removeJointSubject('bob', id, 'A'))
  await assert.rejects(api.deleteJointPlan('bob', id))
  assert.equal(records.has(`jointPlans/${id}`), true)
})

test('owner deletion drains all subject pages before deleting the parent, preserving unrelated data', async () => {
  const { api, records } = setup()
  const id = await api.createJointPlan('alice', 'career', ['bob'])
  await assert.rejects(api.deleteJointPlan('alice', id))
  for (let n = 0; n < 205; n++) records.set(`jointPlans/${id}/subjects/S${n}`, { code: `S${n}` })
  records.set('users/alice/careers/other', { statusMap: { A: 'Aprobada' } })
  await api.closeJointPlan('alice', id)
  await api.deleteJointPlan('alice', id)
  assert.equal([...records.keys()].some((key) => key.startsWith(`jointPlans/${id}`)), false)
  assert.equal(records.has('users/alice/careers/other'), true)
  assert.deepEqual(Object.keys(records.get(`jointPlanTombstones/${id}`)), ['deletedAt'])
})

test('interrupted deletion retains a locked parent and resumes without orphan documents', async () => {
  const { api, records, failBatch } = setup()
  const id = await api.createJointPlan('alice', 'career', ['bob'])
  for (let n = 0; n < 201; n++) records.set(`jointPlans/${id}/subjects/S${n}`, { code: `S${n}` })
  await api.closeJointPlan('alice', id)
  failBatch(2)
  await assert.rejects(api.deleteJointPlan('alice', id))
  assert.equal(records.get(`jointPlans/${id}`).deleting, true)
  assert.equal(records.has(`jointPlanTombstones/${id}`), false)
  assert.equal([...records.keys()].filter((key) => key.includes('/subjects/')).length, 101)
  await assert.rejects(api.saveJointSubject('alice', id, 'A', ['alice', 'bob']))
  failBatch(0)
  await api.deleteJointPlan('alice', id)
  assert.equal(records.size, 1)
  assert.ok(records.has(`jointPlanTombstones/${id}`))
})

test('failed finalization keeps the locked parent without a tombstone and can be retried', async () => {
  const { api, records, failFinalization } = setup()
  const id = await api.createJointPlan('alice', 'career', ['bob'])
  records.set(`jointPlans/${id}/subjects/A`, { code: 'A' })
  await api.closeJointPlan('alice', id)
  failFinalization(true)
  await assert.rejects(api.deleteJointPlan('alice', id), /unavailable/)
  assert.equal(records.get(`jointPlans/${id}`).deleting, true)
  assert.equal(records.has(`jointPlans/${id}/subjects/A`), false)
  assert.equal(records.has(`jointPlanTombstones/${id}`), false)
  failFinalization(false)
  await api.deleteJointPlan('alice', id)
  assert.equal(records.has(`jointPlans/${id}`), false)
  assert.deepEqual(Object.keys(records.get(`jointPlanTombstones/${id}`)), ['deletedAt'])
})

test('legacy plans and courses can be read, renamed and edited without erasing existing memberships', async () => {
  const { api, auth, records } = setup()
  records.set('jointPlans/old', { ownerId: 'alice', careerId: 'career', inviteeIds: ['bob'], memberIds: ['alice', 'bob'], closed: false, createdAt: 1, updatedAt: 1 })
  records.set('jointPlans/old/subjects/A', { code: 'A', proposedParticipantIds: ['alice', 'bob'], updatedAt: 1 })
  assert.equal(api.invitedBy(records.get('jointPlans/old'), 'bob'), 'alice')
  auth.currentUser = { uid: 'bob' }
  await api.renameJointPlan('bob', 'old', 'Plan anterior')
  await api.saveJointSubject('bob', 'old', 'A', ['alice', 'bob'])
  await api.inviteJointParticipant('bob', 'old', 'dave')
  assert.equal(api.invitedBy(records.get('jointPlans/old'), 'bob'), 'alice')
  assert.equal(api.invitedBy(records.get('jointPlans/old'), 'dave'), 'bob')
  assert.equal(records.get('jointPlans/old/subjects/A').addedByUid, 'alice')
  assert.equal(records.get('jointPlans/old/subjects/A').createdAt, 1)
  assert.deepEqual(records.get('jointPlans/old').memberIds, ['alice', 'bob'])
})
