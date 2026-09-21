import { STATUS, getStatus, canCourse, canTakeFinal, missingCoursePrereqs, missingFinalPrereqs } from './logic.js'

const compareCode = (a, b) => a < b ? -1 : a > b ? 1 : 0
const unique = values => [...new Set(values)].sort(compareCode)
const validPeriod = p => p && Number.isInteger(p.year) && p.year >= 1 && p.year <= 9999 && ['1C', '2C'].includes(p.term)
export function periodIndex(period) {
  if (!validPeriod(period)) throw new Error('Período inválido.')
  return period.year * 2 + (period.term === '2C' ? 1 : 0)
}
export function comparePeriods(a, b) { return periodIndex(a) - periodIndex(b) }
export function advancePeriod(period, count = 1) {
  if (!Number.isInteger(count) || count < 0) throw new Error('Desplazamiento inválido.')
  const index = periodIndex(period) + count
  const result = { year: Math.floor(index / 2), term: index % 2 ? '2C' : '1C' }
  periodIndex(result)
  return result
}

// Temporal metadata is independent of academic prerequisites, names and IDs.
// The existing exact catalog label "Anual" is supported as legacy metadata.
export function getProjectionDuration(career, subject) {
  return subject.durationPeriods ?? (subject.term === 'Anual' ? 2 : 1)
}
export function getAllowedStartTerms(subject) {
  return subject.allowedStartTerms ?? (getProjectionDuration(null, subject) === 2 ? ['1C'] : ['1C', '2C'])
}
const isCourse = subject => subject.projectionKind !== 'activity'

function finalRequirements(subject, subjects) {
  const requirements = subject.finalPrereqs ?? subject.prereqs ?? []
  return requirements.includes('ALL')
    ? subjects.filter(s => s.code !== subject.code && !s.elective && !s.excludeFromAllFinals).map(s => s.code)
    : requirements
}

export function buildRequirementGraph(subjects) {
  const edges = []
  for (const subject of subjects) {
    for (const code of subject.prereqs ?? []) edges.push({ from: code, to: subject.code, type: 'regularized-for-course' })
    for (const code of subject.approvedPrereqs ?? []) edges.push({ from: code, to: subject.code, type: 'approved-for-course' })
    for (const code of finalRequirements(subject, subjects)) edges.push({ from: code, to: subject.code, type: 'approved-for-final' })
  }
  const descendants = code => {
    const seen = new Set([code]), pending = [code]
    while (pending.length) {
      const current = pending.pop()
      for (const edge of edges.filter(e => e.from === current)) if (!seen.has(edge.to)) {
        seen.add(edge.to); pending.push(edge.to)
      }
    }
    seen.delete(code)
    return unique([...seen])
  }
  // Milestone graph preserves the distinction between regularization and approval.
  const milestoneEdges = subjects.map(s => [`${s.code}:R`, `${s.code}:A`])
  for (const edge of edges) milestoneEdges.push([
    `${edge.from}:${edge.type === 'regularized-for-course' ? 'R' : 'A'}`,
    `${edge.to}:${edge.type === 'approved-for-final' ? 'A' : 'R'}`,
  ])
  const visited = new Set(), active = [], cycles = []
  function visit(node) {
    if (active.includes(node)) { cycles.push([...active.slice(active.indexOf(node)), node]); return }
    if (visited.has(node)) return
    active.push(node)
    for (const [, target] of milestoneEdges.filter(([source]) => source === node)) visit(target)
    active.pop(); visited.add(node)
  }
  for (const s of subjects) { visit(`${s.code}:R`); visit(`${s.code}:A`) }
  return { edges, cycles, metrics: subjects.map(s => ({ code: s.code,
    directDependents: unique(edges.filter(e => e.from === s.code).map(e => e.to)),
    descendants: descendants(s.code),
  })) }
}

