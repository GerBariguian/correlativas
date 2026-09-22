import { evaluatePlannerSelection, preparePlannerEvaluationContext, evaluatePreparedPlannerSelection } from './plannerLogic.js'

const canonical = codes => [...new Set(codes)].sort()
const compareList = (a, b) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
  }
  return a.length - b.length
}
const difference = (a, b) => a.filter(code => !b.includes(code))
const warningDetails = evaluation => evaluation.selection.filter(s => s.warnings.length || s.errors.length)
  .map(s => ({ code: s.code, warnings: [...s.warnings], errors: [...s.errors] }))

// Count with exact integers; never materialize combinations to count them.
function combinationCount(m, n) {
  let count = 1n
  for (let i = 1; i <= Math.min(n, m - n); i++) count = count * BigInt(m - i + 1) / BigInt(i)
  return count
}
function* combinations(items, n, start = 0, prefix = []) {
  if (!n) { yield prefix; return }
  for (let i = start; i <= items.length - n; i++) yield* combinations(items, n - 1, i + 1, [...prefix, items[i]])
}

// Only read the academic evaluator's explanations; do not simulate here.
export function summarizePlannerImpact(evaluation) {
  const pairs = new Map()
  for (const entry of evaluation.completion.partialProgress) {
    for (const type of ['regularized', 'approved']) for (const requirement of entry.satisfied[type]) {
      const pair = { code: entry.code, type, requirement }
      pairs.set(JSON.stringify([entry.code, type, requirement]), pair)
    }
  }
  const partialPairs = [...pairs.entries()].sort(([a], [b]) => compareList([a], [b])).map(([, pair]) => pair)
  const selected = new Set(evaluation.selection.map(s => s.code))
  const validSelected = new Set(evaluation.selection.filter(s => s.selectable).map(s => s.code))
  const directPendingCodes = canonical(evaluation.directDependencies.filter(d => validSelected.has(d.code))
    .flatMap(d => d.dependents.filter(s => s.status === 'Pendiente' && !selected.has(s.code)).map(s => s.code)))
  return { closeCodes: evaluation.close.newEligibility.map(e => e.code),
    annualCodes: evaluation.annualAdditional.newEligibility.map(e => e.code), partialPairs, directPendingCodes,
    completionCodes: evaluation.completion.newEligibility.map(e => e.code),
    completionAdditionalCodes: evaluation.completion.additionalEligibility.map(e => e.code),
    criteria: [evaluation.close.newEligibility.length, evaluation.completion.additionalEligibility.length, partialPairs.length, directPendingCodes.length] }
}

export function comparePlannerSelections({ subjects, statusMap, targetPeriod, selectedCodes, proposedCodes } = {}) {
  const current = evaluatePlannerSelection({ subjects, statusMap, targetPeriod, selectedCodes })
  const proposed = evaluatePlannerSelection({ subjects, statusMap, targetPeriod, selectedCodes: proposedCodes })
  if (!current.valid || !proposed.valid) return { valid: false, current, proposed }
  const before = summarizePlannerImpact(current), after = summarizePlannerImpact(proposed)
  const pairKey = pair => JSON.stringify([pair.code, pair.type, pair.requirement])
  const beforeKeys = new Set(before.partialPairs.map(pairKey)), afterKeys = new Set(after.partialPairs.map(pairKey))
  return { valid: true, current, proposed, currentImpact: before, proposedImpact: after,
    enteredCodes: difference(canonical(proposedCodes), canonical(selectedCodes)),
    removedCodes: difference(canonical(selectedCodes), canonical(proposedCodes)),
    close: { gained: difference(after.closeCodes, before.closeCodes), lost: difference(before.closeCodes, after.closeCodes), delta: after.closeCodes.length - before.closeCodes.length },
    annualAdditional: { gained: difference(after.annualCodes, before.annualCodes), lost: difference(before.annualCodes, after.annualCodes), delta: after.annualCodes.length - before.annualCodes.length },
    completionAdditional: { gained: difference(after.completionAdditionalCodes, before.completionAdditionalCodes), lost: difference(before.completionAdditionalCodes, after.completionAdditionalCodes), delta: after.completionAdditionalCodes.length - before.completionAdditionalCodes.length },
    partialProgress: { gained: after.partialPairs.filter(p => !beforeKeys.has(pairKey(p))), lost: before.partialPairs.filter(p => !afterKeys.has(pairKey(p))), delta: after.partialPairs.length - before.partialPairs.length },
    validCounts: { current: current.selection.filter(s => s.selectable).length, proposed: proposed.selection.filter(s => s.selectable).length },
    warnings: { current: warningDetails(current), proposed: warningDetails(proposed) } }
}

