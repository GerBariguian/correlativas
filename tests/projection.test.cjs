const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const context = vm.createContext({})
for (const file of ['src/logic.js', 'src/projectionLogic.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    .replace(/^import .*$/gm, '').replace(/export /g, ''), context)
}
const plain = value => JSON.parse(JSON.stringify(value))
const project = input => plain(context.projectCareer(input))
const p = (year, term = '1C') => ({ year, term })
const s = (code, extra = {}) => ({ code, name: code, prereqs: [], ...extra })
const input = (subjects, statusMap = {}, extra = {}) => ({ career: { id: 'test', plan: '1', subjects }, statusMap,
  scenario: { startPeriod: p(2027), initialCapacity: 1, ...extra } })
const event = (code, year, term = '1C') => ({ code, period: p(year, term) })
test('period helpers advance and compare across years, reject invalid input', () => {
  assert.deepEqual(plain(context.advancePeriod(p(2027, '2C'))), p(2028))
  assert.equal(context.comparePeriods(p(2027), p(2027, '2C')), -1)
  assert.throws(() => context.advancePeriod(p(2027, '3C')))
})
test('Regularizada enables cursada, not approvedPrereqs or dependent final', () => {
  const data = input([s('A'), s('B', { prereqs: ['A'] }), s('C', { approvedPrereqs: ['A'] })], { A: 'Regularizada' })
  const result = project(data)
  assert.deepEqual(result.periods[0].started, ['B'])
  assert.equal(result.statusMap.B, 'Regularizada')
  assert.equal(result.statusMap.A, 'Regularizada')
  assert.equal(result.outcome, 'blocked')
  assert.deepEqual(result.blockers[0].approved, ['A'])
  assert.deepEqual(result.summary.pendingFinals.find(x => x.code === 'B').missingApproved, ['A'])
  assert.equal(result.summary.estimatedAcademicEnd, null)
})
test('simulated prerequisite cannot enable a course in the same semester', () => {
  const result = project(input([s('A'), s('B', { prereqs: ['A'] })], {}, { initialCapacity: 5 }))
  assert.deepEqual(result.periods.map(x => x.started), [['A'], ['B']])
  assert.equal(result.statusMap.B, 'Regularizada')
})
test('final at close applies approval and only unlocks next period; consumes no slot', () => {
  const result = project(input([s('A'), s('B', { approvedPrereqs: ['A'] }), s('C')], { A: 'Regularizada' },
    { finalEvents: [event('A', 2027)] }))
  assert.deepEqual(result.periods[0].started, ['C'])
  assert.equal(result.periods[0].statusMap.A, 'Aprobada')
  assert.deepEqual(result.periods[1].started, ['B'])
})
test('final can follow its own completed cursada at close, with valid requirements', () => {
  const result = project(input([s('A')], {}, { finalEvents: [event('A', 2027)] }))
  assert.equal(result.statusMap.A, 'Aprobada')
  assert.deepEqual(result.summary.estimatedAcademicEnd, p(2027))
})
test('same-close final chains are rejected independent of event array order', () => {
  for (const finalEvents of [[event('A', 2027), event('B', 2027)], [event('B', 2027), event('A', 2027)]]) {
    const result = project(input([s('A'), s('B', { prereqs: ['A'] })], { A: 'Regularizada', B: 'Regularizada' }, { finalEvents }))
    assert.equal(result.outcome, 'invalid-event'); assert.equal(result.statusMap.B, 'Regularizada')
    assert.deepEqual(result.errors[0].missingApproved, ['A'])
  }
})
test('capacities vary by structured period and zero capacity can wait for a future slot', () => {
  const result = project(input(['A','B','C','D','E','F'].map(c => s(c)), {}, { initialCapacity: 1,
    capacities: [{ period: p(2027), capacity: 0 }, { period: p(2027, '2C'), capacity: 2 }, { period: p(2028), capacity: 3 }] }))
  assert.deepEqual(result.periods.map(x => x.started.length), [0, 2, 3, 1])
})
test('ranking is deterministic, excludes blocked candidates and counts unique descendants', () => {
  const subjects = [s('A'), s('B', { prereqs: ['A'] }), s('C', { approvedPrereqs: ['A'] }),
    s('D', { prereqs: ['B', 'C'] }), s('Z')]
  const graph = plain(context.buildRequirementGraph(subjects))
  assert.deepEqual(graph.metrics.find(m => m.code === 'A').descendants, ['B','C','D'])
  assert.ok(graph.edges.some(e => e.type === 'approved-for-course'))
  assert.ok(graph.edges.some(e => e.type === 'approved-for-final'))
  const ranked = plain(context.rankProjectionCandidates(subjects, {}))
  assert.deepEqual(ranked.map(x => x.code), ['A','Z'])
  assert.deepEqual(ranked[0].directDependents, ['B','C'])
  assert.deepEqual(ranked[0].effectiveUnlocks, ['B'])
  assert.deepEqual(plain(context.rankProjectionCandidates([...subjects].reverse(), {})), ranked)
})
test('multiple prerequisites do not count as effective unlocks until all are met', () => {
  const subjects = [s('A'), s('B'), s('C', { prereqs: ['A','B'] })]
  assert.deepEqual(plain(context.rankProjectionCandidates(subjects, {}))[0].effectiveUnlocks, [])
  assert.deepEqual(plain(context.rankProjectionCandidates(subjects, { B: 'Regularizada' }))[0].effectiveUnlocks, ['C'])
})
test('ALL expands with existing exclusions and own-course requirement remains', () => {
  const subjects = [s('A'), s('P', { finalPrereqs: ['ALL'] }), s('E', { elective: true }), s('X', { excludeFromAllFinals: true })]
  const result = project(input(subjects, { A: 'Aprobada', P: 'Regularizada' }, { initialCapacity: 0, finalEvents: [event('P', 2027)] }))
  assert.equal(result.statusMap.P, 'Aprobada')
  const blocked = project(input(subjects, { A: 'Regularizada', P: 'Regularizada' }, { finalEvents: [event('P', 2027)] }))
  assert.equal(blocked.outcome, 'invalid-event')
  assert.deepEqual(blocked.errors[0].missingApproved, ['A'])
})
test('empty periods reach a relevant future exam instead of premature termination', () => {
  const result = project(input([s('A'), s('B', { approvedPrereqs: ['A'] })], { A: 'Regularizada' },
    { finalEvents: [event('A', 2028)] }))
  assert.deepEqual(result.periods.map(x => x.started), [[], [], [], ['B']])
  assert.deepEqual(result.summary.estimatedCourseEnd, p(2028, '2C'))
})
test('definitive block, invalid final and maximum horizon terminate', () => {
  const subjects = [s('A'), s('B', { approvedPrereqs: ['A'] })]
  assert.equal(project(input(subjects, { A: 'Regularizada' })).periods.length, 1)
  assert.equal(project(input(subjects, { A: 'Regularizada' }, { finalEvents: [event('B', 2030)] })).outcome, 'invalid-event')
  const result = project(input(subjects, { A: 'Regularizada' }, { maxPeriods: 2, finalEvents: [event('A', 2029)] }))
  assert.equal(result.outcome, 'horizon'); assert.equal(result.periods.length, 2)
})
test('already completed career has no invented dates or periods', () => {
  const result = project(input([s('A')], { A: 'Aprobada' }))
  assert.equal(result.outcome, 'complete'); assert.deepEqual(result.periods, [])
  assert.equal(result.summary.academicComplete, true); assert.equal(result.summary.estimatedAcademicEnd, null)
})
test('unknown states, codes and inconsistent progress return invalid without correction', () => {
  for (const map of [{ A: 'Invalid' }, { FOREIGN: 'Aprobada' }, { B: 'Regularizada' }]) {
    const data = input([s('A'), s('B', { prereqs: ['A'] })], map)
    const before = JSON.stringify(data), result = project(data)
    assert.equal(result.outcome, 'invalid'); assert.deepEqual(result.statusMap, map)
    assert.equal(JSON.stringify(data), before)
  }
})
test('catalog validation rejects unknown references, duplicate codes, cycles and empty catalogs', () => {
  for (const subjects of [[], [s('A'), s('A')], [s('A', { prereqs: ['X'] })],
    [s('A', { prereqs: ['B'] }), s('B', { prereqs: ['A'] })],
    [s('A', { finalPrereqs: ['B'] }), s('B', { finalPrereqs: ['A'] })]]) {
    assert.equal(project(input(subjects)).outcome, 'invalid')
  }
})
test('Cursando completes initial period, consumes capacity and never auto-approves', () => {
  const result = project(input([s('A'), s('B')], { A: 'Cursando' }))
  assert.deepEqual(result.periods[0].continuing, ['A']); assert.deepEqual(result.periods[0].started, [])
  assert.equal(result.periods[0].statusMap.A, 'Regularizada')
  assert.deepEqual(result.periods[1].started, ['B'])
  assert.equal(project(input([s('A')], { A: 'Cursando' }, { initialCapacity: 0 })).outcome, 'finals-pending')
})
function annual(extra = {}, map = {}, other = []) {
  const data = input([s('3.4.100', { year: 5, term: '1C', hours: 300 }), ...other], map,
    { startPeriod: p(2028), ...extra })
  data.career.id = 'uade-informatica'; data.career.plan = '1621'
  return data
}
test('UADE final project is one subject occupying both semesters and ends at 2C', () => {
  const data = annual({}, {}, [s('Z')]), before = JSON.stringify(data), result = project(data)
  assert.deepEqual(result.periods.map(x => x.started), [['3.4.100'], [], ['Z']])
  assert.deepEqual(result.periods[1].continuing, ['3.4.100'])
  assert.equal(result.periods[0].statusMap['3.4.100'], 'Cursando')
  assert.equal(result.periods[1].statusMap['3.4.100'], 'Regularizada')
  assert.equal(JSON.stringify(data), before)
  assert.deepEqual(project(annual()).summary.estimatedCourseEnd, p(2028, '2C'))
  const limited = project(annual({ maxPeriods: 1 }))
  assert.equal(limited.summary.coursesComplete, false); assert.equal(limited.summary.estimatedCourseEnd, null)
})
test('annual waits only for 1C, without a career-start or fifth-year requirement', () => {
  const result = project(annual({ startPeriod: p(2027, '2C') }))
  assert.deepEqual(result.periods[0].started, [])
  assert.deepEqual(result.periods[1].period, p(2028))
  assert.deepEqual(result.periods[1].started, ['3.4.100'])
  assert.deepEqual(project(annual({ startPeriod: p(2024) })).periods[0].started, ['3.4.100'])
})
test('annual cannot start when continuation has zero capacity', () => {
  const result = project(annual({ capacities: [{ period: p(2028, '2C'), capacity: 0 }] }))
  assert.deepEqual(result.periods[0].started, [])
  assert.deepEqual(result.periods.find(x => x.started.length).period, p(2029))
})
test('annual exception never affects another career, plan or subject', () => {
  for (const patch of [{ id: 'other' }, { plan: 'other' }]) {
    const data = annual(); Object.assign(data.career, patch)
    assert.equal(project(data).periods.length, 1)
  }
  assert.equal(context.getProjectionDuration({ id: 'uade-informatica', plan: '1621' }, s('OTHER', { hours: 300, term: 'Anual' })), 1)
})
test('already Cursando annual follows the explicit first-close assumption', () => {
  const result = project(annual({}, { '3.4.100': 'Cursando' }))
  assert.equal(result.periods.length, 1); assert.equal(result.statusMap['3.4.100'], 'Regularizada')
})
test('unplanned finals leave academic date unknown even after all courses finish', () => {
  const result = project(input([s('A')]))
  assert.equal(result.outcome, 'finals-pending'); assert.equal(result.summary.coursesComplete, true)
  assert.equal(result.summary.academicComplete, false); assert.equal(result.summary.estimatedAcademicEnd, null)
})
test('deeply frozen inputs and existing functions are not mutated', () => {
  function freeze(x) { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x) } return x }
  const data = freeze(input([s('A'), s('B', { prereqs: ['A'] })], {}, { finalEvents: [event('A', 2027)] }))
  assert.equal(project(data).statusMap.A, 'Aprobada')
  assert.deepEqual(data.statusMap, {})
})
test('real UADE catalog projects without inventing prerequisites or modifying data', () => {
  const catalog = vm.createContext({})
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/data/uade/informatica.js'), 'utf8').replace(/export const /g, 'var '), catalog)
  const data = annual({ startPeriod: p(2024), initialCapacity: 5 })
  data.career.subjects = plain(catalog.subjects)
  data.statusMap = plain(catalog.initialStatus)
  const before = JSON.stringify(data), result = project(data)
  assert.notEqual(result.outcome, 'invalid')
  assert.equal(result.summary.coursesComplete, true)
  assert.equal(result.summary.estimatedAcademicEnd, null)
  const start = result.periods.find(x => x.started.includes('3.4.100'))
  assert.equal(start.period.term, '1C'); assert.ok(start.period.year >= 2024)
  assert.equal(result.periods.filter(x => x.started.includes('3.4.100')).length, 1)
  assert.equal(JSON.stringify(data), before)
})
test('invalid capacities and malformed scenarios fail before simulation', () => {
  for (const extra of [{ initialCapacity: -1 }, { initialCapacity: 1.5 }, { maxPeriods: 0 },
    { finalEvents: {} }, { capacities: [{ period: p(2027), capacity: 1 }, { period: p(2027), capacity: 2 }] }]) {
    assert.equal(project(input([s('A')], {}, extra)).outcome, 'invalid')
  }
})