export function validateProjectionInputs({ career, statusMap, scenario } = {}) {
  const errors = []
  const fail = (code, detail) => errors.push({ code, detail })
  if (!career || !Array.isArray(career.subjects) || !career.subjects.length) return [{ code: 'INVALID_CATALOG' }]
  const subjects = career.subjects, codes = new Set()
  for (const subject of subjects) {
    if (!subject || typeof subject.code !== 'string' || !subject.code || codes.has(subject.code)) fail('INVALID_CODE', subject?.code)
    else codes.add(subject.code)
    if (subject && ((subject.durationPeriods !== undefined && ![1, 2].includes(subject.durationPeriods))
      || (subject.projectionKind !== undefined && !['course', 'activity'].includes(subject.projectionKind))
      || (subject.allowedStartTerms !== undefined && (!Array.isArray(subject.allowedStartTerms) || !subject.allowedStartTerms.length
        || subject.allowedStartTerms.some(t => !['1C', '2C'].includes(t))
        || new Set(subject.allowedStartTerms).size !== subject.allowedStartTerms.length))
      || (getProjectionDuration(null, subject) === 2 && Array.isArray(getAllowedStartTerms(subject)) && getAllowedStartTerms(subject).some(t => t !== '1C')))) fail('INVALID_TEMPORAL_METADATA', subject.code)
    for (const field of ['prereqs', 'approvedPrereqs', 'finalPrereqs']) {
      if (subject?.[field] !== undefined && (!Array.isArray(subject[field]) || subject[field].some(c => typeof c !== 'string'))) fail('INVALID_REQUIREMENTS', subject?.code)
    }
  }
  if (errors.length) return errors
  for (const s of subjects) for (const field of ['prereqs', 'approvedPrereqs', 'finalPrereqs']) {
    for (const code of s[field] ?? []) if (!(field === 'finalPrereqs' && code === 'ALL') && !codes.has(code)) fail('UNKNOWN_REQUIREMENT', { subject: s.code, field, code })
  }
  if (errors.length) return errors
  const graph = buildRequirementGraph(subjects)
  if (graph.cycles.length) fail('REQUIREMENT_CYCLE', graph.cycles)
  if (!statusMap || typeof statusMap !== 'object' || Array.isArray(statusMap)) fail('INVALID_STATUS_MAP')
  else {
    for (const [code, status] of Object.entries(statusMap)) if (!codes.has(code) || !STATUS.includes(status)) fail('INVALID_STATUS', { code, status })
    for (const subject of subjects) {
      const status = getStatus(statusMap, subject.code)
      if (status !== 'Pendiente' && (!canCourse(subject, statusMap)
        || (status === 'Aprobada' && !canTakeFinal(subject, statusMap, subjects)))) {
        fail('INCONSISTENT_STATUS', subject.code)
        Object.assign(errors.at(-1), { subjectStatus: status, ...missingCoursePrereqs(subject, statusMap),
          missingFinalApproved: status === 'Aprobada' ? missingFinalPrereqs(subject, statusMap, subjects) : [] })
      }
    }
  }
  if (!scenario || !validPeriod(scenario.startPeriod)) { fail('INVALID_START_PERIOD'); return errors }
  const validCapacity = n => Number.isSafeInteger(n) && n >= 0
  if (!validCapacity(scenario.initialCapacity)) fail('INVALID_CAPACITY')
  const horizon = scenario.maxPeriods ?? 40
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 120
    || (validPeriod(scenario.startPeriod) && periodIndex(scenario.startPeriod) + horizon - 1 > 19999)) fail('INVALID_HORIZON')
  for (const field of ['capacities', 'finalEvents']) {
    if (scenario[field] !== undefined && !Array.isArray(scenario[field])) { fail('INVALID_SCENARIO_LIST', field); continue }
    const seen = new Set()
    for (const item of scenario[field] ?? []) {
      if (!item || !validPeriod(item.period) || comparePeriods(item.period, scenario.startPeriod) < 0) { fail('INVALID_EVENT_PERIOD', field); continue }
      const key = field === 'capacities' ? periodIndex(item.period) : item.code
      if (seen.has(key)) fail('DUPLICATE_SCENARIO_ENTRY', field)
      seen.add(key)
      if (field === 'capacities' ? !validCapacity(item.capacity) : !codes.has(item.code)) fail('INVALID_SCENARIO_ENTRY', field)
    }
  }
  if (scenario.manualPeriods !== undefined && !Array.isArray(scenario.manualPeriods)) fail('INVALID_MANUAL_PERIODS')
  else {
    const seenPeriods = new Set(), seenCodes = new Set()
    for (const item of scenario.manualPeriods ?? []) {
      if (!item || !validPeriod(item.period) || comparePeriods(item.period, scenario.startPeriod) < 0
        || !Array.isArray(item.codes)) { fail('INVALID_MANUAL_PERIOD'); continue }
      const key = periodIndex(item.period)
      if (key === periodIndex(scenario.startPeriod) && subjects.some(s => isCourse(s) && statusMap?.[s.code] === 'Cursando')) fail('CURRENT_PERIOD_READ_ONLY')
      if (seenPeriods.has(key)) fail('DUPLICATE_MANUAL_PERIOD')
      seenPeriods.add(key)
      for (const code of item.codes) {
        if (!codes.has(code) || seenCodes.has(code) || !isCourse(subjects.find(s => s.code === code) ?? {})) fail('INVALID_MANUAL_CODE', code)
        seenCodes.add(code)
      }
    }
  }
  return errors
}

