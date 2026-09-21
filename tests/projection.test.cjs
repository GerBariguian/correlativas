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

for (const career of require('./projection-catalogs.cjs')()) {
  test(`final planner regression with real catalog: ${career.id}`, () => {
    const data={career,statusMap:career.initialStatus,scenario:{startPeriod:p(2027),initialCapacity:4,maxPeriods:40,finalEvents:[]}}
    const before=JSON.stringify(data), base=project(data)
    const rows=plain(context.getFinalPlanningRows(data,base))
    assert.ok(rows.length>0)
    const row=rows.find(r=>r.plannable && !r.missingApproved.length)
    assert.ok(row, 'at least one projected exam with satisfied prerequisites')
    const option=plain(context.getFinalPeriodOptions(data,row.code)).find(o=>o.eligible)
    assert.ok(option)
    const scenario=plain(context.editPlannedFinal(data,row.code,option.period))
    const result=project({...data,scenario})
    assert.deepEqual(result.errors,[])
    assert.equal(result.eventDiagnostics[0].status,'applied')
    assert.equal(JSON.stringify(data),before)
  })
}

test('blocked final does not stop independent finals or later courses and never retries itself', () => {
  const data = input([s('A'), s('B', { finalPrereqs:['A'] }), s('C'), s('D',{approvedPrereqs:['C']})],
    {A:'Regularizada',B:'Regularizada',C:'Regularizada'}, {finalEvents:[event('B',2027),event('C',2027),event('A',2027,'2C')]})
  const before=JSON.stringify(data), r=project(data)
  assert.deepEqual(r.eventDiagnostics.map(e=>e.status),['blocked','applied','applied'])
  assert.ok(r.periods[1].started.includes('D')); assert.equal(r.statusMap.B,'Regularizada')
  assert.equal(JSON.stringify(data),before)
})
test('real approval makes an event inactive and reversal reevaluates the same preserved intent', () => {
  const data=input([s('A')],{A:'Aprobada'},{finalEvents:[event('A',2027)]})
  assert.equal(project(data).eventDiagnostics[0].status,'obsolete')
  data.statusMap={A:'Regularizada'}
  assert.equal(project(data).eventDiagnostics[0].status,'applied')
  assert.equal(data.statusMap.A,'Regularizada'); assert.equal(data.scenario.finalEvents.length,1)
})
test('removed codes, activities and past events receive individual diagnostics without invalidating other finals', () => {
  const data=input([s('A'),s('B'),s('PPS',{projectionKind:'activity'})],{A:'Regularizada'},
    {finalEvents:[event('GONE',2027),event('PPS',2027),event('B',2026),event('A',2027)]})
  const r=project(data)
  assert.deepEqual(r.errors,[])
  assert.deepEqual(r.eventDiagnostics.map(e=>e.reason),['UNKNOWN_FINAL_CODE','NON_CALENDAR_ACTIVITY','BEFORE_START','APPROVED_AT_PLANNED_CLOSE'])
  assert.equal(r.summary.estimatedAcademicEnd,null)
})
test('annual final options use second close even with start restriction; planning commands reject early exams', () => {
  const data=input([s('AN',{durationPeriods:2,allowedStartTerms:['1C']})],{}, {maxPeriods:4})
  const options=plain(context.getFinalPeriodOptions(data,'AN'))
  assert.deepEqual(options.map(o=>o.eligible),[false,true,true,true])
  assert.equal(context.editPlannedFinal(data,'AN',p(2027)),data.scenario)
  data.scenario=plain(context.editPlannedFinal(data,'AN',p(2027,'2C')))
  const result=project(data)
  assert.equal(result.eventDiagnostics[0].status,'applied')
  assert.equal(plain(context.getFinalPlanningRows(data,result))[0].origin,'future')
  assert.equal(plain(context.getFinalPlanningRows(data,result))[0].event.code,'AN')
})
test('course movement and capacity changes preserve but invalidate a previously eligible exam', () => {
  const data=input([s('A')],{}, {finalEvents:[event('A',2027)]})
  assert.equal(project(data).eventDiagnostics[0].status,'applied')
  data.scenario.manualPeriods=[{period:p(2027),codes:[]},{period:p(2028),codes:['A']}]
  const moved=project(data)
  assert.equal(moved.eventDiagnostics[0].reason,'NOT_REGULARIZED')
  assert.equal(moved.statusMap.A,'Regularizada')
  delete data.scenario.manualPeriods; data.scenario.capacities=[{period:p(2027),capacity:0}]
  assert.equal(project(data).eventDiagnostics[0].reason,'NOT_REGULARIZED')
})
test('many independent finals share a close without consuming capacity or depending on array order', () => {
  const subjects=Array.from({length:20},(_,i)=>s(`S${i}`))
  const status=Object.fromEntries(subjects.map(s=>[s.code,'Regularizada']))
  const finals=subjects.map(s=>event(s.code,2027))
  for(const events of [finals,[...finals].reverse()]) {
    const r=project(input(subjects,status,{initialCapacity:0,finalEvents:events}))
    assert.equal(r.periods[0].approvedFinals.length,20); assert.equal(r.periods[0].started.length,0)
  }
})
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
    assert.equal(result.outcome, 'finals-pending'); assert.equal(result.statusMap.B, 'Regularizada')
    assert.deepEqual(result.eventDiagnostics.find(e => e.code === 'B').missingApproved, ['A'])
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
  assert.equal(blocked.outcome, 'finals-pending')
  assert.deepEqual(blocked.eventDiagnostics[0].missingApproved, ['A'])
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
  assert.equal(project(input(subjects, { A: 'Regularizada' }, { finalEvents: [event('B', 2030)] })).eventDiagnostics[0].status, 'blocked')
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
  const data = input([s('3.4.100', { year: 5, term: '1C', hours: 300, durationPeriods: 2, allowedStartTerms: ['1C'] }), ...other], map,
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
test('explicit annual metadata applies independently of career IDs or subject names', () => {
  for (const patch of [{ id: 'other' }, { plan: 'other' }]) {
    const data = annual(); Object.assign(data.career, patch)
    assert.equal(project(data).periods.length, 2)
  }
  assert.equal(context.getProjectionDuration({ id: 'other' }, s('OTHER', { term: 'Anual' })), 2)
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
    status: 'blocked', reason: 'FINAL_REQUIREMENTS', subjectStatus: 'Regularizada', missingApproved: ['A'] }])
  assert.equal(result.statusMap.B, 'Regularizada')
  assert.equal(result.errors.length, 0)
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
  assert.deepEqual(stopped.eventDiagnostics.map(e => e.status), ['blocked', 'applied'])
  assert.equal(stopped.statusMap.B, 'Regularizada')
  const complete = project(input([s('A')], { A: 'Aprobada' }, { finalEvents: [event('A', 2028)] }))
  assert.equal(complete.eventDiagnostics[0].reason, 'ALREADY_APPROVED_REAL')
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

