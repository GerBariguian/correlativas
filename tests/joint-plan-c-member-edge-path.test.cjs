const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const source = fs.readFileSync(path.resolve(__dirname, '../src/jointPlanLogic.js'), 'utf8').replace(/export /g, '')
const api = new Function(source + ';return {jointCSubjectBasePath,jointCMemberEdgePath}')()
const plan = 'explicitplan0001x', a1 = 'occurrence000001x', a2 = 'occurrence000002x'
test('S3-A subject base uses explicit plan and code', () => {
  assert.equal(api.jointCSubjectBasePath(plan, '3.4.100'), `jointPlans/${plan}/subjects/3.4.100`)
})
test('S3-A invalid plan and subject path segments rejected', () => {
  for (const p of ['', 'short', 'a/b', null]) assert.throws(() => api.jointCSubjectBasePath(p, 'A'))
  for (const code of ['', '.', '..', 'a/b', null, 1, 'a'.repeat(101)]) assert.throws(() => api.jointCSubjectBasePath(plan, code))
  assert.ok(api.jointCSubjectBasePath(plan, 'a'.repeat(100)))
})
test('S3-A member edge uses canonical UID and occupancy key', () => {
  assert.equal(api.jointCMemberEdgePath(plan, 'A', 'alice', a1), `jointPlans/${plan}/subjects/A/memberEdges/alice:${a1}`)
})
test('S3-A invalid UID or occupancy rejected', () => {
  for (const uid of ['', 'a:b', 'a/b', null]) assert.throws(() => api.jointCMemberEdgePath(plan, 'A', uid, a1))
  for (const o of ['', 'short', 'a:b', null]) assert.throws(() => api.jointCMemberEdgePath(plan, 'A', 'alice', o))
})
test('S3-A A1, B1 and A2 have distinct paths, without asserting authority', () => {
  const paths = [api.jointCMemberEdgePath(plan, 'A', 'alice', a1), api.jointCMemberEdgePath(plan, 'A', 'bob', a1), api.jointCMemberEdgePath(plan, 'A', 'alice', a2)]
  assert.equal(new Set(paths).size, 3)
})
test('S3-A owner and existing imported occupancy convention retained', () => {
  assert.ok(api.jointCMemberEdgePath(plan, 'A', 'alice', 'owner').endsWith('/alice:owner'))
  assert.ok(api.jointCMemberEdgePath(plan, 'A', 'alice', `import_${a1}`).endsWith(`/alice:import_${a1}`))
})

