const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    .replace(/import[\s\S]*?from ['"][^'"]+['"]\s*/g, '').replace(/export /g, '')
}

function setup() {
  const career = { id: 'career', initialStatus: { A: 'Pendiente', B: 'Pendiente', C: 'Pendiente', D: 'Pendiente' }, subjects: [
    { code: 'A', prereqs: [] }, { code: 'B', prereqs: ['A'] },
    { code: 'C', approvedPrereqs: ['A'] }, { code: 'D', prereqs: [] },
  ] }
  const records = new Map()
  const listeners = []
  const reads = []
  let failure = false
  let time = 0
  let queue = Promise.resolve()
  const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
  const auth = { currentUser: { uid: 'alice' } }
  const context = { structuredClone, auth, db: {}, careers: [career, { ...career, id: 'other' }],
    doc: (_db, ...parts) => parts.join('/'),
    getDocFromServer: async ref => ({ exists: () => records.has(ref), data: () => clone(records.get(ref)) }),
    serverTimestamp: () => ++time,
    runTransaction: (_db, task) => {
      const result = queue.then(async () => {
        const writes = []
        await task({
          get: async (ref) => {
            assert.equal(writes.length, 0, 'reads before writes')
            reads.push(ref)
            return { exists: () => records.has(ref), data: () => clone(records.get(ref)) }
          },
          set: (ref, data, options) => writes.push([ref, options ? { ...records.get(ref), ...clone(data) } : clone(data)]),
        })
        if (failure) throw new Error('write failed')
        writes.forEach(([ref, value]) => records.set(ref, value))
      })
      queue = result.catch(() => {})
      return result
    },
    onSnapshot: (ref, options, callback, error) => {
      const listener = { ref, callback, error, stopped: false }
      listeners.push(listener)
      return () => { listener.stopped = true }
    },
  }
  vm.createContext(context)
  vm.runInContext(read('src/userDataAuthorityLogic.js'), context)
  vm.runInContext(read('src/legacyWriteRevision.js'), context)
  vm.runInContext(read('src/logic.js'), context)
  vm.runInContext(read('src/planningLogic.js'), context)
  vm.runInContext(read('src/services/planning.js'), context)
  context.patch = (map, id = 'career') => ({ type: 'patch', operations: Object.entries(map).map(([code, status]) => {
    const baseline = records.get('users/alice/careers/' + id)?.statusMap ?? {}
    return { code, operation: 'set', status, expected: { exists: Object.hasOwn(baseline, code), ...(Object.hasOwn(baseline, code) ? { status: baseline[code] } : {}) } }
  }) })
  context.reset = map => ({ type: 'reset', statusMap: map, expected: context.legacyProgressDocument({ exists: () => records.has('users/alice/careers/career'), data: () => clone(records.get('users/alice/careers/career')) }) })
  function emit(listener, data, metadata = {}) {
    listener.callback({ exists: () => data !== undefined, data: () => clone(data), metadata: { fromCache: false, hasPendingWrites: false, ...metadata } })
  }
  return { api: context, career, records, reads, clone, listeners, emit, auth, fail: (value) => { failure = value } }
}

test('derived projection shares only approved and eligible codes, respecting both prerequisite types', () => {
  const { api, career, clone } = setup()
  const map = { A: 'Regularizada', B: 'Pendiente', C: 'Pendiente', D: 'Cursando' }
  const snapshot = api.derivePlanningSnapshot(career, map, 1, 2)
  assert.deepEqual(clone(snapshot.approvedCodes), [])
  assert.deepEqual(clone(snapshot.availableToCourseCodes), ['B'])
  assert.deepEqual(Object.keys(snapshot).sort(), ['approvedCodes', 'availableToCourseCodes', 'catalogVersion', 'logicVersion', 'schemaVersion', 'sourceUpdatedAt', 'updatedAt'])
  map.A = 'Aprobada'
  const next = api.derivePlanningSnapshot(career, map, 3, 3)
  assert.deepEqual(clone(next.approvedCodes), ['A'])
  assert.deepEqual(clone(next.availableToCourseCodes), ['B', 'C'])
})