test('year metadata and obsolete career-start input never gate project eligibility', () => {
  const data = annual({ startPeriod: p(2024), careerStartPeriod: p(2099) })
  data.career.subjects[0].year = 99
  const result = project(data)
  assert.deepEqual(result.periods[0].started, ['3.4.100'])
  assert.deepEqual(result.summary.estimatedCourseEnd, p(2024, '2C'))
  assert.deepEqual(data.career.subjects[0].prereqs, [])
})

test('future blocked event is evaluated at its requested close with missing approvals', () => {
  const result = project(input([s('A'), s('B', { prereqs: ['A'] })], { A: 'Regularizada', B: 'Regularizada' },
    { finalEvents: [event('B', 2027, '2C')] }))
  assert.equal(result.periods.length, 2)
  assert.deepEqual(result.eventDiagnostics, [{ eventIndex: 0, code: 'B', period: p(2027, '2C'),
    status: 'blocked', reason: 'FINAL_NOT_AVAILABLE', subjectStatus: 'Regularizada', missingApproved: ['A'] }])
  assert.equal(result.statusMap.B, 'Regularizada')
  assert.equal(result.errors.length, 1)
})

test('every event is diagnosed, including applied, horizon, invalid input and early stop', () => {
  const applied = project(input([s('A')], {}, { finalEvents: [event('A', 2027)] }))
  assert.equal(applied.eventDiagnostics[0].status, 'applied')
  const outside = project(input([s('A')], {}, { maxPeriods: 1, finalEvents: [event('A', 2028)] }))
  assert.equal(outside.eventDiagnostics[0].status, 'not-reached')
  assert.equal(outside.eventDiagnostics[0].reason, 'OUTSIDE_HORIZON')
  const invalid = project(input([s('A')], {}, { finalEvents: [null, event('UNKNOWN', 2027)] }))
  assert.deepEqual(invalid.eventDiagnostics.map(e => e.status), ['invalid', 'invalid'])
  const stopped = project(input([s('A'), s('B', { prereqs: ['A'] })], { A: 'Regularizada', B: 'Regularizada' },
    { finalEvents: [event('B', 2027), event('A', 2028)] }))
  assert.deepEqual(stopped.eventDiagnostics.map(e => e.status), ['blocked', 'not-reached'])
  assert.equal(stopped.eventDiagnostics[1].reason, 'STOPPED_INVALID_EVENT')
  const complete = project(input([s('A')], { A: 'Aprobada' }, { finalEvents: [event('A', 2028)] }))
  assert.equal(complete.eventDiagnostics[0].reason, 'STOPPED_COMPLETE')
  const conflict = project(input([s('A')], { A: 'Cursando' }, { initialCapacity: 0, finalEvents: [event('A', 2027)] }))
  assert.equal(conflict.eventDiagnostics[0].status, 'applied')
})