for (const career of require('./projection-catalogs.cjs')()) {
  test(`real registry compatibility: ${career.id}`, () => {
    for (const initialCapacity of [3, 4, 5, 7, 9]) {
      const data = { career, statusMap: career.initialStatus, scenario: { startPeriod: p(2027), initialCapacity } }
      const before = JSON.stringify(data), result = project(data)
      assert.deepEqual(result.errors, [])
      assert.equal(result.outcome, career.university === 'UTN' ? 'blocked' : 'finals-pending')
      assert.equal(result.summary.estimatedAcademicEnd, null)
      assert.equal(JSON.stringify(data), before)
      if (career.university === 'UTN') assert.ok(result.blockers.some(b => b.approved.length > 0))
      for (const entry of result.periods) for (const code of entry.started) {
        const previous = result.periods[result.periods.indexOf(entry) - 1]?.statusMap ?? data.statusMap
        assert.ok(context.canCourse(career.subjects.find(s => s.code === code), previous))
      }
      // Feed a coherent simulated boundary back as real progress, including a
      // full current semester. This exercises progressed, not only empty states.
      const map = { ...result.periods[0].statusMap }
      for (const code of result.periods[1].started) map[code] = 'Cursando'
      const progressed = project({ ...data, statusMap: map })
      assert.deepEqual(progressed.errors, [])
      if (result.periods[1].started.length) assert.equal(progressed.periods[0].readOnly, true)
    }
  })
}

