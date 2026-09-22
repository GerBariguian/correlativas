const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const context = vm.createContext({})
for (const file of ['logic.js', 'plannerLogic.js']) {
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replace(/export /g, '')
  vm.runInContext(source, context)
}
const plain = value => JSON.parse(JSON.stringify(value))
const period = { year: 2027, term: '1C' }
const s = (code, extra = {}) => ({ code, prereqs: [], durationPeriods: 1, ...extra })
const evaluate = (subjects, selectedCodes = ['A'], statusMap = {}, targetPeriod = period) => plain(context.evaluatePlannerSelection({ subjects, selectedCodes, statusMap, targetPeriod }))
const classify = (subject, map = {}, p = period) => plain(context.classifyPlannerSubject(subject, map, p))
const codes = entries => entries.map(e => e.code)

test('regularizing a selected course enables a pending dependent, never approves', () => {
  const result = evaluate([s('A'), s('B', { prereqs: ['A'] }), s('C', { approvedPrereqs: ['A'] })])
  assert.deepEqual(codes(result.close.newEligibility), ['B'])
  assert.deepEqual(result.close.regularizedCodes, ['A'])
  assert.deepEqual(result.close.partialProgress, [])
})
test('combined A+B synergy is not the sum of individual eligibility', () => {
  const subjects = [s('A'), s('B'), s('C', { prereqs: ['A', 'B'] })]
  for (const code of ['A', 'B']) assert.deepEqual(evaluate(subjects, [code]).close.newEligibility, [])
  const entry = evaluate(subjects, ['A', 'B']).close.newEligibility[0]
  assert.equal(entry.synergy, true)
  assert.deepEqual(entry.contributors, ['A', 'B'])
})
test('partial progress reports remaining approval separately', () => {
  const result = evaluate([s('A'), s('D'), s('C', { prereqs: ['A'], approvedPrereqs: ['D'] })])
  assert.deepEqual(result.close.partialProgress, [{ code: 'C', satisfied: { regularized: ['A'], approved: [] }, remaining: { regularized: [], approved: ['D'] }, contributors: ['A'] }])
})
for (const status of ['Aprobada', 'Regularizada', 'Cursando']) test(`dependent already ${status} is not a new eligibility`, () => {
  const result = evaluate([s('A'), s('B', { prereqs: ['A'] })], ['A'], { B: status })
  assert.deepEqual(result.close.newEligibility, [])
  assert.equal(result.directDependencies[0].dependents[0].status, status)
})
test('already eligible subjects do not count as newly enabled', () => {
  assert.deepEqual(evaluate([s('A'), s('B')]).close.newEligibility, [])
})
test('duplicate selections and requirements deduplicate explanations', () => {
  const result = evaluate([s('A'), s('B', { prereqs: ['A', 'A'] })], ['A', 'A'])
  assert.equal(result.selection.length, 1)
  assert.deepEqual(result.close.newEligibility[0].contributors, ['A'])
})
test('blocked selection stays visible and cannot chain into another selected course', () => {
  const result = evaluate([s('A'), s('B', { prereqs: ['A'] }), s('C', { prereqs: ['B'] })], ['A', 'B'])
  assert.equal(result.selection[1].academicState, 'blocked')
  assert.deepEqual(result.close.regularizedCodes, ['A'])
  assert.deepEqual(result.close.newEligibility, [])
})
for (const term of ['1C', '2C']) test(`explicit start ${term} is checked independently`, () => {
  const result = evaluate([s('A', { allowedStartTerms: [term] }), s('B', { prereqs: ['A'] })])
  assert.equal(result.selection[0].start, term === '1C' ? 'compatible' : 'incompatible')
  assert.equal(result.close.newEligibility.length, term === '1C' ? 1 : 0)
})
test('unknown start remains selectable and warned with known duration', () => {
  const item = classify(s('A', { term: '2C' }))
  assert.equal(item.start, 'unknown')
  assert.equal(item.selectable, true)
  assert.deepEqual(item.warnings, ['START_UNKNOWN'])
})
test('unknown duration is not invented from generic term', () => {
  const result = evaluate([{ code: 'A', term: '1C' }, s('B', { prereqs: ['A'] })])
  assert.equal(result.selection[0].selectable, true)
  assert.equal(result.selection[0].durationPeriods, null)
  assert.deepEqual(result.close.regularizedCodes, [])
  assert.deepEqual(result.annualAdditional.regularizedCodes, [])
})
test('explicit activities cannot contribute as courses or become course unlocks', () => {
  const result = evaluate([s('A', { projectionKind: 'activity' }), s('B', { prereqs: ['A'] })])
  assert.equal(result.selection[0].kind, 'activity')
  assert.equal(result.selection[0].selectable, false)
  assert.deepEqual(result.close.newEligibility, [])
  assert.deepEqual(evaluate([s('A'), s('P', { projectionKind: 'activity', prereqs: ['A'] })]).close.newEligibility, [])
})
test('annual impact is deferred and only additional effects are returned', () => {
  const result = evaluate([s('A', { durationPeriods: 2, allowedStartTerms: ['1C'] }), s('B'), s('C', { prereqs: ['A', 'B'] }), s('D', { prereqs: ['B'] })], ['A', 'B'])
  assert.deepEqual(codes(result.close.newEligibility), ['D'])
  assert.deepEqual(codes(result.annualAdditional.newEligibility), ['C'])
  assert.deepEqual(result.annualAdditional.newEligibility[0].contributors, ['A', 'B'])
  assert.deepEqual(result.annualAdditional.newEligibility[0].satisfied.regularized, ['A'])
  assert.equal(result.annualAdditional.newEligibility[0].synergy, true)
})
test('legacy annual has known duration but unknown start even in 2C', () => {
  const result = evaluate([{ code: 'A', term: 'Anual' }, s('B', { prereqs: ['A'] })], ['A'], {}, { year: 2027, term: '2C' })
  assert.equal(result.selection[0].start, 'unknown')
  assert.equal(result.selection[0].durationSource, 'legacy-annual')
  assert.deepEqual(result.close.newEligibility, [])
  assert.deepEqual(codes(result.annualAdditional.newEligibility), ['B'])
})
test('annual partial delta excludes effects already reported at close', () => {
  const result = evaluate([s('A', { durationPeriods: 2 }), s('B'), s('D'), s('C', { prereqs: ['A', 'B'], approvedPrereqs: ['D'] })], ['A', 'B'])
  assert.deepEqual(result.close.partialProgress[0].satisfied.regularized, ['B'])
  assert.deepEqual(result.annualAdditional.partialProgress[0].satisfied.regularized, ['A'])
  assert.deepEqual(result.annualAdditional.partialProgress[0].remaining.approved, ['D'])
})
for (const status of ['Cursando', 'Regularizada', 'Aprobada']) test(`real ${status} is never hypothetically completed`, () => {
  const result = evaluate([s('A', { durationPeriods: 2 }), s('B', { prereqs: ['A'] })], ['A'], { A: status })
  assert.equal(result.selection[0].academicState, status)
  assert.deepEqual(result.close.regularizedCodes, [])
  assert.deepEqual(result.annualAdditional.regularizedCodes, [])
})
test('direct relations retain regularization and approval distinction', () => {
  const result = evaluate([s('A'), s('B', { prereqs: ['A'] }), s('C', { approvedPrereqs: ['A'] })])
  assert.equal(result.directDependencies[0].dependents[0].requiresRegularized, true)
  assert.equal(result.directDependencies[0].dependents[1].requiresApproved, true)
})
for (const extra of [{ durationPeriods: 3 }, { allowedStartTerms: [] }, { allowedStartTerms: ['3C'] }, { term: 'Anual', durationPeriods: 1 }, { prereqs: 'A' }, { projectionKind: 'other' }]) test(`invalid metadata is explicit: ${JSON.stringify(extra)}`, () => {
  const result = evaluate([s('A', extra)])
  assert.equal(result.valid, false)
  assert.equal(result.close, null)
  assert.equal(classify(s('A', extra)).selectable, false)
})
test('unknown selected code stays in selection without contributing', () => {
  const result = evaluate([s('A')], ['MISSING'])
  assert.deepEqual(result.selection[0].errors, ['UNKNOWN_SELECTED_CODE'])
  assert.deepEqual(result.close.regularizedCodes, [])
})
test('empty catalog and selection are valid, absent input is not', () => {
  assert.equal(evaluate([], []).valid, true)
  assert.equal(context.evaluatePlannerSelection().valid, false)
})
test('invalid period, statuses, duplicate catalog and unknown references fail closed', () => {
  assert.equal(evaluate([s('A')], ['A'], {}, { year: 0, term: '1C' }).valid, false)
  assert.equal(evaluate([s('A')], ['A'], { A: 'other' }).valid, false)
  assert.equal(evaluate([s('A'), s('A')]).valid, false)
  assert.equal(evaluate([s('A', { prereqs: ['missing'] })]).valid, false)
})
test('deterministic with reordered catalog, selection and prerequisites', () => {
  const a = evaluate([s('A'), s('B'), s('C', { prereqs: ['B', 'A'] })], ['B', 'A'])
  const b = evaluate([s('C', { prereqs: ['A', 'B'] }), s('B'), s('A')], ['A', 'B'])
  assert.deepEqual(a, b)
})
test('all inputs deeply frozen remain unchanged; outputs do not alias input arrays', () => {
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) } return value }
  const input = freeze({ subjects: [s('A', { allowedStartTerms: ['1C'] }), s('B', { prereqs: ['A'] })], statusMap: {}, selectedCodes: ['A'], targetPeriod: { ...period } })
  const before = JSON.stringify(input)
  const result = context.evaluatePlannerSelection(input)
  result.selection[0].allowedStartTerms.push('2C')
  assert.equal(JSON.stringify(input), before)
})
for (const career of require('./projection-catalogs.cjs')()) test(`real catalog smoke: ${career.id}`, () => {
  const result = evaluate(career.subjects, career.subjects.map(s => s.code), career.initialStatus)
  assert.equal(result.valid, true, JSON.stringify(result.errors))
  assert.equal(result.selection.length, career.subjects.length)
})

