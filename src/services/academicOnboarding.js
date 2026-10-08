import { doc, getDocFromServer, runTransaction, serverTimestamp } from 'firebase/firestore'
import { resolveUserDataAuthority } from '../userDataAuthorityLogic'
import { mergeOnboardingChanges, onboardingScopeKey } from '../academicOnboardingLogic'
import { derivePlanningSnapshot } from '../planningLogic'

// A separate legacy writer: ordinary subject saving is deliberately unchanged.
export function legacyOnboardingRepository({ db, auth }, scope, career, assertLive) {
  const user = auth.currentUser
  onboardingScopeKey(scope)
  if (scope.model !== 'legacy' || career.id !== scope.catalogId) throw new Error('INVALID_ACADEMIC_SCOPE')
  const check = () => {
    if (!user || user.uid !== scope.uid || auth.currentUser !== user) throw new Error('ACADEMIC_SESSION_CHANGED')
    assertLive()
  }
  const target = doc(db, 'users', scope.uid, 'careers', scope.id)
  const control = doc(db, 'migrationUsers', scope.uid)
  const consent = doc(db, 'planningSharing', scope.uid)
  const decode = snap => {
    const statusMap = snap.exists() ? snap.data().statusMap : null
    if (snap.exists() && statusMap === null) throw new Error('INVALID_ACADEMIC_PROGRESS')
    // Validate before claiming a successful read; undefined is never absence.
    mergeOnboardingChanges({ scope, entries: [] }, scope, { state: 'loaded', statusMap })
    return { statusMap, revision: null }
  }
  return {
    async load() {
      check(); const snap = await getDocFromServer(target); check(); return decode(snap)
    },
    async save(changes) {
      check()
      const result = await runTransaction(db, async tx => {
        check()
        const authority = await tx.get(control)
        const context = resolveUserDataAuthority(scope.uid, authority.exists() ? authority.data() : null)
        if (context.authority !== 'legacy' || !context.capabilities.academicWrite) throw new Error('ACADEMIC_AUTHORITY_CHANGED')
        const previous = decode(await tx.get(target))
        const statusMap = mergeOnboardingChanges(changes, scope, { state: 'loaded', statusMap: previous.statusMap })
        if (!changes.entries.length) { check(); return previous }
        const sharing = await tx.get(consent)
        check()
        const now = serverTimestamp()
        tx.set(target, { statusMap, updatedAt: now }, { mergeFields: ['statusMap', 'updatedAt'] })
        if (sharing.data()?.enabled && sharing.data().sharedCareerId === scope.id) {
          tx.set(doc(db, 'planningSnapshots', scope.uid, 'careers', scope.id),
            derivePlanningSnapshot(career, statusMap, now, now, sharing.data().consentVersion === 2))
        }
        return { statusMap, revision: null }
      })
      check(); return result
    },
  }
}
