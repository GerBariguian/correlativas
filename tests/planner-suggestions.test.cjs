const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const context = vm.createContext({})
for (const file of ['logic.js', 'plannerLogic.js', 'plannerSuggestions.js']) {
  // Separate module scopes, with only exported functions shared.
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')
  const names = [...source.matchAll(/export (?:function|const) (\w+)/g)].map(m => m[1])
  vm.runInContext(`(() => { ${source.replace(/^import .*\r?\n/gm, '').replace(/export /g, '')}\nObject.assign(globalThis, {${names.join(',')}}) })()`, context)
}
const plain = value => JSON.parse(JSON.stringify(value))
const s = (code, extra = {}) => ({ code, prereqs: [], durationPeriods: 1, year: 1, ...extra })
const input = (subjects, extra = {}) => ({ subjects, statusMap: {}, selectedCodes: [], targetPeriod: { year: 2027, term: '1C' }, desiredCount: 1, ...extra })
const suggest = args => plain(context.suggestPlannerSelection(args))
const compare = args => plain(context.comparePlannerSelections(args))
const large = () => Array.from({ length: 25 }, (_, i) => s(`A${String(i).padStart(2, '0')}`))

test('N=1 ranks a full combination by effective close unlocks', () => {
  const result = suggest(input([s('A'), s('B'), s('C', { prereqs: ['B'] })]))
  assert.deepEqual(result.suggestedCodes, ['B'])
  assert.deepEqual(result.impact.criteria, [1, 0, 0, 1])
})
test('N=2 finds A+B synergy with no individual unlock', () => {
  const result = suggest(input([s('A'), s('B'), s('D'), s('C', { prereqs: ['A', 'B'] })], { desiredCount: 2 }))
  assert.deepEqual(result.suggestedCodes, ['A', 'B'])
  assert.equal(result.evaluation.close.newEligibility[0].synergy, true)
})
test('request greater than candidates returns available codes without filling', () => {
  const result = suggest(input([s('A'), s('B', { prereqs: ['A'] })], { desiredCount: 10 }))
  assert.equal(result.requestedCount, 10)
  assert.equal(result.effectiveCount, 1)
  assert.deepEqual(result.diagnostics, ['FEWER_CANDIDATES_THAN_REQUESTED'])
})
for (const desiredCount of [0, -1, 1.5, '2', null, Infinity, NaN]) test(`invalid N: ${String(desiredCount)}`, () => {
  const result = suggest(input([s('A')], { desiredCount }))
  assert.deepEqual(result.diagnostics, ['INVALID_DESIRED_COUNT'])
  assert.equal(result.evaluatedCount, 0)
})
test('no candidates is explicit', () => {
  assert.deepEqual(suggest(input([s('A')], { statusMap: { A: 'Aprobada' } })).diagnostics, ['NO_CANDIDATES'])
})
test('activity and incompatible start excluded, unknown start included with warning', () => {
  const result = suggest(input([s('A', { projectionKind: 'activity' }), s('B', { allowedStartTerms: ['2C'] }), s('C')], { desiredCount: 3 }))
  assert.deepEqual(result.suggestedCodes, ['C'])
  assert.deepEqual(result.warnings[0].warnings, ['START_UNKNOWN'])
})
test('approval requirements are not satisfied by regularization', () => {
  const result = suggest(input([s('A'), s('B', { approvedPrereqs: ['A'] })]))
  assert.equal(result.candidateCount, 1)
  assert.equal(result.impact.criteria[0], 0)
})
test('close unlocks beat larger annual effects', () => {
  const result = suggest(input([s('A', { durationPeriods: 2 }), s('B'), s('C', { prereqs: ['A'] }), s('D', { prereqs: ['A'] }), s('E', { prereqs: ['B'] })]))
  assert.deepEqual(result.suggestedCodes, ['B'])
})
test('annual additional eligibility breaks a close tie', () => {
  const result = suggest(input([s('A'), s('B', { durationPeriods: 2 }), s('C', { prereqs: ['B'] })]))
  assert.deepEqual(result.suggestedCodes, ['B'])
  assert.equal(result.impact.criteria[1], 1)
})
test('partial progress breaks tie before direct dependencies', () => {
  const result = suggest(input([s('A'), s('B'), s('D'), s('C', { prereqs: ['B'], approvedPrereqs: ['D'] }), s('E', { approvedPrereqs: ['A'] }), s('F', { approvedPrereqs: ['A'] })]))
  assert.deepEqual(result.suggestedCodes, ['B'])
  assert.deepEqual(result.impact.partialPairs, [{ code: 'C', type: 'regularized', requirement: 'B' }])
})
test('partial pairs exclude targets enabled later by annual completion', () => {
  const result = suggest(input([s('A'), s('B', { durationPeriods: 2 }), s('C', { prereqs: ['A', 'B'] })], { desiredCount: 2 }))
  assert.equal(result.impact.criteria[1], 1)
  assert.equal(result.impact.criteria[2], 0)
})
test('partial pairs deduplicate across delta phases and retain types', () => {
  const result = suggest(input([s('A'), s('B', { durationPeriods: 2 }), s('D'), s('C', { prereqs: ['A', 'A', 'B'], approvedPrereqs: ['D'] })], { desiredCount: 2 }))
  assert.deepEqual(result.suggestedCodes, ['A', 'B'])
  assert.equal(result.impact.partialPairs.length, 2)
})
test('direct pending dependents are unique and exclude selected and completed', () => {
  const result = suggest(input([s('A'), s('B'), s('C', { approvedPrereqs: ['A', 'B'] }), s('D', { approvedPrereqs: ['B'] })], { desiredCount: 2, statusMap: { D: 'Aprobada' } }))
  assert.deepEqual(result.impact.directPendingCodes, ['C'])
})
test('direct count breaks academic ties', () => {
  assert.deepEqual(suggest(input([s('A'), s('B'), s('C', { approvedPrereqs: ['B'] })])).suggestedCodes, ['B'])
})
test('current selection wins academic tie before year and code', () => {
  const result = suggest(input([s('A'), s('Z', { year: 5 })], { selectedCodes: ['Z'] }))
  assert.deepEqual(result.suggestedCodes, ['Z'])
  assert.equal(result.hasAcademicImprovement, false)
  assert.equal(result.currentSelectionEvaluated, true)
})
test('academic improvement takes precedence over preserving selection', () => {
  const result = suggest(input([s('A'), s('B'), s('C', { prereqs: ['B'] })], { selectedCodes: ['A'] }))
  assert.deepEqual(result.suggestedCodes, ['B'])
  assert.equal(result.hasAcademicImprovement, true)
})
test('year only breaks ties when all candidate years are comparable', () => {
  assert.deepEqual(suggest(input([s('A', { year: 5 }), s('Z', { year: 1 })])).suggestedCodes, ['Z'])
  assert.deepEqual(suggest(input([s('A', { year: '5' }), s('Z', { year: 1 })])).suggestedCodes, ['A'])
})
test('code tie and subject permutations deterministic; hours ignored', () => {
  const subjects = [s('Z', { hours: 1 }), s('A', { hours: 100000 })]
  const result = suggest(input(subjects))
  assert.deepEqual(result.suggestedCodes, ['A'])
  assert.deepEqual(result, suggest(input([...subjects].reverse())))
  assert.deepEqual(result.suggestedCodes, suggest(input(subjects.map(s => ({ ...s, hours: 0 })))).suggestedCodes)
})
test('unknown start is not penalized compared with explicit compatibility', () => {
  assert.deepEqual(suggest(input([s('A'), s('Z', { allowedStartTerms: ['1C'] })])).suggestedCodes, ['A'])
})
test('exhaustive evaluates each combination once including current; budget does not truncate', () => {
  const result = suggest(input([s('A'), s('B'), s('C'), s('D')], { desiredCount: 2, selectedCodes: ['C', 'D'], budget: 1 }))
  assert.equal(result.method, 'exhaustive')
  assert.equal(result.evaluatedCount, 6)
  assert.equal(result.totalCombinationCount, 6)
  assert.equal(result.isExhaustive, true)
})
test('threshold below 20000 remains exhaustive', () => {
  const result = suggest(input(large().slice(0, 17), { desiredCount: 5 }))
  assert.equal(result.totalCombinationCount, 6188)
  assert.equal(result.evaluatedCount, 6188)
})
test('bounded is deterministic, budgeted and detects seeded synergy', () => {
  const subjects = [...large(), s('TARGET', { prereqs: ['A23', 'A24'] })]
  const args = input(subjects, { desiredCount: 5, budget: 60 })
  const result = suggest(args)
  assert.equal(result.method, 'bounded')
  assert.equal(result.totalCombinationCount, 53130)
  assert.equal(result.isExhaustive, false)
  assert.ok(result.evaluatedCount <= 60)
  assert.deepEqual(result.impact.closeCodes, ['TARGET'])
  assert.deepEqual(result, suggest({ ...args, subjects: [...subjects].reverse() }))
})
test('budget one evaluates current first and never fabricates improvement', () => {
  const selectedCodes = ['A20', 'A21', 'A22', 'A23', 'A24']
  const result = suggest(input(large(), { desiredCount: 5, selectedCodes, budget: 1 }))
  assert.equal(result.evaluatedCount, 1)
  assert.equal(result.currentSelectionEvaluated, true)
  assert.equal(result.hasAcademicImprovement, false)
  assert.deepEqual(result.suggestedCodes, selectedCodes)
})
test('combination counts exceeding safe integers are exact decimal strings', () => {
  const subjects = Array.from({ length: 60 }, (_, i) => s(`S${i}`))
  const result = suggest(input(subjects, { desiredCount: 30, budget: 1 }))
  assert.equal(result.totalCombinationCount, '118264581564861424')
  assert.equal(result.evaluatedCount, 1)
  assert.equal(result.method, 'bounded')
})
test('bounded never replaces an academically superior current combination', () => {
  const subjects = [...large(), s('TARGET', { prereqs: ['A23', 'A24'] })]
  const selectedCodes = ['A20', 'A21', 'A22', 'A23', 'A24']
  const result = suggest(input(subjects, { desiredCount: 5, selectedCodes, budget: 100 }))
  assert.deepEqual(result.suggestedCodes, selectedCodes)
  assert.equal(result.hasAcademicImprovement, false)
})
test('invalid current selection is not a candidate or comparable baseline', () => {
  const result = suggest(input([s('A'), s('B', { prereqs: ['A'] })], { selectedCodes: ['B'] }))
  assert.equal(result.currentSelectionEvaluated, false)
  assert.equal(result.hasAcademicImprovement, null)
})
test('invalid budgets and contexts produce explicit diagnostics', () => {
  assert.deepEqual(suggest(input([s('A')], { budget: 0 })).diagnostics, ['INVALID_BUDGET'])
  assert.deepEqual(suggest(input([s('A')], { targetPeriod: null })).diagnostics, ['INVALID_CONTEXT'])
})
test('comparison returns additions, removals, gained and lost close effects', () => {
  const result = compare(input([s('A'), s('B'), s('C', { prereqs: ['A'] }), s('D', { prereqs: ['B'] })], { selectedCodes: ['A'], proposedCodes: ['B'] }))
  assert.deepEqual(result.enteredCodes, ['B'])
  assert.deepEqual(result.removedCodes, ['A'])
  assert.deepEqual(result.close, { gained: ['D'], lost: ['C'], delta: 0 })
  assert.deepEqual(result.validCounts, { current: 1, proposed: 1 })
  assert.equal(result.warnings.proposed[0].code, 'B')
})
test('comparison separates annual effects and partial progress changes', () => {
  const result = compare(input([s('A'), s('B', { durationPeriods: 2 }), s('D'), s('C', { prereqs: ['A'], approvedPrereqs: ['D'] }), s('E', { prereqs: ['B'] })], { selectedCodes: ['A'], proposedCodes: ['B'] }))
  assert.deepEqual(result.annualAdditional, { gained: ['E'], lost: [], delta: 1 })
  assert.equal(result.partialProgress.delta, -1)
  assert.deepEqual(result.partialProgress.lost, [{ code: 'C', type: 'regularized', requirement: 'A' }])
})
test('comparison preserves invalid choices and does not equate requested sizes', () => {
  const result = compare(input([s('A'), s('B', { prereqs: ['A'] })], { selectedCodes: ['B', 'MISSING'], proposedCodes: ['A'] }))
  assert.deepEqual(result.validCounts, { current: 0, proposed: 1 })
  assert.equal(result.current.selection.length, 2)
  assert.equal(compare(input([], { proposedCodes: null })).valid, false)
})
test('deeply frozen inputs remain unchanged across search and comparison', () => {
  const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v) } return v }
  const args = freeze(input([s('A'), s('B'), s('C', { prereqs: ['A', 'B'] })], { selectedCodes: ['A'], proposedCodes: ['B'], desiredCount: 2 }))
  const before = JSON.stringify(args)
  suggest(args); compare(args)
  assert.equal(JSON.stringify(args), before)
})
for (const career of require('./projection-catalogs.cjs')()) test(`suggestion smoke: ${career.id}`, () => {
  const result = suggest(input(career.subjects, { statusMap: career.initialStatus, desiredCount: 1 }))
  assert.equal(result.method, 'exhaustive')
  assert.equal(result.evaluation.valid, true)
  assert.equal(result.effectiveCount, 1)
})