test('comparison identifies shared, own, friend and neither without conflating layers', () => {
  const { api, career, clone } = setup()
  const mine = { approvedCodes: ['A', 'B'], availableToCourseCodes: ['C'] }
  const friend = { approvedCodes: ['B', 'C'], availableToCourseCodes: ['A'] }
  assert.deepEqual(clone(api.comparePlanning(career.subjects, mine, friend, 'approved').map((r) => r.category)), ['mine', 'both', 'friend', 'neither'])
  assert.deepEqual(clone(api.comparePlanning(career.subjects, mine, friend, 'available').map((r) => r.category)), ['friend', 'neither', 'mine', 'neither'])
  assert.equal(api.comparePlanning(career.subjects, mine, null, 'approved').length, 0)
})

test('catalog/logic versions, unknown codes and invalid arrays cannot be compared', () => {
  const { api, career } = setup()
  const snapshot = api.derivePlanningSnapshot(career, career.initialStatus, 1, 1)
  assert.equal(api.snapshotCompatible(snapshot, career), true)
  for (const patch of [{ logicVersion: 'old' }, { catalogVersion: 'old' }, { schemaVersion: 0 }, { approvedCodes: ['X'] }, { approvedCodes: ['A', 'A'] }, { approvedCodes: ['A'] }]) {
    assert.equal(api.snapshotCompatible({ ...snapshot, ...patch }, career), false)
  }
  assert.notEqual(api.catalogVersion(career), api.catalogVersion({ ...career, id: 'another-plan' }))
})

test('sharing defaults off; saving progress does not publish a snapshot', async () => {
  const { api, career, records } = setup()
  await api.savePlanningProgress('alice', career.id, api.patch(career.initialStatus))
  assert.equal(records.size, 1)
  assert.equal(records.has('planningSharing/alice'), false)
  assert.equal(records.has('planningSnapshots/alice/careers/career'), false)
})

test('enable publishes from stored progress, with source timestamp and no confirmation step', async () => {
  const { api, records } = setup()
  records.set('users/alice/careers/career', { statusMap: { A: 'Aprobada' }, updatedAt: 45 })
  await api.setPlanningSharing('alice', 'career', true)
  assert.equal(records.get('planningSharing/alice').enabled, true)
  assert.equal(records.get('planningSnapshots/alice/careers/career').sourceUpdatedAt, 45)
  assert.deepEqual(records.get('planningSnapshots/alice/careers/career').approvedCodes, ['A'])
})

test('enabling a new career persists the same default source that produced the snapshot', async () => {
  const { api, records } = setup()
  await api.setPlanningSharing('alice', 'career', true)
  assert.equal(records.get('users/alice/careers/career').updatedAt, records.get('planningSnapshots/alice/careers/career').sourceUpdatedAt)
})

test('state change and reset update the shared snapshot atomically', async () => {
  const { api, career, records } = setup()
  await api.setPlanningSharing('alice', 'career', true)
  await api.savePlanningProgress('alice', 'career', api.patch({ ...career.initialStatus, A: 'Aprobada' }))
  assert.deepEqual(records.get('planningSnapshots/alice/careers/career').approvedCodes, ['A'])
  assert.equal(records.get('planningSnapshots/alice/careers/career').sourceUpdatedAt, records.get('users/alice/careers/career').updatedAt)
  await api.savePlanningProgress('alice', 'career', api.reset(career.initialStatus))
  assert.deepEqual(records.get('planningSnapshots/alice/careers/career').approvedCodes, [])
})

test('failed save applies neither private progress nor its snapshot', async () => {
  const { api, career, records, fail } = setup()
  await api.setPlanningSharing('alice', 'career', true)
  const before = JSON.stringify([...records])
  fail(true)
  await assert.rejects(api.savePlanningProgress('alice', 'career', api.patch({ A: 'Aprobada' })))
  assert.equal(JSON.stringify([...records]), before)
  fail(false)
  await api.savePlanningProgress('alice', 'career', api.reset(career.initialStatus))
})