test('UCA diagnostics distinguish synthetic inconsistent progress from valid prerequisites and finals', () => {
  const career = require('./projection-catalogs.cjs')().find(c => c.university === 'UCA')
  const data = { career, statusMap: { ...career.initialStatus, 'UCA-TS-HF2': 'Cursando' }, scenario: { startPeriod: p(2027), initialCapacity: 9 } }
  const invalid = project(data)
  assert.equal(invalid.errors[0].code, 'INCONSISTENT_STATUS')
  assert.deepEqual(invalid.errors[0].regularized, ['UCA-TS-HF1'])
  assert.deepEqual(project(data).errors, invalid.errors)
  data.statusMap['UCA-TS-HF1'] = 'Regularizada'
  const valid = project(data)
  assert.deepEqual(valid.errors, [])
  assert.deepEqual(valid.summary.pendingFinals.find(f => f.code === 'UCA-TS-HF2').missingApproved, ['UCA-TS-HF1'])
  assert.ok(career.subjects.filter(s => s.term === 'Anual').every(s => context.getProjectionDuration(career, s) === 2))
})

test('capacity has no academic ceiling, but requires exact nonnegative integers in the pure engine', () => {
  for (const initialCapacity of [101, 1000, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual(project(input([s('A')], {}, { initialCapacity })).errors, [])
  }
  for (const initialCapacity of [Number.MAX_SAFE_INTEGER + 1, Infinity, 1.5, -1]) {
    assert.equal(project(input([s('A')], {}, { initialCapacity })).outcome, 'invalid')
  }
})

test('generic annual reserves both periods and only unlocks dependents after the second close', () => {
  const data = input([s('A', { durationPeriods: 2 }), s('B', { prereqs: ['A'] }), s('C')], {}, { initialCapacity: 2 })
  const result = project(data)
  assert.deepEqual(result.periods[0].started, ['A', 'C'])
  assert.equal(result.periods[0].statusMap.A, 'Cursando')
  assert.deepEqual(result.periods[1].continuing, ['A'])
  assert.equal(result.periods[1].statusMap.A, 'Regularizada')
  assert.deepEqual(result.periods[2].started, ['B'])
  assert.equal(result.periods.filter(p => p.completedCourses.includes('A')).length, 1)
  assert.equal(context.editProjectionPeriod(data.scenario, result, p(2027, '2C'), 'A', 'remove'), data.scenario)
})

test('several annuals reserve aggregate future capacity instead of overbooking it', () => {
  const result = project(input(['A', 'B', 'C'].map(c => s(c, { term: 'Anual' })), {}, {
    initialCapacity: 3, capacities: [{ period: p(2027, '2C'), capacity: 1 }] }))
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.periods[0].started, ['A'])
  assert.deepEqual(result.periods[1].continuing, ['A'])
  assert.ok(result.periods.every(p => p.started.length + p.continuing.length <= p.capacity))
})

test('reusable allowed terms constrain calendar, not academic eligibility', () => {
  const subject = s('SOC', { allowedStartTerms: ['2C'], year: 99 })
  assert.equal(context.canCourse(subject, {}), true)
  const result = project(input([subject]))
  assert.deepEqual(result.periods[0].started, [])
  assert.deepEqual(result.periods[0].addCandidates, [])
  assert.deepEqual(result.periods[1].started, ['SOC'])
  for (const extra of [{ durationPeriods: 0 }, { allowedStartTerms: [] }, { durationPeriods: 2, allowedStartTerms: ['2C'] }, { durationPeriods: 2, allowedStartTerms: '1C' }]) {
    assert.equal(project(input([s('X', extra)])).outcome, 'invalid')
  }
})

test('non-calendar activities remain in academic tracking without fictional courses or approvals', () => {
  const subjects = [s('A'), s('PPS', { projectionKind: 'activity', prereqs: ['A'], finalPrereqs: [] })]
  const result = project(input(subjects))
  assert.deepEqual(result.periods.flatMap(p => p.started), ['A'])
  assert.equal(result.summary.coursesComplete, true)
  assert.equal(result.summary.academicComplete, false)
  assert.equal(result.summary.pendingActivities[0].eligible, true)
  assert.equal(result.summary.estimatedAcademicEnd, null)
  const inProgress = project(input(subjects, { A: 'Aprobada', PPS: 'Cursando' }))
  assert.equal(inProgress.statusMap.PPS, 'Cursando')
  assert.deepEqual(inProgress.periods[0].continuing, [])
})

