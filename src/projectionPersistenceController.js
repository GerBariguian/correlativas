import { normalizeProjectionScenario, projectionKey } from './projectionPersistenceLogic'

// One controller per authenticated session + career, owned above route navigation.
export function createProjectionController(repository, notify = () => {}, clock = {
  // Browser timers require the global receiver, not our clock adapter as `this`.
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: id => globalThis.clearTimeout(id),
}) {
  let state = { phase: 'loading', scenario: null, error: null }, revision = null, confirmed = null
  let alive = true, timer = null, flight = null, resetting = false, ready = false, loading = false
  const emit = patch => { if (alive) { state = { ...state, ...patch }; notify() } }
  let timerGeneration = 0
  const cancel = () => {
    timerGeneration++
    const previous = timer; timer = null
    if (previous !== null) clock.clearTimeout(previous)
  }
  const errorPhase = error => error.message === 'PROJECTION_CONFLICT' ? 'conflict' : 'error'
  async function load() {
    if (!alive || loading || flight || resetting || (ready && !['saved', 'empty', 'load-error'].includes(state.phase))) return
    loading = true
    emit({ phase: 'loading', error: null })
    try {
      const data = await repository.load()
      if (!alive) return
      revision = data?.revisionToken ?? null
      confirmed = data ? projectionKey(data.scenario) : null
      ready = true
      emit({ scenario: data?.scenario ?? null, phase: data ? 'saved' : 'empty' })
    } catch (error) { emit({ phase: 'load-error', error: error.message }) }
    finally { loading = false }
  }
  function schedule() {
    try {
      cancel()
      const generation = timerGeneration
      timer = clock.setTimeout(() => {
        if (generation !== timerGeneration) return
        timer = null; flush()
      }, 800)
    } catch (error) {
      // Retain the latest draft and expose retry instead of remaining in Saving.
      emit({ phase: 'error', error: error.message })
    }
  }
  async function flush() {
    if (!alive || !ready || resetting || flight || state.phase === 'conflict' || !state.scenario) return
    const scenario = state.scenario, key = projectionKey(scenario)
    if (key === confirmed) { emit({ phase: 'saved', error: null }); return }
    emit({ phase: 'saving', error: null })
    const operation = repository.save(scenario, revision, () => alive)
    flight = operation
    let success = false
    try {
      const next = await operation
      if (!alive) return
      revision = next; confirmed = key; success = true
    } catch (error) { emit({ phase: errorPhase(error), error: error.message }) }
    finally { flight = null }
    if (alive && success && !resetting) {
      if (projectionKey(state.scenario) === confirmed) emit({ phase: 'saved' })
      else { emit({ phase: 'saving' }); schedule() }
    }
  }
  const api = {
    getState: () => state,
    load,
    change(scenario) {
      if (!alive || !ready || resetting) return
      const next = normalizeProjectionScenario(scenario)
      if (state.scenario && projectionKey(state.scenario) === projectionKey(next)) return
      const first = state.scenario === null
      const conflict = state.phase === 'conflict'
      emit({ scenario: next, phase: conflict ? 'conflict' : 'saving', resetFailed: false })
      if (conflict) return
      if (first) flush(); else schedule()
    },
    retry() { if (state.phase === 'load-error') return load(); if (state.phase === 'error') return state.resetFailed ? api.reset() : flush() },
    async reset() {
      if (!alive || !ready || resetting || state.phase === 'conflict') return
      resetting = true; cancel(); emit({ phase: 'resetting' })
      if (flight) { try { await flight } catch { /* flush records the failure */ } }
      if (!alive) return
      if (state.phase === 'conflict') { resetting = false; return }
      try {
        await repository.reset(revision, () => alive)
        if (!alive) return
        revision = null; confirmed = null
        emit({ scenario: null, phase: 'empty', error: null, resetFailed: false })
      } catch (error) { emit({ phase: errorPhase(error), error: error.message, resetFailed: true }) }
      finally { resetting = false }
    },
    dispose() { alive = false; cancel() },
  }
  return api
}