test('disable stops publication and another career does not switch consent', async () => {
  const { api, career, records } = setup()
  await api.setPlanningSharing('alice', 'career', true)
  const before = JSON.stringify(records.get('planningSnapshots/alice/careers/career'))
  await api.savePlanningProgress('alice', 'other', api.patch(career.initialStatus, 'other'))
  assert.equal(records.has('planningSnapshots/alice/careers/other'), false)
  assert.equal(records.get('planningSharing/alice').sharedCareerId, 'career')
  await api.setPlanningSharing('alice', 'career', false)
  await api.savePlanningProgress('alice', 'career', api.patch({ A: 'Aprobada' }))
  assert.equal(JSON.stringify(records.get('planningSnapshots/alice/careers/career')), before)
})

test('publication rejects another session and unsupported careers', async () => {
  const { api, auth } = setup()
  await assert.rejects(api.setPlanningSharing('bob', 'career', true))
  await assert.rejects(api.savePlanningProgress('alice', 'missing', {}))
  const pending = api.savePlanningProgress('alice', 'career', api.patch({}))
  auth.currentUser = null
  await assert.rejects(pending)
})

test('no sharing or incompatible plan never subscribes to academic snapshots', () => {
  const { api, career, listeners, emit } = setup()
  const states = []
  const stop = api.subscribePlanningComparison('bob', career, (value) => states.push(value.state))
  emit(listeners[0], undefined)
  assert.equal(states.at(-1), 'disabled')
  emit(listeners[0], { enabled: true, sharedCareerId: 'other' })
  assert.equal(states.at(-1), 'incompatible')
  assert.equal(listeners.length, 1)
  stop()
  assert.equal(listeners[0].stopped, true)
})

test('revocation discards late data, stops subscriptions and never reads private friend progress', () => {
  const { api, career, listeners, emit, reads } = setup()
  const states = []
  const stop = api.subscribePlanningComparison('bob', career, (value) => states.push(value.state))
  emit(listeners[0], { enabled: true, sharedCareerId: career.id })
  const snapshot = api.derivePlanningSnapshot(career, career.initialStatus, 1, 1)
  emit(listeners[1], snapshot)
  assert.equal(states.at(-1), 'ready')
  emit(listeners[0], { enabled: false })
  assert.equal(listeners[1].stopped, true)
  emit(listeners[1], snapshot)
  assert.equal(states.at(-1), 'disabled')
  assert.equal(reads.length, 0)
  assert.ok(listeners.every((item) => !item.ref.startsWith('users/')))
  stop()
})

test('permissions errors and offline snapshots clear the comparison instead of becoming empty progress', () => {
  const { api, career, listeners, emit } = setup()
  const states = []
  api.subscribePlanningComparison('bob', career, (value) => states.push(value))
  emit(listeners[0], { enabled: true, sharedCareerId: career.id })
  emit(listeners[1], api.derivePlanningSnapshot(career, career.initialStatus, 1, 1), { fromCache: true })
  assert.equal(states.at(-1).state, 'unavailable')
  assert.equal(states.at(-1).snapshot, undefined)
  listeners[1].error({ code: 'permission-denied' })
  assert.equal(states.at(-1).state, 'stale')
  listeners[0].error({ code: 'permission-denied' })
  assert.equal(states.at(-1).state, 'unavailable')
  assert.equal(listeners[1].stopped, true)
})

test('finals include every regularized course, even without prerequisites for taking its final', () => {
  const { api, career, clone } = setup()
  const result = api.derivePlanningSnapshot(career, { A: 'Pendiente', B: 'Regularizada', C: 'Aprobada', D: 'Cursando' }, 1, 1, true)
  assert.deepEqual(clone(result.pendingFinalCodes), ['B'])
  assert.equal(api.canTakeFinal(career.subjects[1], { A: 'Pendiente' }), false)
  assert.equal(result.schemaVersion, 2)
  assert.equal(api.snapshotCompatible(result, career), true)
  assert.equal('statusMap' in result, false)
  assert.equal('takingCodes' in result, false)
  for (const pendingFinalCodes of [['B', 'B'], ['X'], ['A'], ['C'], ['D', {}], null]) {
    assert.equal(api.snapshotCompatible({ ...result, pendingFinalCodes }, career), false)
  }
})