test('capacity and horizon keep eligible pending separate from academic blockers', () => {
  const result = project(input([s('A'), s('B'), s('C', { approvedPrereqs: ['A'] })], {}, { maxPeriods: 1 }))
  assert.deepEqual(result.blockers.map(s => s.code), ['C'])
  assert.deepEqual(result.blockers[0].approved, ['A'])
  assert.deepEqual(result.eligiblePending.map(s => s.code), ['B'])
  assert.deepEqual(result.periods[0].eligibleNotSelected, [{ code: 'B', reason: 'CAPACITY_AFTER_RANKING' }])
  assert.deepEqual(result.periods[0].blockers.map(s => s.code), ['C'])
})

test('period academic diagnostics use start state while final diagnostics use final state', () => {
  const result = project(input([s('A'), s('B', { approvedPrereqs: ['A'] })], { A: 'Regularizada' },
    { maxPeriods: 1, finalEvents: [event('A', 2027)] }))
  assert.deepEqual(result.periods[0].blockers[0].approved, ['A'])
  assert.deepEqual(result.blockers, [])
  assert.deepEqual(result.eligiblePending.map(s => s.code), ['B'])
})

test('annual temporal exclusions and unfinished continuations are not academic blocks', () => {
  const wait = project(annual({ startPeriod: p(2028, '2C'), maxPeriods: 1 }))
  assert.deepEqual(wait.blockers, [])
  assert.equal(wait.periods[0].eligibleNotSelected[0].reason, 'START_TERM')
  const capacity = project(annual({ maxPeriods: 1, capacities: [{ period: p(2028, '2C'), capacity: 0 }] }))
  assert.equal(capacity.periods[0].eligibleNotSelected[0].reason, 'CONTINUATION_CAPACITY')
  const active = project(annual({ maxPeriods: 1 }))
  assert.deepEqual(active.continuations, [{ code: '3.4.100', expectedCompletion: p(2028, '2C') }])
  assert.deepEqual(active.eligiblePending, [])
})