test('unknown duration regularizes only in timeless completion, without inventing metadata', () => {
  const result = evaluate([s('A', { durationPeriods: undefined, term: '1C' }), s('B', { prereqs: ['A'] })])
  assert.deepEqual(result.close.newEligibility, [])
  assert.deepEqual(result.completion.regularizedCodes, ['A'])
  assert.deepEqual(codes(result.completion.additionalEligibility), ['B'])
  assert.equal(result.selection[0].durationPeriods, null)
  assert.equal(result.selection[0].start, 'unknown')
})
test('completion separates already-at-close from additional annual and unknown-duration synergy', () => {
  const result = evaluate([s('A'), s('B', { durationPeriods: undefined }), s('D', { durationPeriods: 2 }),
    s('C', { prereqs: ['A'] }), s('E', { prereqs: ['A', 'B', 'D'] })], ['A', 'B', 'D'])
  assert.deepEqual(codes(result.close.newEligibility), ['C'])
  assert.deepEqual(result.completion.alreadyAtCloseCodes, ['C'])
  assert.deepEqual(codes(result.completion.additionalEligibility), ['E'])
  assert.deepEqual(codes(result.completion.newEligibility), ['C', 'E'])
  assert.deepEqual(result.completion.additionalEligibility[0].contributors, ['A', 'B', 'D'])
  assert.equal(result.completion.additionalEligibility[0].synergy, true)
})
test('timeless partial progress never satisfies approval and retains exact missing requirements', () => {
  const result = evaluate([s('A', { durationPeriods: undefined }), s('D'), s('C', { prereqs: ['A'], approvedPrereqs: ['D'] })])
  assert.deepEqual(result.completion.newEligibility, [])
  assert.deepEqual(result.completion.partialProgress, [{ code: 'C', satisfied: { regularized: ['A'], approved: [] }, remaining: { regularized: [], approved: ['D'] }, contributors: ['A'] }])
})
test('unknown-duration A+B synergy requires both valid initial candidates', () => {
  const subjects = [s('A', { durationPeriods: undefined }), s('B', { durationPeriods: undefined }), s('C', { prereqs: ['A', 'B'] })]
  assert.deepEqual(evaluate(subjects, ['A']).completion.newEligibility, [])
  assert.deepEqual(evaluate(subjects, ['B']).completion.newEligibility, [])
  assert.equal(evaluate(subjects, ['A', 'B']).completion.additionalEligibility[0].synergy, true)
})
test('completion excludes incompatible, activities, already taking, and chained selected starts', () => {
  const result = evaluate([s('A'), s('B', { prereqs: ['A'] }), s('D', { allowedStartTerms: ['2C'] }),
    s('E', { projectionKind: 'activity' }), s('F'), s('G', { prereqs: ['B', 'D', 'E', 'F'] })], ['A', 'B', 'D', 'E', 'F'], { F: 'Cursando' })
  assert.deepEqual(result.completion.regularizedCodes, ['A'])
  assert.deepEqual(result.completion.newEligibility, [])
  assert.equal(result.selection.find(s => s.code === 'D').start, 'incompatible')
})