test('legacy consent is never automatically expanded when progress changes', async () => {
  const { api, records } = setup()
  records.set('planningSharing/alice', { enabled: true, sharedCareerId: 'career' })
  await api.savePlanningProgress('alice', 'career', api.patch({ A: 'Regularizada' }))
  assert.equal(records.get('planningSnapshots/alice/careers/career').schemaVersion, 1)
  assert.equal('pendingFinalCodes' in records.get('planningSnapshots/alice/careers/career'), false)
  await api.setPlanningSharing('alice', 'career', true)
  assert.equal(records.get('planningSharing/alice').consentVersion, 2)
  assert.deepEqual(records.get('planningSnapshots/alice/careers/career').pendingFinalCodes, ['A'])
  await api.savePlanningProgress('alice', 'career', api.patch({ A: 'Aprobada', B: 'Regularizada' }))
  assert.deepEqual(records.get('planningSnapshots/alice/careers/career').pendingFinalCodes, ['B'])
})

test('schema two cannot be consumed under legacy consent; schema one must not contain finals', () => {
  const { api, career, listeners, emit } = setup()
  const snapshot = api.derivePlanningSnapshot(career, { A: 'Regularizada' }, 1, 1, true)
  assert.equal(api.snapshotCompatible({ ...snapshot, schemaVersion: 1 }, career), false)
  const states = []
  api.subscribePlanningComparison('bob', career, (value) => states.push(value))
  emit(listeners[0], { enabled: true, sharedCareerId: 'career' })
  emit(listeners[1], snapshot)
  assert.equal(states.at(-1).state, 'stale')
  emit(listeners[0], { enabled: true, sharedCareerId: 'career', consentVersion: 2 })
  emit(listeners[2], snapshot)
  assert.equal(states.at(-1).state, 'ready')
})

test('multi comparison preserves all selected people and computes subsets separately in each layer', () => {
  const { api, career } = setup()
  const person = (uid, approvedCodes, availableToCourseCodes, pendingFinalCodes) => ({ uid, isSelf: uid === 'a', state: 'ready', snapshot: { approvedCodes, availableToCourseCodes, pendingFinalCodes } })
  const people = [person('a', ['A', 'B'], ['C'], ['D']), person('b', ['A'], ['B', 'C'], ['D']), person('c', ['A'], ['C', 'D'], ['B'])]
  const approved = api.compareParticipants(career.subjects, people, 'approved')
  assert.equal(approved[0].all, true)
  assert.equal(approved[0].total, 3)
  assert.equal(approved[1].category, 'mine')
  const finals = api.compareParticipants(career.subjects, people, 'finals')
  assert.equal(finals[3].category, 'subset')
  assert.equal(finals[3].matches.length, 2)
  assert.equal(finals[1].category, 'friend')
  assert.equal(api.compareParticipants(career.subjects, people, 'available')[2].all, true)
  assert.equal(api.compareParticipants(career.subjects, people.slice(0, 2), 'finals')[3].all, true)
  for (const state of ['loading', 'disabled', 'stale', 'incompatible', 'unavailable']) {
    const row = api.compareParticipants(career.subjects, [...people, { uid: 'd', state }], 'approved')[0]
    assert.equal(row.all, false)
    assert.equal(row.total, 4)
    assert.equal(row.missing.length, 1)
    assert.equal(row.matches.length, 3)
  }
  const legacy = { ...people[2], snapshot: { approvedCodes: ['A'], availableToCourseCodes: ['C'] } }
  assert.equal(api.compareParticipants(career.subjects, [people[0], legacy], 'finals')[3].missing.length, 1)
  assert.equal(api.compareParticipants(career.subjects, [people[0], legacy], 'approved')[0].all, true)
})

test('selection allows at most four distinct accepted friends', () => {
  const { api, clone } = setup()
  const accepted = ['a', 'b', 'c', 'd', 'e']
  let ids = []
  for (const id of ['outsider', 'a', 'a', 'b', 'c', 'd', 'e']) ids = api.addComparisonFriend(ids, id, accepted)
  assert.deepEqual(clone(ids), ['a', 'b', 'c', 'd'])
})