test('ranking preserves effective unlocks before indirect reach before direct dependents', () => {
  const rank = subjects => plain(context.rankProjectionCandidates(subjects, {})).map(c => c.code)
  // E wins even against greater I/D and an earlier curricular year.
  assert.equal(rank([s('Z', { year: 5 }), s('A', { year: 1 }), s('X', { prereqs: ['Z'] }),
    s('Y', { approvedPrereqs: ['A'] }), s('W', { approvedPrereqs: ['A'] })])[0], 'Z')
  // Equal E=0: I wins against D and metadata.
  assert.equal(rank([s('Z', { year: 5 }), s('A', { year: 1 }), s('X', { approvedPrereqs: ['Z'] }),
    s('Y', { approvedPrereqs: ['X'] }), s('W', { approvedPrereqs: ['Y'] }),
    s('B', { approvedPrereqs: ['A'] }), s('C', { approvedPrereqs: ['A'] })])[0], 'Z')
  // Equal E=0/I=2: D wins.
  assert.equal(rank([s('Z', { year: 5 }), s('A', { year: 1 }), s('X', { approvedPrereqs: ['Z'] }),
    s('Y', { approvedPrereqs: ['Z'] }), s('B', { approvedPrereqs: ['A'] }),
    s('C', { approvedPrereqs: ['B'] })])[0], 'Z')
})