export function rankProjectionCandidates(subjects, statusMap, graph = buildRequirementGraph(subjects)) {
  const ranked = subjects.filter(s => isCourse(s) && getStatus(statusMap, s.code) === 'Pendiente' && canCourse(s, statusMap)).map(subject => {
    const after = { ...statusMap, [subject.code]: 'Regularizada' }
    const effectiveUnlocks = subjects.filter(s => isCourse(s) && s.code !== subject.code && getStatus(statusMap, s.code) === 'Pendiente'
      && !canCourse(s, statusMap) && canCourse(s, after)).map(s => s.code).sort(compareCode)
    const metric = graph.metrics.find(m => m.code === subject.code)
    return { code: subject.code, transition: 'Regularizada', effectiveUnlocks,
      directDependents: [...metric.directDependents], descendants: [...metric.descendants] }
  }).sort((a, b) => b.effectiveUnlocks.length - a.effectiveUnlocks.length
    || b.descendants.length - a.descendants.length || b.directDependents.length - a.directDependents.length
    || compareCode(a.code, b.code))
  // Compare metadata only within whole tied groups. Pairwise fallback with
  // missing metadata can make a comparator non-transitive.
  const groups = new Map()
  for (const candidate of ranked) {
    const key = [candidate.effectiveUnlocks.length, candidate.descendants.length, candidate.directDependents.length].join(':')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(candidate)
  }
  const metadata = code => subjects.find(s => s.code === code)
  return [...groups.values()].flatMap(group => {
    const yearsComparable = group.every(c => Number.isInteger(metadata(c.code).year) && metadata(c.code).year > 0)
    const yearGroups = new Map()
    for (const candidate of group) {
      const year = yearsComparable ? metadata(candidate.code).year : 0
      if (!yearGroups.has(year)) yearGroups.set(year, [])
      yearGroups.get(year).push(candidate)
    }
    return [...yearGroups.entries()].sort(([a], [b]) => a - b).flatMap(([, peers]) => {
      const termsComparable = yearsComparable && peers.every(c => ['1C', '2C'].includes(metadata(c.code).term))
      return peers.sort((a, b) => (termsComparable ? compareCode(metadata(a.code).term, metadata(b.code).term) : 0)
        || compareCode(a.code, b.code))
    })
  })
}

// End-of-period exams use one snapshot: neither array order nor another exam in
// this same boundary can satisfy a missing prerequisite retroactively.
export function applyPlannedEvents(subjects, statusMap, events, period) {
  const next = { ...statusMap }, applied = [], rejected = []
  for (const event of events.filter(e => comparePeriods(e.period, period) === 0)) {
    const subject = subjects.find(s => s.code === event.code)
    if (!subject || !isCourse(subject) || getStatus(statusMap, event.code) !== 'Regularizada' || !canTakeFinal(subject, statusMap, subjects)) {
      rejected.push({ code: event.code, period: { ...event.period }, reason: 'FINAL_NOT_AVAILABLE',
        subjectStatus: getStatus(statusMap, event.code), missingApproved: subject ? missingFinalPrereqs(subject, statusMap, subjects) : [] })
    } else { next[event.code] = 'Aprobada'; applied.push(event.code) }
  }
  return { statusMap: next, applied: applied.sort(compareCode), rejected }
}

