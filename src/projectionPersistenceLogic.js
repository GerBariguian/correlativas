// Persistence validates decisions, not their current academic eligibility.
const fail = () => { throw new Error('INVALID_PROJECTION_DOCUMENT') }
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === allowed.length && Object.keys(value).every(k => allowed.includes(k))
const period = (p, maximumYear = 9979) => {
  if (!keys(p, ['year', 'term']) || !Number.isInteger(p.year) || p.year < 1 || p.year > maximumYear || !['1C', '2C'].includes(p.term)) fail()
  return { year: p.year, term: p.term }
}
const index = p => p.year * 2 + (p.term === '2C' ? 1 : 0)
const capacity = n => Number.isSafeInteger(n) && n >= 0
export function normalizeProjectionScenario(s) {
  if (!keys(s, ['startPeriod', 'initialCapacity', 'maxPeriods', 'capacities', 'manualPeriods', 'finalEvents'])
    || !capacity(s.initialCapacity) || s.initialCapacity < 1 || !Number.isInteger(s.maxPeriods) || s.maxPeriods < 1 || s.maxPeriods > 40
    || !Array.isArray(s.capacities) || s.capacities.length > 40 || !Array.isArray(s.manualPeriods) || s.manualPeriods.length > 40
    || !Array.isArray(s.finalEvents) || s.finalEvents.length > 1000) fail()
  const finalCodes = new Set()
  const finalEvents = s.finalEvents.map(event => {
    if (!keys(event, ['code', 'period']) || typeof event.code !== 'string'
      || !/^[A-Za-z0-9._-]{1,32}$/.test(event.code) || finalCodes.has(event.code)) fail()
    finalCodes.add(event.code)
    return { code: event.code, period: period(event.period, 9999) }
  }).sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
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
    capacities: normalizeList(s.capacities, false), manualPeriods: normalizeList(s.manualPeriods, true), finalEvents }
}
export const projectionKey = scenario => JSON.stringify(normalizeProjectionScenario(scenario))
export function encodeProjectionScenario(scenario) {
  const normalized = normalizeProjectionScenario(scenario)
  return { ...normalized, finalEvents: normalized.finalEvents.map(e => `${e.code}@${String(e.period.year).padStart(4, '0')}:${e.period.term}`) }
}
export function decodeProjection(data, careerId) {
  if (![1, 2].includes(data?.schemaVersion)) throw new Error('INCOMPATIBLE_PROJECTION_VERSION')
  if (!keys(data, ['schemaVersion', 'careerId', 'revisionToken', 'scenario', 'updatedAt']) || data.careerId !== careerId
    || typeof data.revisionToken !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(data.revisionToken)
    || typeof data.updatedAt?.toMillis !== 'function') fail()
  if (!Array.isArray(data.scenario?.finalEvents) || data.scenario.finalEvents.length > 1000) fail()
  if (data.schemaVersion === 1 && data.scenario.finalEvents.length) fail()
  const finalEvents = data.scenario.finalEvents.map(value => {
    if (typeof value !== 'string') fail()
    const match = /^([A-Za-z0-9._-]{1,32})@([0-9]{4}):(1C|2C)$/.exec(value)
    if (!match) fail()
    return { code: match[1], period: { year: Number(match[2]), term: match[3] } }
  })
  return { ...data, scenario: normalizeProjectionScenario({ ...data.scenario, finalEvents }) }
}