test('tied ranking uses comparable curricular year, semester, then deterministic code', () => {
  const subjects = [s('A', { year: 5, term: '1C' }), s('Z', { year: 1, term: '2C' }),
    s('Y', { year: 1, term: '1C' }), s('X', { year: 1, term: '1C' })]
  const rank = list => plain(context.rankProjectionCandidates(list, {})).map(c => c.code)
  assert.deepEqual(rank(subjects), ['X', 'Y', 'Z', 'A'])
  assert.deepEqual(rank([...subjects].reverse()), rank(subjects))
  assert.deepEqual(rank([s('Z', { year: 1 }), s('A', { year: 2 }), s('M')]), ['A', 'M', 'Z'])
  assert.deepEqual(rank([s('Z', { year: 1, term: '1C' }), s('A', { year: 1, term: 'Anual' })]), ['A', 'Z'])
})

test('curricular metadata never gates eligibility or bypasses academic prerequisites', () => {
  const result = project(input([s('Z', { year: 99, term: '2C' }), s('A', { year: 1, prereqs: ['Z'] })]))
  assert.deepEqual(result.periods.map(p => p.started), [['Z'], ['A']])
  const pf = project(annual({ maxPeriods: 1, initialCapacity: 2 }, {}, [s('Z', { year: 1, term: '1C' })]))
  assert.deepEqual(pf.periods[0].started, ['Z', '3.4.100'])
  assert.deepEqual(pf.blockers, [])
})

