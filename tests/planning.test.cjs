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
  const context = { auth, db: {}, careers: [career, { ...career, id: 'other' }],
    doc: (_db, ...parts) => parts.join('/'),
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
  vm.runInContext(read('src/logic.js'), context)
  vm.runInContext(read('src/planningLogic.js'), context)
  vm.runInContext(read('src/services/planning.js'), context)
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
  await api.savePlanningProgress('alice', career.id, career.initialStatus)
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
  await api.savePlanningProgress('alice', 'career', { ...career.initialStatus, A: 'Aprobada' })
  assert.deepEqual(records.get('planningSnapshots/alice/careers/career').approvedCodes, ['A'])
  assert.equal(records.get('planningSnapshots/alice/careers/career').sourceUpdatedAt, records.get('users/alice/careers/career').updatedAt)
  await api.savePlanningProgress('alice', 'career', career.initialStatus)
  assert.deepEqual(records.get('planningSnapshots/alice/careers/career').approvedCodes, [])
})

test('failed save applies neither private progress nor its snapshot', async () => {
  const { api, career, records, fail } = setup()
  await api.setPlanningSharing('alice', 'career', true)
  const before = JSON.stringify([...records])
  fail(true)
  await assert.rejects(api.savePlanningProgress('alice', 'career', { A: 'Aprobada' }))
  assert.equal(JSON.stringify([...records]), before)
  fail(false)
  await api.savePlanningProgress('alice', 'career', career.initialStatus)
})

test('disable stops publication and another career does not switch consent', async () => {
  const { api, career, records } = setup()
  await api.setPlanningSharing('alice', 'career', true)
  const before = JSON.stringify(records.get('planningSnapshots/alice/careers/career'))
  await api.savePlanningProgress('alice', 'other', career.initialStatus)
  assert.equal(records.has('planningSnapshots/alice/careers/other'), false)
  assert.equal(records.get('planningSharing/alice').sharedCareerId, 'career')
  await api.setPlanningSharing('alice', 'career', false)
  await api.savePlanningProgress('alice', 'career', { A: 'Aprobada' })
  assert.equal(JSON.stringify(records.get('planningSnapshots/alice/careers/career')), before)
})

test('publication rejects another session and unsupported careers', async () => {
  const { api, auth } = setup()
  await assert.rejects(api.setPlanningSharing('bob', 'career', true))
  await assert.rejects(api.savePlanningProgress('alice', 'missing', {}))
  const pending = api.savePlanningProgress('alice', 'career', {})
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
