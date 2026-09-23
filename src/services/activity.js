import { collection, doc, query, where, orderBy, documentId, limit, onSnapshot, Timestamp, runTransaction, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { normalizeActivityItems, normalizeActivityItem, sortActivityItems, normalizeActivityTimestamp, ACTIVITY_HORIZON_SECONDS } from '../activityLogic'

export const ACTIVITY_RECENT_LIMIT = 30
export const ACTIVITY_UNREAD_LIMIT = 51
export function activityErrorCode(error) {
  const code = error?.code
  return ['permission-denied', 'unauthenticated', 'unavailable', 'failed-precondition', 'aborted', 'cancelled', 'invalid-document', 'invalid-argument'].includes(code) ? code : 'unknown'
}
function failure(code) { return Object.assign(new Error(code), { code }) }

// One repository belongs to one concrete auth session, not just a reusable uid.
export function activityRepository(uid) {
  const user = auth.currentUser
  const check = () => {
    if (!user || user.uid !== uid || !user.emailVerified || auth.currentUser !== user) throw failure('unauthenticated')
  }
  check()
  return {
    subscribe(mode, next, onError) {
      check()
      if (!['recent', 'unread'].includes(mode)) throw failure('invalid-argument')
      const now = Timestamp.now()
      const cutoff = new Timestamp(now.seconds - ACTIVITY_HORIZON_SECONDS, now.nanoseconds)
      const constraints = [where('createdAt', '>=', cutoff)]
      if (mode === 'unread') constraints.push(where('readAt', '==', null))
      constraints.push(orderBy('createdAt', 'desc'), orderBy(documentId(), 'asc'), limit(mode === 'recent' ? ACTIVITY_RECENT_LIMIT : ACTIVITY_UNREAD_LIMIT))
      let active = true
      const stop = onSnapshot(query(collection(db, 'users', uid, 'activityInbox'), ...constraints), { includeMetadataChanges: true }, snapshot => {
        if (!active) return
        try {
          check()
          // Cached data is not evidence of an empty or complete server inbox.
          if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
            next({ status: 'loading', items: [], diagnostics: [], atLimit: false })
            return
          }
          const result = normalizeActivityItems(snapshot.docs.map(d => ({ itemId: d.id, data: d.data() })))
          next({ status: 'ready', items: sortActivityItems(result.items), diagnostics: result.diagnostics,
            atLimit: snapshot.size === (mode === 'recent' ? ACTIVITY_RECENT_LIMIT : ACTIVITY_UNREAD_LIMIT) })
        } catch (error) { onError(activityErrorCode(error)) }
      }, error => { if (active) onError(activityErrorCode(error)) })
      return () => { active = false; stop() }
    },
    async markRead(itemId, expectedInstanceKey) {
      check()
      if (typeof itemId !== 'string' || itemId.includes('/') || !/^(fr_|fa_|jp_)[A-Za-z0-9_:-]+$/.test(itemId)
        || typeof expectedInstanceKey !== 'string') throw failure('invalid-argument')
      const attempt = denied => runTransaction(db, async tx => {
        check()
        const ref = doc(db, 'users', uid, 'activityInbox', itemId)
        const snapshot = await tx.get(ref)
        check()
        if (!snapshot.exists()) return 'missing'
        const parsed = normalizeActivityItem(itemId, snapshot.data())
        if (!parsed.ok) throw failure('invalid-document')
        if (parsed.item.instanceKey !== expectedInstanceKey) return 'stale'
        if (parsed.item.isRead) return 'alreadyRead'
        if (denied) throw denied
        tx.update(ref, { readAt: serverTimestamp() })
        return 'marked'
      })
      let result
      try { result = await attempt(null) } catch (error) {
        if (error?.code !== 'permission-denied') throw error
        // Rules may reject the stale write before the SDK observes its version conflict.
        // Reconcile once, read-only; never disguise a denial on a still-unread instance.
        result = await attempt(error)
      }
      check()
      return result
    },
  }
}

// SDK-free timestamp values for session horizon calculations.
export function activityNow() { return normalizeActivityTimestamp(Timestamp.now()) }