test('manual removal keeps the period lighter and later auto scheduling recalculates', () => {
  const data = input([s('A'), s('B'), s('C')], {}, { initialCapacity: 2 })
  const before = JSON.stringify(data), initial = project(data)
  data.scenario = plain(context.editProjectionPeriod(data.scenario, initial, p(2027), 'A', 'remove'))
  const result = project(data)
  assert.deepEqual(result.periods[0].started, ['B'])
  assert.deepEqual(result.periods[1].started, ['A', 'C'])
  assert.deepEqual(data.statusMap, {})
  assert.equal(JSON.parse(before).scenario.manualPeriods, undefined)
})

test('manual add has priority, preserves choices and never offers same-period prerequisites', () => {
  const data = input([s('A'), s('B', { prereqs: ['A'] }), s('Z')])
  const initial = project(data)
  assert.deepEqual(initial.periods[0].addCandidates, ['Z'])
  assert.equal(context.editProjectionPeriod(data.scenario, initial, p(2027), 'B', 'add'), data.scenario)
  data.scenario = plain(context.editProjectionPeriod(data.scenario, initial, p(2027), 'Z', 'add'))
  const result = project(data)
  assert.deepEqual(result.periods[0].started, ['A', 'Z'])
  assert.deepEqual(result.periods[1].started, ['B'])
  assert.ok(result.placementDiagnostics.every(d => d.status === 'applied'))
})

test('future manual reservation cannot be taken by automatic ranking and invalid choices are explicit', () => {
  const data = input([s('A'), s('B', { prereqs: ['A'] }), s('Z')], {}, { initialCapacity: 2,
    manualPeriods: [{ period: p(2027), codes: ['Z'] }, { period: p(2027, '2C'), codes: ['B'] }] })
  const result = project(data)
  assert.deepEqual(result.periods[0].started, ['Z'])
  assert.deepEqual(result.periods[1].started, [])
  const diagnostic = result.placementDiagnostics.find(d => d.code === 'B')
  assert.equal(diagnostic.status, 'blocked'); assert.deepEqual(diagnostic.regularized, ['A'])
  assert.ok(!result.periods.some(p => p.started.includes('B')))
  const reserved = project(input([s('A'), s('Z')], {}, { manualPeriods: [{ period: p(2028), codes: ['A'] }] }))
  assert.deepEqual(reserved.periods.find(p => p.started.includes('A')).period, p(2028))
})

test('manual finals requirements remain independent and annual placement obeys temporal rules', () => {
  const blocked = project(input([s('A'), s('B', { approvedPrereqs: ['A'] })], { A: 'Regularizada' },
    { manualPeriods: [{ period: p(2027), codes: ['B'] }] }))
  assert.deepEqual(blocked.placementDiagnostics[0].approved, ['A'])
  const annualData = annual({ manualPeriods: [{ period: p(2028), codes: ['3.4.100'] }, { period: p(2028, '2C'), codes: [] }] })
  const result = project(annualData)
  assert.deepEqual(result.periods.map(p => p.started.length + p.continuing.length), [1, 1])
  assert.equal(result.statusMap['3.4.100'], 'Regularizada')
  assert.equal(project(annual({ manualPeriods: [{ period: p(2028, '2C'), codes: ['3.4.100'] }] })).placementDiagnostics[0].reason, 'START_TERM')
})