const systems = require('./projection-catalogs.cjs')().find(c => c.id === 'utn-sistemas-2023')
const sysCode = n => `UTN-ISI23-${String(n).padStart(2, '0')}`
const sysSubject = n => systems.subjects.find(s => s.code === sysCode(n))
const sysInput = (statusMap = {}, extra = {}) => ({ career: systems, statusMap,
  scenario: { startPeriod: p(2027), initialCapacity: 4, ...extra } })

test('UTN Sistemas registry has exactly 36 numbered subjects, seven slots and a 200-clock-hour activity', () => {
  assert.equal(systems.university, 'UTN'); assert.equal(systems.plan, '2023'); assert.equal(systems.ordinance, '1877')
  assert.match(systems.faculty, /Buenos Aires/)
  assert.equal(systems.subjects.length, 44)
  assert.equal(new Set(systems.subjects.map(s => s.code)).size, 44)
  assert.deepEqual(systems.subjects.filter(s => s.catalogNumber).map(s => s.catalogNumber).sort((a,b) => a-b), Array.from({ length: 36 }, (_, i) => i + 1))
  const elective = systems.subjects.filter(s => s.elective)
  assert.deepEqual(elective.map(s => s.year), [3, 4, 4, 5, 5, 5, 5])
  assert.ok(elective.every(s => s.hours === 6 && s.durationPeriods === 1 && !s.prereqs.length && !s.approvedPrereqs.length))
  assert.equal(systems.subjects.find(s => s.projectionKind === 'activity').hours, 200)
  assert.ok(Object.values(systems.initialStatus).every(s => s === 'Pendiente'))
})

test('UTN Sistemas grid determines annual modalities and local levels rather than PDF levels', () => {
  const annual = systems.subjects.filter(s => s.durationPeriods === 2).map(s => s.catalogNumber).sort((a,b) => a-b)
  assert.deepEqual(annual, [1,2,3,4,5,6,7,8,9,10,12,13,14,16,23,30,36])
  assert.ok(systems.subjects.filter(s => s.durationPeriods === 2).every(s => s.allowedStartTerms.join() === '1C'))
  assert.deepEqual([4,11,12,17,22,26,32].map(n => sysSubject(n).year), [2,1,3,2,4,3,4])
  assert.deepEqual([1,8,15,36].map(n => sysSubject(n).hours), [5,3,8,6])
})

test('UTN Sistemas all numbered course requirements match the authoritative PDF columns', () => {
  const requirements = [
    [9,[1,2],[]],[10,[1,3],[]],[12,[4],[]],[13,[5,6],[]],[14,[5,6],[]],[15,[7],[]],[16,[6,8],[]],
    [17,[1,2],[]],[18,[],[1,2]],[19,[13,16],[5,6]],[20,[14,16],[5,6]],[21,[],[3,7]],
    [22,[9],[1,2]],[23,[14,16],[4,6,8]],[24,[11],[]],[25,[19,20,23],[13,14]],
    [26,[15,21],[]],[27,[17,22],[]],[28,[17],[9]],[29,[10,22],[9]],[30,[18,23],[16]],
    [31,[28],[17,22]],[32,[28],[17,19]],[33,[18,27],[23]],[34,[24,30],[18]],
    [35,[26,30],[20,21]],[36,[25,26,30],[12,20,23]],
  ]
  for (let n = 1; n <= 36; n++) {
    const [,r,a] = requirements.find(row => row[0] === n) ?? [n,[],[]]
    assert.deepEqual(sysSubject(n).prereqs, r.map(sysCode), `regularized ${n}`)
    assert.deepEqual(sysSubject(n).approvedPrereqs, a.map(sysCode), `approved ${n}`)
    if (n !== 36) assert.deepEqual(sysSubject(n).finalPrereqs, a.map(sysCode), `final ${n}`)
  }
  assert.equal(context.canCourse(sysSubject(19), { [sysCode(13)]: 'Regularizada', [sysCode(16)]: 'Regularizada', [sysCode(5)]: 'Aprobada', [sysCode(6)]: 'Regularizada' }), false)
  assert.equal(context.canCourse(sysSubject(19), { [sysCode(13)]: 'Regularizada', [sysCode(16)]: 'Regularizada', [sysCode(5)]: 'Aprobada', [sysCode(6)]: 'Aprobada' }), true)
})

