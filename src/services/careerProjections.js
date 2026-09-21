import { doc, getDocFromServer, runTransaction, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { decodeProjection, encodeProjectionScenario } from '../projectionPersistenceLogic'

export function projectionRepository(uid, careerId) {
  const user = auth.currentUser
  const check = () => { if (!user || user.uid !== uid || auth.currentUser !== user) throw new Error('PROJECTION_SESSION_CHANGED') }
  const ref = doc(db, 'users', uid, 'careerProjections', careerId)
  return {
    async load() {
      check()
      const snap = await getDocFromServer(ref)
      check()
      return snap.exists() ? decodeProjection(snap.data(), careerId) : null
    },
    async save(scenario, expected, isLive = () => true) {
      const normalized = encodeProjectionScenario(scenario)
      const revisionToken = crypto.randomUUID()
      await runTransaction(db, async tx => {
        check()
        const snap = await tx.get(ref)
        check()
        if (!isLive()) throw new Error('PROJECTION_SESSION_CHANGED')
        if ((snap.exists() ? snap.data().revisionToken : null) !== expected) throw new Error('PROJECTION_CONFLICT')
        tx.set(ref, { schemaVersion: 2, careerId, revisionToken, scenario: normalized, updatedAt: serverTimestamp() })
      })
      check()
      return revisionToken
    },
    async reset(expected, isLive = () => true) {
      await runTransaction(db, async tx => {
        check()
        const snap = await tx.get(ref)
        check()
        if (!isLive()) throw new Error('PROJECTION_SESSION_CHANGED')
        if ((snap.exists() ? snap.data().revisionToken : null) !== expected) throw new Error('PROJECTION_CONFLICT')
        if (snap.exists()) tx.delete(ref)
      })
      check()
    },
  }
}