test('close still ranks ahead of larger timeless completion effects', () => {
  const result = suggest(input([s('A', { durationPeriods: undefined }), s('B'), s('C', { prereqs: ['A'] }), s('D', { prereqs: ['A'] }), s('E', { prereqs: ['B'] })]))
  assert.deepEqual(result.suggestedCodes, ['B'])
  assert.deepEqual(result.impact.criteria, [1, 0, 0, 1])
})
test('timeless additional eligibility outranks partial/direct metrics and improves baseline', () => {
  const result = suggest(input([s('A'), s('B', { durationPeriods: undefined }), s('C', { prereqs: ['B'] }), s('D', { approvedPrereqs: ['A'] }), s('E', { approvedPrereqs: ['A'] })], { selectedCodes: ['A'] }))
  assert.deepEqual(result.suggestedCodes, ['B'])
  assert.equal(result.hasAcademicImprovement, true)
  assert.deepEqual(result.impact.criteria, [0, 1, 0, 1])
})
test('timeless partial pairs rank above direct dependencies', () => {
  const result = suggest(input([s('A'), s('B', { durationPeriods: undefined }), s('D'), s('C', { prereqs: ['B'], approvedPrereqs: ['D'] }), s('E', { approvedPrereqs: ['A'] }), s('F', { approvedPrereqs: ['A'] })]))
  assert.deepEqual(result.suggestedCodes, ['B'])
  assert.equal(result.impact.criteria[2], 1)
})
test('completion comparison separates time from academic outcome without double counting', () => {
  const result = compare(input([s('A'), s('B', { durationPeriods: undefined }), s('C', { prereqs: ['A'] }), s('D', { prereqs: ['B'] })], { selectedCodes: ['A'], proposedCodes: ['B'] }))
  assert.deepEqual(result.close, { gained: [], lost: ['C'], delta: -1 })
  assert.deepEqual(result.completionAdditional, { gained: ['D'], lost: [], delta: 1 })
})
test('UADE Informatica N=5 ranks real conditional eligibility instead of only direct dependencies', () => {
  const career = require('./projection-catalogs.cjs')().find(c => c.id === 'uade-informatica')
  const result = suggest(input(career.subjects, { statusMap: career.initialStatus, desiredCount: 5 }))
  assert.equal(result.method, 'bounded')
  assert.equal(result.impact.criteria[0], 0)
  assert.ok(result.impact.criteria[1] > 0)
  assert.ok(result.evaluation.selection.some(s => s.durationPeriods === null))
})