test('UTN Proyecto Final and PPS share entry requirements without making PPS a final prerequisite', () => {
  const pf = sysSubject(36), pps = systems.subjects.find(s => s.projectionKind === 'activity')
  const map = Object.fromEntries(systems.subjects.filter(s => s.code !== pf.code && s.code !== pps.code).map(s => [s.code, 'Aprobada']))
  for (const n of [25,26,30]) map[sysCode(n)] = 'Regularizada'
  assert.equal(context.canCourse(pf, map), true)
  assert.equal(context.canCourse(pps, map), true)
  assert.equal(context.canTakeFinal(pf, map, systems.subjects), false)
  assert.deepEqual(pps.prereqs, pf.prereqs); assert.deepEqual(pps.approvedPrereqs, pf.approvedPrereqs)
  const result = project(sysInput(map))
  assert.deepEqual(result.errors, [])
  assert.equal(result.periods[0].statusMap[pf.code], 'Cursando')
  assert.equal(result.periods[1].statusMap[pf.code], 'Regularizada')
  assert.equal(result.summary.pendingActivities[0].eligible, true)
  assert.equal(result.summary.estimatedAcademicEnd, null)
  assert.ok(!result.periods.some(p => [...p.started,...p.continuing].includes(pps.code)))
  const all = Object.fromEntries(systems.subjects.filter(s => s.code !== pf.code).map(s => [s.code,'Aprobada']))
  assert.equal(context.canTakeFinal(pf, all, systems.subjects), true)
  assert.equal(pf.finalPrereqs.length, 42)
  assert.ok(!pf.finalPrereqs.includes(pps.code))
  for (const status of ['Pendiente', 'Cursando', 'Regularizada']) {
    all[pps.code] = status
    assert.equal(context.canTakeFinal(pf, all, systems.subjects), true)
  }
  all['UTN-ISI23-E7'] = 'Regularizada'
  assert.equal(context.canTakeFinal(pf, all, systems.subjects), false)
})

test('UTN Sociedad starts only in 2C and annual continuations occupy future capacity', () => {
  const result = project(sysInput({}, { initialCapacity: 9 }))
  assert.deepEqual(result.errors, [])
  const society = result.periods.find(p => p.started.includes(sysCode(11)))
  assert.equal(society.period.term, '2C')
  assert.ok(!result.periods[0].addCandidates.includes(sysCode(11)))
  assert.ok(result.periods[1].continuing.length > 0)
  assert.ok(result.periods.every(p => p.started.length + p.continuing.length <= p.capacity))
  const annual = result.periods[0].started.filter(c => systems.subjects.find(s => s.code === c).durationPeriods === 2)
  assert.ok(annual.every(c => result.periods[0].statusMap[c] === 'Cursando' && result.periods[1].statusMap[c] === 'Regularizada'))
})

test('UTN manual annual removal and re-add preserve a single course and its continuation', () => {
  const data = sysInput(), initial = project(data)
  const code = initial.periods[0].started.find(c => systems.subjects.find(s => s.code === c).durationPeriods === 2)
  assert.ok(code)
  assert.equal(context.editProjectionPeriod(data.scenario, initial, p(2027, '2C'), code, 'remove'), data.scenario)
  data.scenario = plain(context.editProjectionPeriod(data.scenario, initial, p(2027), code, 'remove'))
  const removed = project(data)
  assert.ok(!removed.periods[0].started.includes(code))
  assert.ok(!removed.periods[1].continuing.includes(code))
  data.scenario = plain(context.editProjectionPeriod(data.scenario, removed, p(2027), code, 'add'))
  const restored = project(data)
  assert.ok(restored.periods[0].started.includes(code))
  assert.ok(restored.periods[1].continuing.includes(code))
  assert.equal(restored.periods.filter(p => p.started.includes(code)).length, 1)
  assert.deepEqual(data.statusMap, {})
})
