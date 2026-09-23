import { isActivityWithinHorizon, getUnreadBadgeCount } from './activityLogic'

const emptyStream = status => ({ status, items: [], diagnostics: [], atLimit: false, error: null })
// Shell owns ONE instance. Consumers observe state; observing never starts queries.
// Dependencies are injected so lifecycle can be exercised without React/Firestore.
export function createActivitySession({ repository, now, schedule = callback => globalThis.setInterval(callback, 60000), cancel = id => globalThis.clearInterval(id) }) {
  let user = null, generation = 0, stops = [], timer = null, disposed = false
  let recent = emptyStream('idle'), unread = emptyStream('idle')
  let state = { recent, unread, badge: null }
  const observers = new Set()
  function publish() {
    const time = now()
    const visible = stream => ({ ...stream, items: stream.items.filter(item => isActivityWithinHorizon(item, time)) })
    const r = visible(recent), u = visible(unread)
    // A clock behind server time can hide newer rows that occupy the query limit.
    const futureUnread = unread.items.some(item => item.createdAt.seconds > time.seconds
      || (item.createdAt.seconds === time.seconds && item.createdAt.nanoseconds > time.nanoseconds))
    state = { recent: r, unread: u, badge: u.status === 'ready' && !u.diagnostics.length && !futureUnread ? getUnreadBadgeCount(u.items) : null }
    observers.forEach(callback => callback(state))
  }
  function stop() {
    generation++
    stops.forEach(unsubscribe => unsubscribe()); stops = []
    if (timer !== null) cancel(timer)
    timer = null
  }
  let repo = null
  function start() {
    stop(); repo = null
    recent = emptyStream(user ? 'loading' : 'idle'); unread = emptyStream(user ? 'loading' : 'idle'); publish()
    if (!user) return
    const current = generation
    try { repo = repository(user.uid) } catch {
      recent = { ...emptyStream('error'), error: 'unauthenticated' }
      unread = { ...emptyStream('error'), error: 'unauthenticated' }; publish(); return
    }
    for (const mode of ['recent', 'unread']) {
      const update = value => {
        if (disposed || generation !== current) return
        if (mode === 'recent') recent = value; else unread = value
        publish()
      }
      try { stops.push(repo.subscribe(mode, value => update({ ...value, error: null }), error => update({ ...emptyStream('error'), error }))) }
      catch { update({ ...emptyStream('error'), error: 'unknown' }) }
    }
    timer = schedule(() => { if (!disposed && generation === current) publish() })
  }
  return {
    getState: () => state,
    observe(callback) { observers.add(callback); return () => observers.delete(callback) },
    setUser(nextUser) {
      if (disposed || nextUser === user) return
      user = nextUser; start()
    },
    retry() { if (!disposed) start() },
    async markRead(item) {
      if (disposed || !repo) return { status: 'error', error: 'unauthenticated' }
      const current = generation
      try {
        const status = await repo.markRead(item.itemId, item.instanceKey)
        return current === generation && !disposed ? { status } : { status: 'cancelled' }
      } catch (error) {
        const allowed = ['permission-denied','unauthenticated','unavailable','failed-precondition','aborted','invalid-document','invalid-argument']
        return current === generation && !disposed ? { status: 'error', error: allowed.includes(error?.code) ? error.code : 'unknown' } : { status: 'cancelled' }
      }
    },
    dispose() { stop(); disposed = true; user = null; repo = null; recent = emptyStream('idle'); unread = emptyStream('idle'); publish(); observers.clear() },
  }
}
