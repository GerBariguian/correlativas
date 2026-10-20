import { onboardingScopeKey } from '../../src/academicOnboardingLogic.js'
export function queryIdentity(scope) {
  if (scope === null) return { scope: null, key: null }
  const key = onboardingScopeKey(scope)
  return { scope: Object.freeze(JSON.parse(key)), key }
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
const empty = (state, fields = {}) => Object.freeze({ state, ...fields })
// Logical cancellation only: an outstanding SDK request may continue running.
export function createAcademicQueryController() {
  let snapshot = empty('idle'), generation = 0, binding = null
  const observers = new Set()
  function publish(value) { snapshot = value; for (const listener of [...observers]) listener() }
  const current = (b, token) => binding === b && generation === token && b.connection.isCurrent()
  async function execute(b) {
    const token = ++generation
    publish(empty('loading', { scope: b.scope, key: b.key, connectionId: b.connection.id }))
    try {
      const result = await b.connection.readProgress(b.scope)
      if (!current(b, token)) return
      if (!['loaded', 'absent', 'error', 'blocked', 'archived'].includes(result?.state)
        || queryIdentity(result.scope).key !== b.key) throw Error('C3_INVALID_RESULT')
      const fields = { scope: b.scope, key: b.key, connectionId: b.connection.id }
      if (result.state === 'loaded') {
        if (!result.progress || typeof result.progress.statusMap !== 'object' || result.progress.statusMap === null || Array.isArray(result.progress.statusMap)) throw Error('C3_INVALID_RESULT')
        fields.progress = freeze(structuredClone(result.progress))
      } else {
        if (result.reason) fields.reason = result.reason
        if (result.code) fields.code = result.code
      }
      publish(empty(result.state, fields))
    } catch (error) {
      if (current(b, token)) publish(empty('error', { scope: b.scope, key: b.key, connectionId: b.connection.id, code: error.code ?? error.message ?? 'C3_READ_FAILED' }))
    }
  }
  function cancel() { generation++; const previous = binding; binding = null; previous?.detach?.(); publish(empty('idle')) }
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) { observers.add(listener); return () => observers.delete(listener) },
    start(connection, input) {
      cancel()
      let identity
      try { identity = queryIdentity(input) } catch { publish(empty('error', { code: 'C3_INVALID_SCOPE' })); return () => {} }
      if (!connection || !identity.scope || !connection.isCurrent()) return () => {}
      const b = { connection, ...identity }; binding = b
      const detach = connection.subscribeInvalidation(() => { if (binding === b) cancel() })
      b.detach = detach; void execute(b)
      return () => { detach(); if (binding === b) cancel() }
    },
    refresh() { if (binding && binding.connection.isCurrent()) return execute(binding); return Promise.resolve() },
    cancel,
  })
}

// Used during render as well as in deterministic tests. No effect is needed to hide stale data.
export function academicQueryView(connection, input, snapshot) {
  let identity
  try { identity = queryIdentity(input) } catch { return empty('error', { code: 'C3_INVALID_SCOPE' }) }
  if (!connection?.isCurrent() || !identity.key) return empty('idle')
  if (snapshot.connectionId === connection.id && snapshot.key === identity.key) return snapshot
  return empty('loading', { scope: identity.scope, key: identity.key, connectionId: connection.id })
}
