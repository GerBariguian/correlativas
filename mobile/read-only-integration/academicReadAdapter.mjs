import { doc, getDocFromServer } from 'firebase/firestore'
import { academicBridgeRepository } from '../../src/services/academicBridge.js'
import { legacyOnboardingRepository } from '../../src/services/academicOnboarding.js'
import { academicReadRepository } from './academicReadRepository.mjs'

// Existing factories contain writers; only their read closures are retained/exposed.
export function bindAcademicReads({ db, auth, uid, assertLive }) {
  const user = auth.currentUser
  const live = () => {
    assertLive()
    if (!user || auth.currentUser !== user || user.uid !== uid) throw Error('C2_SESSION_CHANGED')
  }
  const { loadProgress } = academicBridgeRepository({ db, auth }, uid)
  return academicReadRepository({ uid, assertLive: live, currentUid: () => auth.currentUser?.uid,
    readDocument: async path => {
      live()
      const snap = await getDocFromServer(doc(db, path))
      live()
      return snap.exists() ? snap.data() : null
    },
    loadProgress: scope => scope.model === 'instances' ? loadProgress(scope)
      : legacyOnboardingRepository({ db, auth }, scope, { id: scope.catalogId }, live).load(),
  })
}
