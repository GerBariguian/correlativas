import { STATUS } from './logic.js'

// Structural domain only: no authorization, network, clocks or browser storage.
const own = (value, key) => Object.hasOwn(value, key)
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
function fail(code) { throw Object.assign(new Error(code), { code }) }
function id(value) {
  if (typeof value !== 'string' || !value || /[\s/\x00-\x1f\x7f]/.test(value)) fail('INVALID_ONBOARDING_ID')
  return value
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
function scopeIdentity(scope) {
  if (!record(scope) || Object.keys(scope).sort().join() !== 'catalogId,id,model,uid'
    || !['legacy', 'instances'].includes(scope.model)) fail('INVALID_ONBOARDING_SCOPE')
  const result = { uid: id(scope.uid), model: scope.model, id: id(scope.id), catalogId: id(scope.catalogId) }
  if (result.model === 'legacy' && result.id !== result.catalogId) fail('INVALID_ONBOARDING_SCOPE')
  return result
}
export function onboardingScopeKey(scope) { return JSON.stringify(scopeIdentity(scope)) }
function codesOf(subjects) {
  if (!Array.isArray(subjects)) fail('INVALID_ONBOARDING_CATALOG')
  const codes = subjects.map(subject => {
    if (!record(subject)) fail('INVALID_ONBOARDING_CATALOG')
    return id(subject.code)
  })
  if (new Set(codes).size !== codes.length) fail('DUPLICATE_ONBOARDING_CODE')
  return codes
}
function status(value) {
  if (!STATUS.includes(value)) fail('INVALID_ONBOARDING_STATUS')
  return value
}
function loadedMap(progress) {
  // Only an explicitly successful read may represent an absent document.
  if (!record(progress) || progress.state !== 'loaded' || !own(progress, 'statusMap')) fail('ONBOARDING_PROGRESS_NOT_LOADED')
  if (progress.statusMap === null) return {}
  if (!record(progress.statusMap)) fail('INVALID_ONBOARDING_PROGRESS')
  return Object.fromEntries(Object.entries(progress.statusMap).map(([code, value]) => [id(code), status(value)]))
}

export function groupOnboardingSubjects(subjects) {
  codesOf(subjects)
  const groups = new Map()
  for (const subject of subjects) {
    const year = subject.year ?? null, level = subject.level ?? null, period = subject.term ?? null
    if ((year !== null && !(typeof year === 'string' && year.trim()) && !(Number.isInteger(year) && year > 0))
      || (level !== null && !(typeof level === 'string' && level.trim()))
      || (period !== null && !(typeof period === 'string' && period.trim()))) fail('INVALID_ONBOARDING_GROUP')
    // Preserve source order and actual labels, including annual/unspecified periods.
    const key = JSON.stringify([year, level, period])
    if (!groups.has(key)) groups.set(key, { year, level, period, codes: [] })
    groups.get(key).codes.push(subject.code)
  }
  return freeze([...groups.values()])
}

export function createOnboardingDraft({ scope, subjects, progress }) {
  return freeze({ scope: scopeIdentity(scope), codes: codesOf(subjects), baseline: loadedMap(progress),
    decisions: {}, selected: [], past: [], future: [] })
}
function eligible(draft, codes) {
  if (!Array.isArray(codes)) fail('INVALID_ONBOARDING_SELECTION')
  const unique = [...new Set(codes)]
  for (const code of unique) {
    id(code)
    if (!draft.codes.includes(code)) fail('UNKNOWN_ONBOARDING_CODE')
    if (own(draft.baseline, code)) fail('ONBOARDING_PROGRESS_PROTECTED')
  }
  return unique
}
export function selectOnboardingSubjects(draft, codes) {
  return freeze({ ...draft, selected: eligible(draft, codes) })
}
export function decideOnboardingSubjects(draft, codes, nextStatus) {
  status(nextStatus)
  const targets = eligible(draft, codes)
  if (!targets.some(code => draft.decisions[code] !== nextStatus || !own(draft.decisions, code))) return draft
  const decisions = Object.fromEntries([...Object.entries(draft.decisions), ...targets.map(code => [code, nextStatus])])
  return freeze({ ...draft, decisions, past: [...draft.past, draft.decisions], future: [] })
}
export function assignOnboardingSelection(draft, nextStatus) {
  return decideOnboardingSubjects(draft, draft.selected, nextStatus)
}
export function undoOnboardingDecision(draft) {
  if (!draft.past.length) return draft
  return freeze({ ...draft, decisions: draft.past.at(-1), past: draft.past.slice(0, -1), future: [...draft.future, draft.decisions] })
}
export function redoOnboardingDecision(draft) {
  if (!draft.future.length) return draft
  return freeze({ ...draft, decisions: draft.future.at(-1), past: [...draft.past, draft.decisions], future: draft.future.slice(0, -1) })
}
export function onboardingReviewProgress(draft) {
  const editable = draft.codes.filter(code => !own(draft.baseline, code)).length
  const reviewed = Object.keys(draft.decisions).length
  return { total: draft.codes.length, protected: draft.codes.length - editable, editable, reviewed,
    remaining: editable - reviewed, complete: reviewed === editable, ratio: editable ? reviewed / editable : 1 }
}
export function prepareOnboardingChanges(draft, choice = 'experienced') {
  if (!['starting', 'experienced', 'later'].includes(choice)) fail('INVALID_ONBOARDING_CHOICE')
  return freeze({ scope: { ...draft.scope }, entries: choice === 'experienced'
    ? Object.entries(draft.decisions).map(([code, value]) => ({ code, status: value, expectedAbsent: true })) : [] })
}
export function mergeOnboardingChanges(changes, scope, progress) {
  if (!record(changes) || onboardingScopeKey(changes.scope) !== onboardingScopeKey(scope)) fail('ONBOARDING_SCOPE_MISMATCH')
  const current = loadedMap(progress)
  if (!Array.isArray(changes.entries)) fail('INVALID_ONBOARDING_CHANGES')
  const seen = new Set()
  for (const entry of changes.entries) {
    if (!record(entry) || Object.keys(entry).sort().join() !== 'code,expectedAbsent,status' || entry.expectedAbsent !== true) fail('INVALID_ONBOARDING_CHANGES')
    id(entry.code); status(entry.status)
    if (seen.has(entry.code)) fail('INVALID_ONBOARDING_CHANGES')
    seen.add(entry.code)
    if (own(current, entry.code)) fail('ONBOARDING_PROGRESS_CONFLICT')
  }
  // A pure merge preview, NOT a concurrency/authorization guarantee. Persistence
  // must reread and apply this within its transaction/CAS in the next stage.
  return freeze(Object.fromEntries([...Object.entries(current), ...changes.entries.map(entry => [entry.code, entry.status])]))
}