test('a stored proposal survives changed eligibility, missing data and departed participants', () => {
  const { api, clone } = setup()
  const ids = ['a', 'b', 'c', 'd']
  const people = [{ uid: 'a', state: 'ready', snapshot: { availableToCourseCodes: ['A'] } }, { uid: 'b', state: 'ready', snapshot: { availableToCourseCodes: [] } }, { uid: 'c', state: 'disabled' }]
  const result = api.plannedEligibility('A', ids, people, ['a', 'b', 'c'])
  assert.deepEqual(clone(result.map((p) => p.state)), ['eligible', 'no-longer-eligible', 'unknown', 'not-member'])
  assert.deepEqual(ids, ['a', 'b', 'c', 'd'])
})

test('reset updates only the chosen career and its consented snapshot', async () => {
  const { api, career, records } = setup()
  records.set('users/alice/careers/other', { statusMap: { A: 'Aprobada' }, updatedAt: 100 })
  records.set('jointPlans/p', { subjects: ['A'] })
  records.set('friendships/alice:bob', { status: 'accepted' })
  await api.setPlanningSharing('alice', 'career', true)
  await api.savePlanningProgress('alice', 'career', api.patch({ A: 'Regularizada' }))
  const preserved = ['users/alice/careers/other', 'jointPlans/p', 'friendships/alice:bob', 'planningSharing/alice'].map((key) => JSON.stringify(records.get(key)))
  await api.savePlanningProgress('alice', 'career', api.reset(career.initialStatus))
  assert.deepEqual(records.get('users/alice/careers/career').statusMap, career.initialStatus)
  assert.deepEqual(records.get('planningSnapshots/alice/careers/career').pendingFinalCodes, [])
  assert.deepEqual(['users/alice/careers/other', 'jointPlans/p', 'friendships/alice:bob', 'planningSharing/alice'].map((key) => JSON.stringify(records.get(key))), preserved)
})

test('late consent events cannot reopen subscriptions after cleanup', () => {
  const { api, career, listeners, emit } = setup()
  const states = []
  const stop = api.subscribePlanningComparison('bob', career, (value) => states.push(value))
  stop()
  emit(listeners[0], { enabled: true, sharedCareerId: career.id, consentVersion: 2 })
  listeners[0].error({ code: 'permission-denied' })
  assert.equal(listeners.length, 1)
  assert.equal(states.length, 0)
})

test('a new session for the same uid cannot finish old progress or consent writes', async () => {
  for (const method of ['savePlanningProgress', 'setPlanningSharing']) {
    const { api, auth, records } = setup()
    const request = api[method]('alice', 'career', method === 'setPlanningSharing' ? true : {})
    auth.currentUser = { uid: 'alice' }
    await assert.rejects(request)
    assert.equal(records.size, 0)
  }
})
require('./instance-planning.test.cjs')

for (const sameSubject of [false, true]) test(`Rules-first CAS rejection preserves original intent; same subject=${sameSubject}`, async () => {
  const { api, records } = setup()
  const run = api.runTransaction
  let calls = 0
  api.runTransaction = (db, callback) => run(db, async tx => {
    await callback(tx)
    if (++calls === 1) {
      records.set('users/alice/careers/career', { statusMap: { [sameSubject ? 'A' : 'B']: 'Aprobada' }, updatedAt: 1, writeRevision: 1 })
      throw Object.assign(Error('Rules rejected stale revision'), { code: 'permission-denied' })
    }
  })
  const operation = api.savePlanningProgress('alice', 'career', api.patch({ A: 'Pendiente' }))
  if (sameSubject) {
    await assert.rejects(operation, /CONFLICT/)
    assert.equal(calls, 1)
    assert.deepEqual(records.get('users/alice/careers/career').statusMap, { A: 'Aprobada' })
  } else {
    const result = await operation
    assert.equal(calls, 2)
    assert.deepEqual(JSON.parse(JSON.stringify(result.statusMap)), { A: 'Pendiente', B: 'Aprobada' })
    assert.equal(result.writeRevision, 2)
  }
})

