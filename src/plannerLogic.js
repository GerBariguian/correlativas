import { STATUS, getStatus, canCourse, missingCoursePrereqs } from './logic.js'

const sorted = values => [...new Set(values)].sort()
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const validPeriod = p => record(p) && Number.isInteger(p.year) && p.year >= 1 && p.year <= 9999 && ['1C', '2C'].includes(p.term)
const requirements = (subject, map) => {
  const missing = missingCoursePrereqs(subject, map)
  return { regularized: sorted(missing.regularized), approved: sorted(missing.approved) }
}

function subjectErrors(subject) {
  if (!record(subject) || typeof subject.code !== 'string' || !subject.code) return ['INVALID_SUBJECT']
  const errors = []
  for (const field of ['prereqs', 'approvedPrereqs']) {
    if (subject[field] !== undefined && (!Array.isArray(subject[field]) || subject[field].some(c => typeof c !== 'string' || !c))) errors.push(`INVALID_${field}`)
  }
  if (subject.durationPeriods !== undefined && ![1, 2].includes(subject.durationPeriods)) errors.push('INVALID_DURATION')
  if (subject.term === 'Anual' && subject.durationPeriods === 1) errors.push('CONFLICTING_DURATION')
  if (subject.allowedStartTerms !== undefined && (!Array.isArray(subject.allowedStartTerms) || !subject.allowedStartTerms.length
    || subject.allowedStartTerms.some(t => !['1C', '2C'].includes(t)) || new Set(subject.allowedStartTerms).size !== subject.allowedStartTerms.length)) errors.push('INVALID_START_TERMS')
  if (subject.projectionKind !== undefined && !['course', 'activity'].includes(subject.projectionKind)) errors.push('INVALID_KIND')
  return errors
}

// Compatibility means compatibility with explicit metadata, never actual offering.
export function classifyPlannerSubject(subject, statusMap, targetPeriod) {
  const errors = subjectErrors(subject)
  if (!record(statusMap) || Object.values(statusMap).some(s => !STATUS.includes(s))) errors.push('INVALID_STATUS_MAP')
  if (!validPeriod(targetPeriod)) errors.push('INVALID_TARGET_PERIOD')
  if (errors.length) return { code: subject?.code ?? null, academicState: 'invalid', selectable: false, errors, warnings: [] }
  const status = getStatus(statusMap, subject.code)
  const kind = subject.projectionKind === 'activity' ? 'activity' : 'course'
  const academicState = status !== 'Pendiente' ? status : canCourse(subject, statusMap) ? 'eligible' : 'blocked'
  const durationPeriods = subject.durationPeriods ?? (subject.term === 'Anual' ? 2 : null)
  const start = subject.allowedStartTerms === undefined ? 'unknown' : subject.allowedStartTerms.includes(targetPeriod.term) ? 'compatible' : 'incompatible'
  const warnings = []
  if (kind === 'course' && start === 'unknown') warnings.push('START_UNKNOWN')
  if (kind === 'course' && durationPeriods === null) warnings.push('DURATION_UNKNOWN')
  return { code: subject.code, kind, academicState, missing: requirements(subject, statusMap),
    durationPeriods, durationSource: subject.durationPeriods !== undefined ? 'explicit' : durationPeriods === 2 ? 'legacy-annual' : 'unknown',
    start, allowedStartTerms: subject.allowedStartTerms ? sorted(subject.allowedStartTerms) : null,
    selectable: kind === 'course' && academicState === 'eligible' && start !== 'incompatible', errors, warnings }
}

function impact(subjects, selected, before, after) {
  const newEligibility = [], partialProgress = []
  for (const subject of subjects) {
    if (subject.projectionKind === 'activity' || selected.has(subject.code) || getStatus(before, subject.code) !== 'Pendiente' || canCourse(subject, before)) continue
    const previous = requirements(subject, before), remaining = requirements(subject, after)
    const satisfied = { regularized: previous.regularized.filter(c => !remaining.regularized.includes(c)),
      approved: previous.approved.filter(c => !remaining.approved.includes(c)) }
    const contributors = sorted([...satisfied.regularized, ...satisfied.approved])
    if (!contributors.length) continue
    const explanation = { code: subject.code, satisfied, remaining, contributors }
    if (canCourse(subject, after)) newEligibility.push({ ...explanation, synergy: contributors.length > 1 })
    else partialProgress.push(explanation)
  }
  return { newEligibility, partialProgress }
}

/** A conditional academic analysis, not a forecast or an actual offering check.
 * annualAdditional is a delta from close; contributors there includes all real
 * missing prerequisites satisfied jointly, while satisfied only lists the delta.
 */