test('manual input validation, outside horizon and immutable edit commands', () => {
  for (const manualPeriods of [{}, [{ period: p(2027), codes: ['X'] }],
    [{ period: p(2027), codes: ['A'] }, { period: p(2028), codes: ['A'] }]]) {
    assert.equal(project(input([s('A')], {}, { manualPeriods })).outcome, 'invalid')
  }
  const data = input([s('A')], {}, { maxPeriods: 1, manualPeriods: [{ period: p(2028), codes: ['A'] }] })
  assert.equal(project(data).placementDiagnostics[0].reason, 'OUTSIDE_HORIZON')
  const normal = input([s('A'), s('B')]), result = project(normal)
  const before = JSON.stringify({ normal, result })
  context.editProjectionPeriod(normal.scenario, result, p(2027), 'B', 'add')
  assert.equal(JSON.stringify({ normal, result }), before)
})

test('removing annual start removes its continuation and defers the same academic subject', () => {
  const data = annual(), initial = project(data)
  data.scenario = plain(context.editProjectionPeriod(data.scenario, initial, p(2028), '3.4.100', 'remove'))
  const result = project(data)
  assert.deepEqual(result.periods[0].started, [])
  assert.deepEqual(result.periods[1].continuing, [])
  assert.deepEqual(result.periods.find(p => p.started.includes('3.4.100')).period, p(2029))
  assert.equal(result.periods.filter(p => p.completedCourses.includes('3.4.100')).length, 1)
})

test('moving a reserved subject explicitly retains other valid manual choices', () => {
  const data = input([s('A'), s('B'), s('C')], {}, { manualPeriods: [{ period: p(2027, '2C'), codes: ['B', 'C'] }] })
  const initial = project(data)
  data.scenario = plain(context.editProjectionPeriod(data.scenario, initial, p(2027), 'B', 'add'))
  const result = project(data)
  assert.deepEqual(result.periods[0].started, ['A', 'B'])
  assert.deepEqual(result.periods[1].started, ['C'])
  assert.ok(result.placementDiagnostics.every(d => d.status === 'applied'))
})

test('five current courses are read-only regardless of initial load and future periods use that load', () => {
  for (const initialCapacity of [3, 4, 8]) {
    const subjects = Array.from({ length: 17 }, (_, n) => s(String(n).padStart(2, '0')))
    const statusMap = Object.fromEntries(subjects.slice(0, 5).map(s => [s.code, 'Cursando']))
    const data = input(subjects, statusMap, { initialCapacity, capacities: [{ period: p(2027), capacity: 0 }] })
    const before = JSON.stringify(data), result = project(data), current = result.periods[0]
    assert.deepEqual(result.errors, [])
    assert.equal(current.readOnly, true); assert.equal(current.capacity, 5)
    assert.deepEqual(current.continuing, ['00', '01', '02', '03', '04'])
    assert.deepEqual(current.started, []); assert.deepEqual(current.addCandidates, [])
    assert.ok(current.continuing.every(c => current.statusMap[c] === 'Regularizada'))
    assert.equal(result.periods[1].started.length, initialCapacity)
    assert.equal(result.periods[1].readOnly, false)
    assert.equal(context.editProjectionPeriod(data.scenario, result, p(2027), '05', 'add'), data.scenario)
    assert.equal(context.editProjectionPeriod(data.scenario, result, p(2027), '00', 'remove'), data.scenario)
    assert.equal(JSON.stringify(data), before)
    assert.equal(project({ ...data, scenario: { ...data.scenario, manualPeriods: [{ period: p(2027), codes: ['05'] }] } }).outcome, 'invalid')
  }
})

test('five is a proposal, manual load can be three or six and future moved course occurs once', () => {
  const data = input(['A','B','C','D','E','F','G'].map(c => s(c)), {}, { initialCapacity: 5 })
  let result = project(data)
  assert.equal(result.periods[0].readOnly, false)
  for (const code of ['A', 'B']) {
    data.scenario = plain(context.editProjectionPeriod(data.scenario, result, p(2027), code, 'remove'))
    result = project(data)
  }
  assert.equal(result.periods[0].started.length, 3)
  for (const code of ['A', 'B', 'F']) {
    data.scenario = plain(context.editProjectionPeriod(data.scenario, result, p(2027), code, 'add'))
    result = project(data)
  }
  assert.equal(result.periods[0].started.length, 6)
  assert.equal(result.periods.filter(p => p.started.includes('F')).length, 1)
  assert.ok(result.placementDiagnostics.every(d => d.status === 'applied'))
})