test('permission denial without revision advancement is not retried', async () => {
  const { api } = setup()
  const run = api.runTransaction
  let calls = 0
  api.runTransaction = (db, callback) => run(db, async tx => {
    calls++; await callback(tx)
    throw Object.assign(Error('denied'), { code: 'permission-denied' })
  })
  await assert.rejects(api.savePlanningProgress('alice', 'career', api.patch({ A: 'Pendiente' })), /denied/)
  assert.equal(calls, 1)
})

test('Rules-first retries are bounded even if revision keeps advancing independently', async () => {
  const { api, records } = setup()
  const run = api.runTransaction
  let calls = 0
  api.runTransaction = (db, callback) => run(db, async tx => {
    await callback(tx); calls++
    records.set('users/alice/careers/career', { statusMap: { B: 'Aprobada' }, updatedAt: calls, writeRevision: calls })
    throw Object.assign(Error('denied'), { code: 'permission-denied' })
  })
  await assert.rejects(api.savePlanningProgress('alice', 'career', api.patch({ A: 'Pendiente' })), /denied/)
  assert.equal(calls, 4)
  assert.equal(Object.hasOwn(records.get('users/alice/careers/career').statusMap, 'A'), false)
})

test('writeRevision initializes and increments for ordinary save, reset and sharing initialization', async () => {
  const { api, records } = setup()
  await api.setPlanningSharing('alice', 'career', true)
  assert.equal(records.get('users/alice/careers/career').writeRevision, 1)
  await api.savePlanningProgress('alice', 'career', api.patch({ A: 'Aprobada' }))
  assert.equal(records.get('users/alice/careers/career').writeRevision, 2)
  await api.savePlanningProgress('alice', 'career', api.reset({}))
  assert.equal(records.get('users/alice/careers/career').writeRevision, 3)
})

test('writeRevision fails closed on invalid values and exhaustion', async () => {
  const { api, records } = setup()
  for (const writeRevision of [null, 0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER]) {
    records.set('users/alice/careers/career', { statusMap: {}, writeRevision, updatedAt: 1 })
    await assert.rejects(api.savePlanningProgress('alice', 'career', api.patch({ A: 'Aprobada' })), /WRITE_REVISION/)
    assert.deepEqual(records.get('users/alice/careers/career').statusMap, {})
  }
})

test('reset cannot reuse a precondition with an earlier writeRevision', async () => {
  const { api, records } = setup()
  await api.savePlanningProgress('alice', 'career', api.patch({ A: 'Aprobada' }))
  const reset = api.reset({})
  records.get('users/alice/careers/career').writeRevision++
  await assert.rejects(api.savePlanningProgress('alice', 'career', reset), /CONFLICT/)
})