export function evaluatePlannerSelection({ subjects, statusMap, selectedCodes, targetPeriod } = {}) {
  const errors = []
  if (!Array.isArray(subjects)) errors.push({ code: 'INVALID_CATALOG' })
  if (!record(statusMap) || Object.values(statusMap).some(s => !STATUS.includes(s))) errors.push({ code: 'INVALID_STATUS_MAP' })
  if (!Array.isArray(selectedCodes) || selectedCodes.some(c => typeof c !== 'string' || !c)) errors.push({ code: 'INVALID_SELECTION' })
  if (!validPeriod(targetPeriod)) errors.push({ code: 'INVALID_TARGET_PERIOD' })
  const codes = new Set()
  if (Array.isArray(subjects)) for (const subject of subjects) {
    for (const code of subjectErrors(subject)) errors.push({ code, subjectCode: subject?.code ?? null })
    if (codes.has(subject?.code)) errors.push({ code: 'DUPLICATE_SUBJECT', subjectCode: subject?.code })
    codes.add(subject?.code)
  }
  if (!errors.length) for (const subject of subjects) for (const code of [...(subject.prereqs ?? []), ...(subject.approvedPrereqs ?? [])]) {
    if (!codes.has(code) || code === subject.code) errors.push({ code: 'INVALID_REQUIREMENT_REFERENCE', subjectCode: subject.code, requirement: code })
  }
  if (errors.length) return { valid: false, errors, selection: [], close: null, annualAdditional: null, completion: null, directDependencies: [] }
  const catalog = [...subjects].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
  const selected = new Set(selectedCodes)
  const selection = sorted(selectedCodes).map(code => {
    const subject = catalog.find(s => s.code === code)
    return subject ? classifyPlannerSubject(subject, statusMap, targetPeriod)
      : { code, academicState: 'invalid', selectable: false, errors: ['UNKNOWN_SELECTED_CODE'], warnings: [] }
  })
  const closeMap = { ...statusMap }, annualMap = { ...statusMap }, completionMap = { ...statusMap }
  for (const item of selection.filter(s => s.selectable)) {
    completionMap[item.code] = 'Regularizada'
    if (item.durationPeriods === 1) closeMap[item.code] = annualMap[item.code] = 'Regularizada'
    if (item.durationPeriods === 2) annualMap[item.code] = 'Regularizada'
  }
  const close = impact(catalog, selected, statusMap, closeMap)
  const annualAdditional = impact(catalog, selected, closeMap, annualMap)
  const completion = impact(catalog, selected, statusMap, completionMap)
  const alreadyAtCloseCodes = close.newEligibility.map(entry => entry.code)
  for (const entry of [...annualAdditional.newEligibility, ...annualAdditional.partialProgress]) {
    const subject = catalog.find(s => s.code === entry.code)
    const original = requirements(subject, statusMap), remaining = requirements(subject, annualMap)
    entry.contributors = original.regularized.filter(c => !remaining.regularized.includes(c))
    if ('synergy' in entry) entry.synergy = entry.contributors.length > 1
  }
  const directDependencies = selection.map(item => ({ code: item.code, dependents: catalog.filter(s =>
    (s.prereqs ?? []).includes(item.code) || (s.approvedPrereqs ?? []).includes(item.code)).map(s => ({
    code: s.code, status: getStatus(statusMap, s.code), kind: s.projectionKind === 'activity' ? 'activity' : 'course',
    requiresRegularized: (s.prereqs ?? []).includes(item.code), requiresApproved: (s.approvedPrereqs ?? []).includes(item.code),
  })) }))
  return { valid: true, errors, targetPeriod: { ...targetPeriod }, selection,
    close: { ...close, regularizedCodes: selection.filter(s => s.selectable && s.durationPeriods === 1).map(s => s.code) },
    annualAdditional: { ...annualAdditional, regularizedCodes: selection.filter(s => s.selectable && s.durationPeriods === 2).map(s => s.code) },
    completion: { ...completion, alreadyAtCloseCodes,
      additionalEligibility: completion.newEligibility.filter(entry => !alreadyAtCloseCodes.includes(entry.code)),
      regularizedCodes: selection.filter(s => s.selectable).map(s => s.code) },
    directDependencies }
}

const copyRequirements = r => ({ regularized: [...r.regularized], approved: [...r.approved] })
const copyClassification = item => ({ ...item, missing: copyRequirements(item.missing),
  allowedStartTerms: item.allowedStartTerms === null ? null : [...item.allowedStartTerms],
  errors: [...item.errors], warnings: [...item.warnings] })
function freezePlannerContext(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezePlannerContext)
    Object.freeze(value)
  }
  return value
}

