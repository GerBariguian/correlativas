import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { careers } from '../data/careers'
import { derivePlanningSnapshot, snapshotCompatible } from '../planningLogic'

function assertOwner(uid, user = auth.currentUser) {
  if (auth.currentUser?.uid !== uid || auth.currentUser !== user) throw new Error('La sesión cambió. Volvé a ingresar.')
}

function getCareer(id) {
  const career = careers.find((item) => item.id === id)
  if (!career) throw new Error('La carrera no está disponible.')
  return career
}

export async function savePlanningProgress(uid, careerId, statusMap) {
  assertOwner(uid)
  const user = auth.currentUser
  const career = getCareer(careerId)
  const sharingRef = doc(db, 'planningSharing', uid)
  const progressRef = doc(db, 'users', uid, 'careers', careerId)
  await runTransaction(db, async (transaction) => {
    assertOwner(uid, user)
    const sharing = await transaction.get(sharingRef)
    assertOwner(uid, user)
    const now = serverTimestamp()
    transaction.set(progressRef, { statusMap, updatedAt: now }, { mergeFields: ['statusMap', 'updatedAt'] })
    if (sharing.data()?.enabled && sharing.data().sharedCareerId === careerId) {
      transaction.set(doc(db, 'planningSnapshots', uid, 'careers', careerId),
        derivePlanningSnapshot(career, statusMap, now, now, sharing.data().consentVersion === 2))
    }
  })
}

export async function setPlanningSharing(uid, careerId, enabled) {
  assertOwner(uid)
  const user = auth.currentUser
  const career = getCareer(careerId)
  await runTransaction(db, async (transaction) => {
    assertOwner(uid, user)
    const sharingRef = doc(db, 'planningSharing', uid)
    // Reading consent serializes enable/disable against concurrent progress writes.
    await transaction.get(sharingRef)
    const progressRef = doc(db, 'users', uid, 'careers', careerId)
    const progress = enabled ? await transaction.get(progressRef) : null
    assertOwner(uid, user)
    const now = serverTimestamp()
    if (enabled) {
      const statusMap = progress.data()?.statusMap ?? career.initialStatus
      const sourceTime = progress.data()?.updatedAt ?? now
      if (!progress.data()?.updatedAt) {
        transaction.set(progressRef, { statusMap, updatedAt: now }, { mergeFields: ['statusMap', 'updatedAt'] })
      }
      transaction.set(doc(db, 'planningSnapshots', uid, 'careers', careerId),
        derivePlanningSnapshot(career, statusMap, sourceTime, now, true))
    }
    transaction.set(sharingRef, { enabled, sharedCareerId: careerId, consentVersion: 2, updatedAt: now })
  })
}

export function subscribePlanningSharing(uid, onData, onError) {
  return onSnapshot(doc(db, 'planningSharing', uid), { includeMetadataChanges: true },
    (snapshot) => onData(snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites
      ? null : snapshot.exists() ? snapshot.data() : { enabled: false }), onError)
}

// Read only the selected friend's derived data. Never fetch their private progress.
export function subscribePlanningComparison(uid, career, onData) {
  let live = true
  let stopSnapshot = () => {}
  let generation = 0
  const stopSharing = subscribePlanningSharing(uid, (sharing) => {
    if (!live) return
    const request = ++generation
    stopSnapshot()
    stopSnapshot = () => {}
    if (!sharing) return onData({ state: 'unavailable' })
    if (!sharing.enabled) return onData({ state: 'disabled' })
    if (sharing.sharedCareerId !== career.id) return onData({ state: 'incompatible' })
    onData({ state: 'loading' })
    stopSnapshot = onSnapshot(doc(db, 'planningSnapshots', uid, 'careers', career.id),
      { includeMetadataChanges: true }, (snapshot) => {
        if (request !== generation) return
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return onData({ state: 'unavailable' })
        if (!snapshot.exists() || !snapshotCompatible(snapshot.data(), career)
          || (snapshot.data().schemaVersion === 2 && sharing.consentVersion !== 2)) return onData({ state: 'stale' })
        onData({ state: 'ready', snapshot: snapshot.data() })
      }, () => { if (request === generation) onData({ state: 'stale' }) })
  }, () => {
    if (!live) return
    generation++
    stopSnapshot()
    onData({ state: 'unavailable' })
  })
  return () => { live = false; generation++; stopSharing(); stopSnapshot() }
}