export function summarizeProjection(subjects, statusMap, periods) {
  const unfinishedCourses = subjects.filter(s => isCourse(s) && ['Pendiente', 'Cursando'].includes(getStatus(statusMap, s.code))).map(s => s.code)
  const pendingFinals = subjects.filter(s => isCourse(s) && getStatus(statusMap, s.code) === 'Regularizada').map(s => ({ code: s.code,
    available: canTakeFinal(s, statusMap, subjects), missingApproved: missingFinalPrereqs(s, statusMap, subjects) }))
  const lastCourse = periods.filter(p => p.completedCourses.length).at(-1)
  const lastFinal = periods.filter(p => p.approvedFinals.length).at(-1)
  const academicComplete = subjects.every(s => getStatus(statusMap, s.code) === 'Aprobada')
  const pendingActivities = subjects.filter(s => !isCourse(s) && getStatus(statusMap, s.code) !== 'Aprobada')
    .map(s => ({ code: s.code, status: getStatus(statusMap, s.code), eligible: canCourse(s, statusMap), ...missingCoursePrereqs(s, statusMap) }))
  return { coursesComplete: !unfinishedCourses.length, academicComplete, unfinishedCourses, pendingFinals, pendingActivities,
    estimatedCourseEnd: unfinishedCourses.length ? null : lastCourse?.period ?? null,
    estimatedAcademicEnd: academicComplete ? lastFinal?.period ?? lastCourse?.period ?? null : null }
}

