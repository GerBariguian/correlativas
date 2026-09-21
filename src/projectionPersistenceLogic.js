// Persistence validates decisions, not their current academic eligibility.
const fail = () => { throw new Error('INVALID_PROJECTION_DOCUMENT') }
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === allowed.length && Object.keys(value).every(k => allowed.includes(k))
const period = p => {
  if (!keys(p, ['year', 'term']) || !Number.isInteger(p.year) || p.year < 1 || p.year > 9979 || !['1C', '2C'].includes(p.term)) fail()
  return { year: p.year, term: p.term }
}
const index = p => p.year * 2 + (p.term === '2C' ? 1 : 0)
const capacity = n => Number.isSafeInteger(n) && n >= 0
export function normalizeProjectionScenario(s) {
  if (!keys(s, ['startPeriod', 'initialCapacity', 'maxPeriods', 'capacities', 'manualPeriods', 'finalEvents'])
    || !capacity(s.initialCapacity) || s.initialCapacity < 1 || !Number.isInteger(s.maxPeriods) || s.maxPeriods < 1 || s.maxPeriods > 40
    || !Array.isArray(s.capacities) || s.capacities.length > 40 || !Array.isArray(s.manualPeriods) || s.manualPeriods.length > 40
    || !Array.isArray(s.finalEvents) || s.finalEvents.length) fail()
  const normalizeList = (list, manual) => {
    const seen = new Set(), codesSeen = new Set()
    return list.map(item => {
      if (!keys(item, ['period', manual ? 'codes' : 'capacity'])) fail()
      const p = period(item.period), id = index(p)
      if (seen.has(id)) fail()
      seen.add(id)
      if (!manual) {
        if (!capacity(item.capacity)) fail()
        return { period: p, capacity: item.capacity }
      }
      if (!Array.isArray(item.codes) || item.codes.length > 1000) fail()
      const codes = item.codes.map(code => {
        if (typeof code !== 'string' || !/^[A-Za-z0-9._-]{1,32}$/.test(code) || codesSeen.has(code)) fail()
        codesSeen.add(code); return code
      }).sort()
      return { period: p, codes }
    }).sort((a, b) => index(a.period) - index(b.period))
  }
  return { startPeriod: period(s.startPeriod), initialCapacity: s.initialCapacity, maxPeriods: s.maxPeriods,
    capacities: normalizeList(s.capacities, false), manualPeriods: normalizeList(s.manualPeriods, true), finalEvents: [] }
}
export const projectionKey = scenario => JSON.stringify(normalizeProjectionScenario(scenario))
export function decodeProjection(data, careerId) {
  if (data?.schemaVersion !== 1) throw new Error('INCOMPATIBLE_PROJECTION_VERSION')
  if (!keys(data, ['schemaVersion', 'careerId', 'revisionToken', 'scenario', 'updatedAt']) || data.careerId !== careerId
    || typeof data.revisionToken !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(data.revisionToken)
    || typeof data.updatedAt?.toMillis !== 'function') fail()
  return { ...data, scenario: normalizeProjectionScenario(data.scenario) }
}