// Private-to-one-search snapshot. No input references, global cache or hypothetical
// approvals. Keep evaluatePlannerSelection as the independent public reference.
export function preparePlannerEvaluationContext({ subjects, statusMap, targetPeriod } = {}) {
  const baseline = evaluatePlannerSelection({ subjects, statusMap, targetPeriod,
    selectedCodes: Array.isArray(subjects) ? subjects.map(s => s?.code) : [] })
  if (!baseline.valid) return freezePlannerContext({ valid: false, baseline: structuredClone(baseline) })
  const byCode = Object.create(null)
  for (let index = 0; index < baseline.selection.length; index++) {
    const item = baseline.selection[index]
    byCode[item.code] = { classification: item, dependents: baseline.directDependencies[index].dependents }
  }
  const targets = baseline.selection.filter(item => item.kind === 'course' && item.academicState === 'blocked')
    .map(item => ({ code: item.code, missing: copyRequirements(item.missing) }))
  return freezePlannerContext({ valid: true, targetPeriod: { ...targetPeriod }, byCode, targets })
}

export function evaluatePreparedPlannerSelection(context, selectedCodes) {
  if (!context.valid) return structuredClone(context.baseline)
  if (!Array.isArray(selectedCodes) || selectedCodes.some(c => typeof c !== 'string' || !c)) {
    return { valid: false, errors: [{ code: 'INVALID_SELECTION' }], selection: [], close: null, annualAdditional: null, completion: null, directDependencies: [] }
  }
  const ordered = sorted(selectedCodes), selected = new Set(ordered)
  const selection = ordered.map(code => context.byCode[code] ? copyClassification(context.byCode[code].classification)
    : { code, academicState: 'invalid', selectable: false, errors: ['UNKNOWN_SELECTED_CODE'], warnings: [] })
  const closeCodes = selection.filter(s => s.selectable && s.durationPeriods === 1).map(s => s.code)
  const annualCodes = selection.filter(s => s.selectable && s.durationPeriods === 2).map(s => s.code)
  const closeSet = new Set(closeCodes), annualSet = new Set(annualCodes)
  const close = { newEligibility: [], partialProgress: [], regularizedCodes: closeCodes }
  const annualAdditional = { newEligibility: [], partialProgress: [], regularizedCodes: annualCodes }
  const completionCodes = selection.filter(s => s.selectable).map(s => s.code)
  const completionSet = new Set(completionCodes)
  const completion = { newEligibility: [], partialProgress: [], alreadyAtCloseCodes: [], additionalEligibility: [], regularizedCodes: completionCodes }
  for (const target of context.targets) {
    if (selected.has(target.code)) continue
    const initial = target.missing
    // The only permitted state transition is Pending -> Regularized, so missing
    // approvals stay unchanged. Baseline requirements already encode real progress.
    const satisfiedClose = initial.regularized.filter(c => closeSet.has(c))
    const remainingClose = initial.regularized.filter(c => !closeSet.has(c))
    const closeEnabled = remainingClose.length === 0 && initial.approved.length === 0
    // Completion has no date: every valid selected course can regularize here,
    // including unknown durations. It never enables another selected start.
    const satisfiedCompletion = initial.regularized.filter(c => completionSet.has(c))
    if (satisfiedCompletion.length) {
      const remainingCompletion = initial.regularized.filter(c => !completionSet.has(c))
      const entry = { code: target.code, satisfied: { regularized: satisfiedCompletion, approved: [] },
        remaining: { regularized: remainingCompletion, approved: [...initial.approved] }, contributors: [...satisfiedCompletion] }
      if (!remainingCompletion.length && !initial.approved.length) {
        const enabled = { ...entry, synergy: satisfiedCompletion.length > 1 }
        completion.newEligibility.push(enabled)
        if (closeEnabled) completion.alreadyAtCloseCodes.push(target.code)
        else completion.additionalEligibility.push(enabled)
      } else completion.partialProgress.push(entry)
    }
    if (satisfiedClose.length) {
      const entry = { code: target.code, satisfied: { regularized: satisfiedClose, approved: [] },
        remaining: { regularized: remainingClose, approved: [...initial.approved] }, contributors: [...satisfiedClose] }
      if (closeEnabled) close.newEligibility.push({ ...entry, synergy: satisfiedClose.length > 1 })
      else close.partialProgress.push(entry)
    }
    if (closeEnabled) continue
    const satisfiedAnnual = remainingClose.filter(c => annualSet.has(c))
    if (!satisfiedAnnual.length) continue
    const remainingAnnual = remainingClose.filter(c => !annualSet.has(c))
    const contributors = initial.regularized.filter(c => closeSet.has(c) || annualSet.has(c))
    const entry = { code: target.code, satisfied: { regularized: satisfiedAnnual, approved: [] },
      remaining: { regularized: remainingAnnual, approved: [...initial.approved] }, contributors }
    if (!remainingAnnual.length && !initial.approved.length) annualAdditional.newEligibility.push({ ...entry, synergy: contributors.length > 1 })
    else annualAdditional.partialProgress.push(entry)
  }
  const directDependencies = ordered.map(code => ({ code,
    dependents: (context.byCode[code]?.dependents ?? []).map(item => ({ ...item })) }))
  return { valid: true, errors: [], targetPeriod: { ...context.targetPeriod }, selection, close, annualAdditional, completion, directDependencies }
}