export function projectCareer(input) {
  const errors = validateProjectionInputs(input)
  const { career, scenario } = input ?? {}
  let statusMap = { ...(input?.statusMap ?? {}) }
  const eventDiagnostics = (Array.isArray(scenario?.finalEvents) ? scenario.finalEvents : []).map((event, eventIndex) => ({
    eventIndex, code: event?.code ?? null, period: event?.period ? { ...event.period } : null,
    status: 'not-reached', reason: 'SIMULATION_STOPPED',
  }))
  const placementDiagnostics = (Array.isArray(scenario?.manualPeriods) ? scenario.manualPeriods : [])
    .flatMap(item => (Array.isArray(item?.codes) ? item.codes : []).map(code => ({ code, period: { ...item.period }, status: 'not-reached', reason: 'SIMULATION_STOPPED' })))
  if (errors.length) return { outcome: 'invalid', errors, periods: [], statusMap, summary: null,
    blockers: [], eligiblePending: [], continuations: [], placementDiagnostics: placementDiagnostics.map(d => ({ ...d, status: 'invalid', reason: 'INVALID_INPUT' })),
    eventDiagnostics: eventDiagnostics.map(e => ({ ...e, status: 'invalid', reason: 'INVALID_INPUT' })) }
  const { subjects } = career, graph = buildRequirementGraph(subjects), periods = [], active = new Map()
  const capacityAt = period => scenario.capacities?.find(c => comparePeriods(c.period, period) === 0)?.capacity ?? scenario.initialCapacity
  const manualAt = period => scenario.manualPeriods?.find(m => comparePeriods(m.period, period) === 0)
  const reserved = new Set(placementDiagnostics.map(d => d.code))
  // Stage 1 assumption: ALL subjects already Cursando finish at the first close,
  // including an annual subject whose historical start date is unavailable.
  for (const s of subjects) if (isCourse(s) && getStatus(statusMap, s.code) === 'Cursando') active.set(s.code, periodIndex(scenario.startPeriod))
  const canStartAt = (subject, period) => getAllowedStartTerms(subject).includes(period.term)
  let outcome = 'horizon', period = { ...scenario.startPeriod }
  if (subjects.every(s => getStatus(statusMap, s.code) === 'Aprobada')) outcome = 'complete'
  else for (let index = 0; index < (scenario.maxPeriods ?? 40); index++) {
    const manual = manualAt(period), continuing = [...active.keys()].sort(compareCode)
    const readOnly = index === 0 && continuing.length > 0
    // Edited periods are exact selections of starts, plus mandatory continuations.
    const capacity = readOnly ? continuing.length : manual ? manual.codes.length + continuing.length : capacityAt(period)
    if (continuing.length > capacity) { outcome = 'capacity-conflict'; errors.push({ code: 'CAPACITY_BELOW_CONTINUING', period: { ...period }, continuing }); break }
    const ranked = rankProjectionCandidates(subjects, statusMap, graph)
    const periodBlockers = subjects.filter(s => isCourse(s) && getStatus(statusMap, s.code) === 'Pendiente' && !canCourse(s, statusMap))
      .map(s => ({ code: s.code, ...missingCoursePrereqs(s, statusMap) }))
    const started = [], ranking = [], eligibleNotSelected = []
    const temporalReason = subject => !canStartAt(subject, period) ? 'START_TERM'
      : getProjectionDuration(career, subject) === 2 && !manualAt(advancePeriod(period))
        && capacityAt(advancePeriod(period)) <= [...active.values()].filter(end => end > periodIndex(period)).length ? 'CONTINUATION_CAPACITY' : null
    if (manual) for (const code of manual.codes) {
      const subject = subjects.find(s => s.code === code)
      const reason = getStatus(statusMap, code) !== 'Pendiente' ? 'NOT_PENDING'
        : !canCourse(subject, statusMap) ? 'ACADEMIC_REQUIREMENTS' : temporalReason(subject)
          || (started.length + continuing.length >= capacity ? 'CAPACITY' : null)
      const diagnostic = placementDiagnostics.find(d => d.code === code)
      Object.assign(diagnostic, { status: reason ? 'blocked' : 'applied', reason: reason || 'PLACED',
        ...missingCoursePrereqs(subject, statusMap), allowedStartTerms: getAllowedStartTerms(subject) })
      if (!reason) {
        started.push(code); ranking.push(ranked.find(c => c.code === code))
        active.set(code, periodIndex(period) + getProjectionDuration(career, subject) - 1)
      }
    }
    for (const candidate of ranked) {
      if (started.includes(candidate.code)) continue
      const subject = subjects.find(s => s.code === candidate.code)
      const duration = getProjectionDuration(career, subject)
      const reason = temporalReason(subject) || (manual ? 'MANUAL_SELECTION' : reserved.has(subject.code) ? 'RESERVED_MANUAL_PERIOD' : null)
        || (started.length + continuing.length >= capacity ? 'CAPACITY_AFTER_RANKING' : null)
      if (reason) { eligibleNotSelected.push({ code: subject.code, reason }); continue }
      started.push(subject.code); ranking.push(candidate)
      active.set(subject.code, periodIndex(period) + duration - 1)
    }
    const next = { ...statusMap }
    for (const code of started) next[code] = 'Cursando'
    const completedCourses = []
    for (const [code, end] of active) if (end === periodIndex(period)) {
      next[code] = 'Regularizada'; completedCourses.push(code); active.delete(code)
    }
    const finals = applyPlannedEvents(subjects, next, scenario.finalEvents ?? [], period)
    for (const diagnostic of eventDiagnostics.filter(e => comparePeriods(e.period, period) === 0)) {
      const rejection = finals.rejected.find(e => e.code === diagnostic.code)
      Object.assign(diagnostic, rejection ? { ...rejection, status: 'blocked' }
        : { status: 'applied', reason: 'APPROVED_AT_PLANNED_CLOSE', missingApproved: [] })
    }
    statusMap = finals.statusMap
    periods.push({ period: { ...period }, readOnly, capacity, started, continuing, completedCourses: completedCourses.sort(compareCode),
      approvedFinals: finals.applied, rejectedFinals: finals.rejected, ranking, eligibleNotSelected,
      blockers: periodBlockers,
      addCandidates: readOnly ? [] : ranked.filter(c => !started.includes(c.code) && !temporalReason(subjects.find(s => s.code === c.code))).map(c => c.code),
      statusMap: { ...statusMap } })
    if (finals.rejected.length) { outcome = 'invalid-event'; errors.push(...finals.rejected); break }
    const summary = summarizeProjection(subjects, statusMap, periods)
    if (summary.academicComplete) { outcome = 'complete'; break }
    const futureFinal = (scenario.finalEvents ?? []).some(e => comparePeriods(e.period, period) > 0)
      || placementDiagnostics.some(e => comparePeriods(e.period, period) > 0)
    if (summary.coursesComplete && !futureFinal) { outcome = 'finals-pending'; break }
    if (!started.length && !completedCourses.length && !finals.applied.length && !active.size && !futureFinal) {
      const available = subjects.filter(s => isCourse(s) && getStatus(statusMap, s.code) === 'Pendiente' && canCourse(s, statusMap))
      let futureSlot = false
      for (let offset = 1; offset < (scenario.maxPeriods ?? 40) - index; offset++) {
        const future = advancePeriod(period, offset)
        if (available.some(s => (manualAt(future) ? manualAt(future).codes.includes(s.code) : !reserved.has(s.code))
          && canStartAt(s, future) && (manualAt(future) || capacityAt(future) > 0)
          && (getProjectionDuration(career, s) === 1 || capacityAt(advancePeriod(future)) > 0))) { futureSlot = true; break }
      }
      if (!futureSlot) { outcome = available.length ? 'horizon' : 'blocked'; break }
    }
    if (index + 1 < (scenario.maxPeriods ?? 40)) period = advancePeriod(period)
  }
  for (const diagnostic of eventDiagnostics.filter(e => e.status === 'not-reached')) {
    diagnostic.reason = periodIndex(diagnostic.period) >= periodIndex(scenario.startPeriod) + (scenario.maxPeriods ?? 40)
      ? 'OUTSIDE_HORIZON' : `STOPPED_${outcome.toUpperCase().replaceAll('-', '_')}`
  }
  for (const diagnostic of placementDiagnostics.filter(e => e.status === 'not-reached')) {
    diagnostic.reason = periodIndex(diagnostic.period) >= periodIndex(scenario.startPeriod) + (scenario.maxPeriods ?? 40)
      ? 'OUTSIDE_HORIZON' : 'SIMULATION_STOPPED'
  }
  const blockers = subjects.filter(s => isCourse(s) && getStatus(statusMap, s.code) === 'Pendiente' && !canCourse(s, statusMap)).map(s => ({ code: s.code,
    ...missingCoursePrereqs(s, statusMap), allowedStartTerms: getAllowedStartTerms(s) }))
  const eligiblePending = subjects.filter(s => isCourse(s) && getStatus(statusMap, s.code) === 'Pendiente' && canCourse(s, statusMap))
    .map(s => ({ code: s.code, reason: 'SIMULATION_ENDED', outcome,
      allowedStartTerms: getAllowedStartTerms(s) }))
  const continuations = [...active].map(([code, end]) => ({ code,
    expectedCompletion: { year: Math.floor(end / 2), term: end % 2 ? '2C' : '1C' } }))
  return { outcome, errors, periods, statusMap, blockers, eligiblePending, continuations, eventDiagnostics, placementDiagnostics,
    summary: summarizeProjection(subjects, statusMap, periods) }
}

// UI commands edit a scenario, never academic progress. Choices come from the
// engine's start-of-period candidates, not from React eligibility calculations.
export function editProjectionPeriod(scenario, projection, period, code, action) {
  const entry = projection.periods.find(p => comparePeriods(p.period, period) === 0)
  if (!entry || entry.readOnly || !['add', 'remove'].includes(action)) return scenario
  if (action === 'add' && !entry.addCandidates.includes(code)) return scenario
  if (action === 'remove' && !entry.started.includes(code)) return scenario
  const previous = scenario.manualPeriods ?? []
  const selected = previous.find(p => comparePeriods(p.period, period) === 0)?.codes ?? entry.started
  const codes = action === 'add' ? [...selected.filter(c => c !== code), code] : selected.filter(c => c !== code)
  return { ...scenario, manualPeriods: [
    ...previous.filter(p => comparePeriods(p.period, period) !== 0).map(p => ({ period: { ...p.period },
      codes: action === 'add' ? p.codes.filter(c => c !== code) : [...p.codes] })),
    { period: { ...period }, codes },
  ] }
}