test('four isolated Rule artifacts are reproducible and change only the legacy career grant', () => {
  const { artifacts } = require('../scripts/prepare-legacy-write-revision.cjs')
  const generated = artifacts()
  assert.equal(generated.length, 4)
  for (const { file, content } of generated) assert.equal(fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n'), content)
})

test('legacy independent stale patches preserve unknown keys and return confirmed state', async () => {
  const { api, records, clone } = setup()
  records.set('users/alice/careers/career', { statusMap: { OLD: 'Regularizada' }, updatedAt: 0 })
  const a = api.patch({ A: 'Pendiente' }), b = api.patch({ B: 'Aprobada' })
  await api.savePlanningProgress('alice', 'career', b)
  const result = await api.savePlanningProgress('alice', 'career', a)
  assert.deepEqual(clone(result.statusMap), { OLD: 'Regularizada', B: 'Aprobada', A: 'Pendiente' })
})

test('legacy same-subject concurrent operations have one winner, including absent vs Pending', async () => {
  const { api, records } = setup()
  const a = api.patch({ A: 'Pendiente' }), b = api.patch({ A: 'Aprobada' })
  const results = await Promise.allSettled([api.savePlanningProgress('alice', 'career', a), api.savePlanningProgress('alice', 'career', b)])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.match(results.find(r => r.status === 'rejected').reason.message, /CONFLICT/)
  assert.equal(records.get('users/alice/careers/career').statusMap.A, 'Pendiente')
})

test('legacy explicit delete is distinct from Pending and cannot delete a changed subject', async () => {
  const { api, records } = setup()
  await api.savePlanningProgress('alice', 'career', api.patch({ A: 'Pendiente', B: 'Aprobada' }))
  const remove = { type: 'patch', operations: [{ code: 'A', operation: 'delete', expected: { exists: true, status: 'Pendiente' } }] }
  await api.savePlanningProgress('alice', 'career', api.patch({ A: 'Cursando' }))
  await assert.rejects(api.savePlanningProgress('alice', 'career', remove), /CONFLICT/)
  remove.operations[0].expected.status = 'Cursando'
  await api.savePlanningProgress('alice', 'career', remove)
  assert.deepEqual(records.get('users/alice/careers/career').statusMap, { B: 'Aprobada' })
})

test('legacy reset conflicts after unrelated progress, then succeeds only with a new document precondition', async () => {
  const { api, records } = setup()
  await api.savePlanningProgress('alice', 'career', api.patch({ A: 'Aprobada' }))
  const reset = api.reset({})
  await api.savePlanningProgress('alice', 'career', api.patch({ UNKNOWN: 'Regularizada' }))
  await assert.rejects(api.savePlanningProgress('alice', 'career', reset), /CONFLICT/)
  await api.savePlanningProgress('alice', 'career', api.reset({}))
  assert.deepEqual(records.get('users/alice/careers/career').statusMap, {})
})

test('legacy rejects blind replacement, invalid intent and malformed progress; empty patch writes nothing', async () => {
  const { api, records } = setup()
  for (const intent of [{ A: 'Aprobada' }, { type: 'patch', operations: [{ code: 'A', operation: 'set', status: 'other', expected: { exists: false } }] }]) {
    await assert.rejects(api.savePlanningProgress('alice', 'career', intent), /INVALID_LEGACY_OPERATION/)
  }
  await api.savePlanningProgress('alice', 'career', { type: 'patch', operations: [] })
  assert.equal(records.size, 0)
  records.set('users/alice/careers/career', { updatedAt: 0 })
  await assert.rejects(api.savePlanningProgress('alice', 'career', api.patch({ A: 'Aprobada' })), /INVALID_ACADEMIC_PROGRESS/)
})

test('legacy rejects changed authority and live scope without writing', async () => {
  const { api, records } = setup()
  records.set('migrationUsers/alice', { authority: 'frozen' })
  await assert.rejects(api.savePlanningProgress('alice', 'career', api.patch({ A: 'Aprobada' })), /AUTHORITY_CHANGED/)
  records.clear()
  let checks = 0
  await assert.rejects(api.savePlanningProgress('alice', 'career', api.patch({ A: 'Aprobada' }), () => { if (++checks === 3) throw Error('SCOPE_CHANGED') }), /SCOPE_CHANGED/)
  assert.equal(records.size, 0)
})

test('legacy captures caller intent before awaits, and reset detects timestamp-only changes', async () => {
  const { api, records } = setup()
  const command = api.patch({ A: 'Pendiente' })
  const pending = api.savePlanningProgress('alice', 'career', command)
  command.operations[0].status = 'Aprobada'
  await pending
  assert.equal(records.get('users/alice/careers/career').statusMap.A, 'Pendiente')
  const reset = api.reset({})
  records.get('users/alice/careers/career').updatedAt++
  await assert.rejects(api.savePlanningProgress('alice', 'career', reset), /CONFLICT/)
})

test('legacy confirmation read errors remain errors, never successful empty progress', async () => {
  const { api, records } = setup()
  const error = Object.assign(new Error('permission-denied'), { code: 'permission-denied' })
  api.getDocFromServer = async () => { throw error }
  await assert.rejects(api.savePlanningProgress('alice', 'career', api.patch({ A: 'Aprobada' })), e => e === error)
  // The write can have committed before a confirmation read fails. Never retry
  // blindly; reload before capturing a new operation.
  assert.equal(records.get('users/alice/careers/career').statusMap.A, 'Aprobada')
})
