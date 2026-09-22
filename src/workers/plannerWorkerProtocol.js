import { suggestPlannerSelection, comparePlannerSelections } from '../plannerSuggestions.js'

export function runPlannerWorkerRequest({ requestId, input }) {
  try {
    const result = suggestPlannerSelection(input)
    const comparison = result.evaluation ? comparePlannerSelections({ ...input, proposedCodes: result.suggestedCodes }) : null
    return { requestId, ok: true, result, comparison }
  } catch {
    return { requestId, ok: false }
  }
}