const domain = new Function(source + ';return {decodeJointCMemberReference,decodeJointCSubjectBase,decodeJointCMemberEdge,newJointCSubjectBase,newJointCMemberEdge}')()
const stamp = () => ({ seconds: 1, nanoseconds: 0 })
const ref = (occurrence = a1) => ({ slotId: 'slot1', instanceId: 'instanceA', occurrence, slotRevision: 1 })
const owner = () => ({ slotId: 'owner', instanceId: 'ownerInstance', occurrence: 'owner', slotRevision: 0 })
const base = () => domain.newJointCSubjectBase(plan, 'A', 'alice', ref(), stamp())
const edge = () => domain.newJointCMemberEdge(plan, 'A', 'alice', ref(), 'bob', owner(), stamp())
const readBase = data => domain.decodeJointCSubjectBase(plan, 'A', data)
const readEdge = data => domain.decodeJointCMemberEdge(plan, 'A', 'alice', a1, data)
test('S3-A base builder and decoder preserve exact v1 shape', () => assert.deepEqual(readBase(base()), base()))
test('S3-A edge builder starts assigned revision 1 with explicit provenance', () => {
  assert.deepEqual(readEdge(edge()), edge())
  assert.equal(edge().revision, 1)
  assert.equal(edge().state, 'assigned')
})
test('S3-A separate strict document versions reject experimental and parent schemas', () => {
  for (const schemaVersion of [undefined, '1', 0, 2, 3, 31]) {
    assert.throws(() => readBase({ ...base(), schemaVersion }))
    assert.throws(() => readEdge({ ...edge(), schemaVersion }))
  }
})
test('S3-A base and edge require exact fields', () => {
  for (const [make, decode] of [[base, readBase], [edge, readEdge]]) {
    for (const key of Object.keys(make())) { const d = make(); delete d[key]; assert.throws(() => decode(d)) }
    assert.throws(() => decode({ ...make(), authorized: true }))
  }
})
test('S3-A references enforce owner and slot identities, exact fields and revisions', () => {
  for (const r of [ref(), owner(), ref('import_' + a1)]) assert.deepEqual(domain.decodeJointCMemberReference(r), r)
  for (const r of [null, {}, { ...ref(), extra: 1 }, { ...ref(), slotId: 'slot5' }, { ...ref(), instanceId: '' },
    { ...ref(), occurrence: 'owner' }, { ...ref(), slotRevision: 0 }, { ...ref(), slotRevision: 1.5 },
    { ...ref(), slotRevision: Number.MAX_SAFE_INTEGER + 1 }, { ...owner(), slotRevision: 1 }, { ...owner(), occurrence: a1 }]) {
    assert.throws(() => domain.decodeJointCMemberReference(r))
  }
  for (const key of Object.keys(ref())) { const r = ref(); delete r[key]; assert.throws(() => domain.decodeJointCMemberReference(r)) }
})
test('S3-A edge revision/state and redundant path identities validated', () => {
  for (const revision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => readEdge({ ...edge(), revision }))
  assert.equal(readEdge({ ...edge(), state: 'unassigned', revision: 2 }).state, 'unassigned')
  assert.throws(() => readEdge({ ...edge(), state: 'current' }))
  assert.throws(() => readEdge({ ...edge(), uid: 'bob' }))
  assert.throws(() => readEdge({ ...edge(), targetRef: ref(a2) }))
  assert.throws(() => readBase({ ...base(), code: 'B' }))
})
test('S3-A resolved timestamps validated and detached', () => {
  for (const invalid of [null, 'server-time', { seconds: 1, nanoseconds: 1e9 }, { seconds: 253402300800, nanoseconds: 0 }]) {
    assert.throws(() => readBase({ ...base(), createdAt: invalid }))
    assert.throws(() => readEdge({ ...edge(), updatedAt: invalid }))
  }
  const d = edge(), out = readEdge(d); out.createdAt.seconds = 3; out.targetRef.slotRevision = 4
  assert.equal(d.createdAt.seconds, 1); assert.equal(d.targetRef.slotRevision, 1)
})
test('S3-A builders accept supplied server token without generating time or mutating references', () => {
  const r = Object.freeze(ref()), actor = Object.freeze(owner()), token = Object.freeze({ serverTimestamp: true })
  const d = domain.newJointCMemberEdge(plan, 'A', 'alice', r, 'bob', actor, token)
  assert.equal(d.createdAt, token); assert.equal(d.updatedAt, token)
  d.targetRef.slotRevision = 5; assert.equal(r.slotRevision, 1)
  assert.throws(() => domain.newJointCSubjectBase(plan, 'A', 'alice', r, null))
})
test('S3-A A1 A2 and B1 DTOs remain distinct without claiming current authority', () => {
  const first = edge(), next = domain.newJointCMemberEdge(plan, 'A', 'alice', { ...ref(a2), slotRevision: 3 }, 'bob', owner(), stamp())
  const other = domain.newJointCMemberEdge(plan, 'A', 'charlie', ref(a2), 'bob', owner(), stamp())
  assert.notDeepEqual(first.targetRef, next.targetRef); assert.notEqual(first.uid, other.uid)
  assert.deepEqual(readEdge(first), first) // Historical validity is not current operability.
  assert.equal('authorized' in next, false)
})
