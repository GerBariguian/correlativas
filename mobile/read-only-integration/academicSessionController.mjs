// Owns clients; consumer controllers never close a shared client.
export function createAcademicSessionController({ connect }) {
  let snapshot = Object.freeze({ state: 'idle' }), epoch = 0, active = null, disposed = false
  const observers = new Set(), closing = new WeakMap(), pendingClosures = new Set()
  let closeFailure = null
  const publish = value => { snapshot = Object.freeze(value); for (const listener of [...observers]) listener() }
  function invalidate() {
    const previous = active; active = null
    if (previous) { previous.live = false; for (const listener of [...previous.listeners]) listener(); previous.listeners.clear() }
    return previous
  }
  function close(client) {
    if (!closing.has(client)) {
      const task = Promise.resolve().then(() => client.close()).then(() => null, error => {
        closeFailure = error.code ?? error.message ?? 'C3_CLOSE_FAILED'; return closeFailure
      })
      closing.set(client, task); pendingClosures.add(task)
      void task.then(() => pendingClosures.delete(task))
    }
    return closing.get(client)
  }
  async function disconnect() {
    const token = ++epoch, previous = invalidate()
    publish({ state: 'idle' })
    const closeError = previous ? await close(previous.client) : null
    if (token === epoch && closeError) publish({ state: 'error', code: 'C3_CLOSE_FAILED', closeError })
  }
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) { observers.add(listener); return () => observers.delete(listener) },
    async connect(uid) {
      if (disposed) throw Error('C3_SESSION_DISPOSED')
      const token = ++epoch, previous = invalidate()
      publish({ state: 'loading', uid })
      if (previous) close(previous.client)
      await Promise.all([...pendingClosures])
      const closeError = closeFailure
      if (token !== epoch || disposed) return
      if (closeError) { publish({ state: 'error', code: 'C3_CLOSE_FAILED', closeError }); return }
      try {
        const client = await connect(uid)
        if (token !== epoch || disposed) {
          const error = await close(client)
          // Return cleanup diagnostics to the caller, never overwrite a newer session.
          return error ? { code: 'C3_LATE_CLOSE_FAILED', closeError: error } : undefined
        }
        const record = { client, live: true, listeners: new Set() }
        const connection = Object.freeze({
          id: Object.freeze({}), uid,
          isCurrent: () => active === record && record.live,
          readProgress: scope => active === record && record.live ? client.readProgress(scope)
            : Promise.resolve({ state: 'error', scope, code: 'C3_SESSION_CHANGED' }),
          subscribeInvalidation(listener) { record.listeners.add(listener); return () => record.listeners.delete(listener) },
        })
        active = record
        publish({ state: 'ready', uid, connection })
      } catch (error) {
        if (token === epoch && !disposed) publish({ state: 'error', code: error.code ?? error.message ?? 'C3_CONNECT_FAILED' })
      }
    },
    disconnect,
    async dispose() { disposed = true; await disconnect(); observers.clear() },
  })
}
