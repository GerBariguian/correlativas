const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./planner-loader.cjs')
const { api } = load()
const plain = value => JSON.parse(JSON.stringify(value))
const subject = (code, extra = {}) => ({ code, prereqs: [], durationPeriods: 1, ...extra })
const period = { year: 2027, term: '1C' }
const contextInput = subjects => ({ subjects, statusMap: {}, targetPeriod: period })
function equivalentSelections(input, selections) {
  const context = api.preparePlannerEvaluationContext(input)
  for (const selectedCodes of selections) {
    assert.deepEqual(plain(api.evaluatePreparedPlannerSelection(context, selectedCodes)),
      plain(api.evaluatePlannerSelection({ ...input, selectedCodes })), JSON.stringify(selectedCodes))
  }
}
test('prepared matches public for all subsets: synergy, approval, annual and partial deltas', () => {
  const subjects = [subject('A'), subject('B', { durationPeriods: 2 }), subject('D'),
    subject('C', { prereqs: ['A', 'B', 'A'] }), subject('E', { prereqs: ['A', 'B'], approvedPrereqs: ['D'] }),
    subject('F', { approvedPrereqs: ['A'] }), subject('G', { prereqs: ['A'] })]
  const selections = Array.from({ length: 128 }, (_, mask) => subjects.filter((_, i) => mask & (1 << i)).map(s => s.code))
  equivalentSelections(contextInput(subjects), selections)
})
test('prepared preserves unknown start/duration, legacy annual, incompatible and activity', () => {
  equivalentSelections(contextInput([subject('A', { durationPeriods: undefined, term: '2C' }),
    subject('B', { durationPeriods: undefined, term: 'Anual' }), subject('C', { allowedStartTerms: ['2C'] }),
    subject('D', { projectionKind: 'activity' }), subject('E', { prereqs: ['B'] })]),
  [[], ['A'], ['B'], ['C'], ['D'], ['A', 'B', 'C', 'D'], ['MISSING'], ['B', 'B']])
})
test('all mixed known/unknown/annual subsets preserve completion deltas and partial progress', () => {
  const subjects = [subject('A'), subject('B', { durationPeriods: undefined }), subject('D', { durationPeriods: 2 }),
    subject('C', { prereqs: ['A'] }), subject('E', { prereqs: ['A', 'B', 'D'] }), subject('F', { prereqs: ['B', 'D'], approvedPrereqs: ['A'] })]
  equivalentSelections(contextInput(subjects), Array.from({ length: 64 }, (_, mask) => subjects.filter((_, i) => mask & (1 << i)).map(s => s.code)))
})
for (const status of ['Cursando', 'Regularizada', 'Aprobada']) test(`prepared respects real ${status} and initial requirements`, () => {
  equivalentSelections({ ...contextInput([subject('A'), subject('B', { prereqs: ['A'] }), subject('C', { approvedPrereqs: ['A'] })]), statusMap: { A: status } },
    [[], ['A'], ['B'], ['C'], ['A', 'B']])
})
test('prepared results and context do not alias each other or mutable source inputs', () => {
  const input = contextInput([subject('A', { allowedStartTerms: ['1C'] }), subject('B', { prereqs: ['A'] })])
  const snapshot = structuredClone(input)
  const context = api.preparePlannerEvaluationContext(input)
  assert.equal(Object.isFrozen(context.byCode.A.classification.allowedStartTerms), true)
  input.subjects[0].allowedStartTerms.push('2C')
  input.statusMap.A = 'Aprobada'
  const result = api.evaluatePreparedPlannerSelection(context, ['A'])
  result.selection[0].warnings.push('modified')
  result.directDependencies[0].dependents[0].status = 'changed'
  result.close.newEligibility[0].remaining.approved.push('changed')
  assert.deepEqual(plain(api.evaluatePreparedPlannerSelection(context, ['A'])), plain(api.evaluatePlannerSelection({ ...snapshot, selectedCodes: ['A'] })))
})
test('prepared invalid selections and invalid contexts fail explicitly', () => {
  equivalentSelections(contextInput([subject('A')]), [null, [3]])
  const input = { ...contextInput([subject('A')]), targetPeriod: null }
  assert.deepEqual(plain(api.evaluatePreparedPlannerSelection(api.preparePlannerEvaluationContext(input), [])),
    plain(api.evaluatePlannerSelection({ ...input, selectedCodes: [] })))
})
for (const career of require('./projection-catalogs.cjs')()) test(`prepared selection equivalence: ${career.id}`, () => {
  const codes = career.subjects.map(s => s.code)
  const selections = [[], codes, codes.slice(0, 5), codes.slice(-7), ...codes.map(c => [c])]
  equivalentSelections({ subjects: career.subjects, statusMap: career.initialStatus, targetPeriod: period }, selections)
})
function equivalentSearch(input) {
  const fast = load({ trace: true }), reference = load({ reference: true, trace: true })
  const actual = fast.api.suggestPlannerSelection(input), expected = reference.api.suggestPlannerSelection(input)
  assert.deepEqual(plain(actual), plain(expected))
  assert.deepEqual(plain(fast.evaluated), plain(reference.evaluated), 'same combinations in the same order')
  assert.deepEqual(plain(fast.api.comparePlannerSelections({ ...input, proposedCodes: actual.suggestedCodes })),
    plain(reference.api.comparePlannerSelections({ ...input, proposedCodes: expected.suggestedCodes })))
}
test('exhaustive complete output and traversal equivalent with comparable manual selection', () => {
  equivalentSearch({ ...contextInput([subject('A'), subject('B', { durationPeriods: 2 }), subject('C', { prereqs: ['A', 'B'] }), subject('D')]), selectedCodes: ['A', 'D'], desiredCount: 2 })
})
test('bounded output and traversal equivalent including synergy and current selection', () => {
  const subjects = Array.from({ length: 25 }, (_, i) => subject(`S${String(i).padStart(2, '0')}`))
  subjects.push(subject('TARGET', { prereqs: ['S23', 'S24'] }))
  equivalentSearch({ ...contextInput(subjects), selectedCodes: ['S00', 'S01', 'S02', 'S03', 'S04'], desiredCount: 5, budget: 200 })
})
for (const career of require('./projection-catalogs.cjs')()) test(`search equivalence full budget N=5: ${career.id}`, () => {
  equivalentSearch({ subjects: career.subjects, statusMap: career.initialStatus, targetPeriod: period, selectedCodes: [], desiredCount: 5 })
})
