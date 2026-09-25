const { equal } = require('../scripts/multicareer-migration.cjs')
const TIME = { seconds: 1700000000, nanoseconds: 123456789 }
const progress = () => ({ statusMap: { A: 'Aprobada', B: 'Regularizada', C: 'Cursando', D: 'Pendiente' }, updatedAt: TIME })
const projection = (catalog = 'cat', version = 2) => ({ schemaVersion: version, careerId: catalog,
  revisionToken: 'revision_token_12345', updatedAt: TIME,
  scenario: { startPeriod: { year: 2027, term: '1C' }, initialCapacity: 4, maxPeriods: 20,
    capacities: [], manualPeriods: [], finalEvents: version === 2 ? ['A@2028:1C'] : [] } })
const pair = (uid = 'alice', catalog = 'cat', instance = 'opaque', archived = false) => ({
  [`users/${uid}/careerInstances/${instance}`]: { schemaVersion: 1, catalogId: catalog, lifecycle: archived ? 'archived' : 'active',
    createdAt: TIME, updatedAt: TIME, archivedAt: archived ? TIME : null },
  [`users/${uid}/catalogMemberships/${catalog}`]: { schemaVersion: 1, careerInstanceId: instance },
})
function fixture(initial = {}) {
  let docs = structuredClone(initial), version = 0
  return { environment: 'fixture', snapshot: () => structuredClone(docs),
    mutate(path, value) { docs[path] = structuredClone(value); version++ },
    async transaction(operation) {
      const expected = version, { writes, result } = await operation(structuredClone(docs), TIME)
      if (expected !== version) throw Object.assign(new Error('MIGRATION_CONCURRENT_CONFLICT'), { code: 'MIGRATION_CONCURRENT_CONFLICT' })
      if (Object.entries(writes).some(([p, v]) => !equal(docs[p], v))) { Object.assign(docs, structuredClone(writes)); version++ }
      return result
    } }
}
module.exports = { fixture, TIME, progress, projection, pair }