export function suggestPlannerSelection({ subjects, statusMap, selectedCodes, targetPeriod, desiredCount, budget = 20000 } = {}) {
  const base = { requestedCount: desiredCount ?? null, effectiveCount: 0, candidateCount: 0, suggestedCodes: [], evaluation: null,
    impact: null, method: 'none', evaluatedCount: 0, totalCombinationCount: null, isExhaustive: false,
    hasAcademicImprovement: null, currentSelectionEvaluated: false, warnings: [], diagnostics: [] }
  if (!Number.isSafeInteger(desiredCount) || desiredCount <= 0) return { ...base, diagnostics: ['INVALID_DESIRED_COUNT'] }
  if (!Number.isSafeInteger(budget) || budget <= 0) return { ...base, diagnostics: ['INVALID_BUDGET'] }
  const current = evaluatePlannerSelection({ subjects, statusMap, selectedCodes, targetPeriod })
  if (!current.valid) return { ...base, diagnostics: ['INVALID_CONTEXT'], errors: current.errors }
  const context = preparePlannerEvaluationContext({ subjects, statusMap, targetPeriod })
  // Classifications from the same evaluator determine candidates; this all-codes
  // probe is setup, not a searched combination or a ranking evaluation.
  const all = evaluatePreparedPlannerSelection(context, subjects.map(s => s.code))
  const candidates = all.selection.filter(s => s.selectable).map(s => s.code)
  base.candidateCount = candidates.length
  if (!candidates.length) return { ...base, diagnostics: ['NO_CANDIDATES'] }
  const n = Math.min(desiredCount, candidates.length)
  base.effectiveCount = n
  if (desiredCount > n) base.diagnostics.push('FEWER_CANDIDATES_THAN_REQUESTED')
  const total = combinationCount(candidates.length, n)
  base.totalCombinationCount = total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : total.toString()
  const exhaustive = total <= 20000n
  base.method = exhaustive ? 'exhaustive' : 'bounded'
  const limit = exhaustive ? Number(total) : budget
  const selected = canonical(selectedCodes)
  const preserve = selected.length === n
  const currentEligible = preserve && selected.every(c => candidates.includes(c))
  const byCode = new Map(subjects.map(s => [s.code, s]))
  // A single comparability decision avoids non-transitive pairwise fallbacks.
  const compareYears = candidates.every(c => Number.isSafeInteger(byCode.get(c).year) && byCode.get(c).year > 0)
  const academicCompare = (a, b) => compareList(a.impact.criteria, b.impact.criteria)
  const better = (a, b) => {
    if (!b) return true
    const academic = academicCompare(a, b)
    if (academic) return academic > 0
    if (preserve && a.retained !== b.retained) return a.retained > b.retained
    if (compareYears) {
      const years = compareList(a.years, b.years)
      if (years) return years < 0
    }
    return compareList(a.codes, b.codes) < 0
  }
  const seen = new Set()
  let chosen = null, currentResult = null
  const evaluate = codes => {
    const ordered = canonical(codes), key = JSON.stringify(ordered)
    if (seen.has(key) || seen.size >= limit) return
    seen.add(key)
    const evaluation = currentEligible && compareList(ordered, selected) === 0 ? current
      : evaluatePreparedPlannerSelection(context, ordered)
    const result = { codes: ordered, evaluation, impact: summarizePlannerImpact(evaluation),
      retained: ordered.filter(c => selected.includes(c)).length,
      years: compareYears ? ordered.map(c => byCode.get(c).year).sort((a, b) => a - b) : [] }
    if (currentEligible && compareList(ordered, selected) === 0) currentResult = result
    if (better(result, chosen)) chosen = result
  }
  if (currentEligible) evaluate(selected)
  if (exhaustive) {
    for (const codes of combinations(candidates, n)) evaluate(codes)
  } else {
    // Full-size deterministic seeds, then marginal exchanges. No individual
    // ranking is mistaken for a combination's impact.
    const complete = seed => [...seed, ...candidates.filter(c => !seed.includes(c))].slice(0, n)
    evaluate(complete([]))
    const seeds = new Map()
    for (const item of all.selection) {
      const missing = item.missing
      if (!missing || item.kind === 'activity' || missing.approved.length || !missing.regularized.length) continue
      const seed = missing.regularized
      if (seed.length <= n && seed.every(c => candidates.includes(c))) seeds.set(JSON.stringify(seed), seed)
    }
    for (const [, seed] of [...seeds].sort(([a], [b]) => compareList([a], [b]))) {
      if (seen.size >= limit) break
      evaluate(complete(seed))
    }
    for (const code of candidates) {
      if (seen.size >= limit) break
      evaluate(complete([code]))
    }
    // Restart neighborhoods only after a strictly better full combination.
    while (seen.size < limit) {
      const anchor = chosen
      const outside = candidates.filter(c => !anchor.codes.includes(c))
      for (const count of [1, 2]) {
        if (count > n || count > outside.length) continue
        search: for (const removed of combinations(anchor.codes, count)) {
          for (const added of combinations(outside, count)) {
            if (seen.size >= limit) break search
            evaluate([...anchor.codes.filter(c => !removed.includes(c)), ...added])
          }
        }
      }
      if (chosen === anchor) break
    }
  }
  return { ...base, suggestedCodes: chosen.codes, evaluation: chosen.evaluation, impact: chosen.impact,
    evaluatedCount: seen.size, isExhaustive: exhaustive,
    currentSelectionEvaluated: currentResult !== null,
    hasAcademicImprovement: currentResult ? academicCompare(chosen, currentResult) > 0 : null,
    warnings: warningDetails(chosen.evaluation) }
}
