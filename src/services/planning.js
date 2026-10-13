import { doc, getDocFromServer, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { legacyWriteRevision, nextLegacyWriteRevision } from '../legacyWriteRevision'
import { auth, db } from '../firebase'
import { careers } from '../data/careers'
import { derivePlanningSnapshot, snapshotCompatible } from '../planningLogic'
import { resolveUserDataAuthority } from '../userDataAuthorityLogic'

function assertOwner(uid, user = auth.currentUser) {
  if (auth.currentUser?.uid !== uid || auth.currentUser !== user) throw new Error('La sesión cambió. Volvé a ingresar.')
}

function getCareer(id) {
  const career = careers.find((item) => item.id === id)
  if (!career) throw new Error('La carrera no está disponible.')
  return career
}

export function legacyProgressDocument(snap) {
  if (!snap.exists()) return { exists: false, statusMap: {}, updatedAt: null, writeRevision: 0 }
  const d = snap.data()
  if (!d.statusMap || typeof d.statusMap !== 'object' || Array.isArray(d.statusMap)
    || Object.values(d.statusMap).some(s => !['Pendiente', 'Cursando', 'Regularizada', 'Aprobada'].includes(s))) throw new Error('INVALID_ACADEMIC_PROGRESS')
  return { exists: true, statusMap: { ...d.statusMap }, writeRevision: legacyWriteRevision(d), updatedAt: d.updatedAt && Number.isInteger(d.updatedAt.seconds) ? { seconds: d.updatedAt.seconds, nanoseconds: d.updatedAt.nanoseconds } : d.updatedAt ?? null }
}

export function applyLegacyOperations(current, command) {
  const conflict = () => { throw new Error('ACADEMIC_PROGRESS_CONFLICT') }
  const sameMap = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.hasOwn(b, k) && a[k] === b[k])
  const validMap = m => m && typeof m === 'object' && !Array.isArray(m) && Object.values(m).every(s => ['Pendiente', 'Cursando', 'Regularizada', 'Aprobada'].includes(s))
  if (command?.type === 'reset') {
    const e = command.expected
    if (!e || typeof e.exists !== 'boolean' || !validMap(e.statusMap) || !validMap(command.statusMap)) throw new Error('INVALID_LEGACY_OPERATION')
    if (e.writeRevision !== current.writeRevision || e.exists !== current.exists || !sameMap(e.statusMap, current.statusMap)
      || JSON.stringify(e.updatedAt) !== JSON.stringify(current.updatedAt)) conflict()
    return { ...command.statusMap }
  }
  if (command?.type !== 'patch' || !Array.isArray(command.operations)) throw new Error('INVALID_LEGACY_OPERATION')
  const result = { ...current.statusMap }, seen = new Set()
  for (const op of command.operations) {
    if (!op || typeof op.code !== 'string' || !op.code || seen.has(op.code) || !['set', 'delete'].includes(op.operation)
      || typeof op.expected?.exists !== 'boolean' || (op.expected.exists && !validMap({ value: op.expected.status }))
      || (op.operation === 'set' && !validMap({ value: op.status }))) throw new Error('INVALID_LEGACY_OPERATION')
    seen.add(op.code)
    if (Object.hasOwn(current.statusMap, op.code) !== op.expected.exists
      || (op.expected.exists && current.statusMap[op.code] !== op.expected.status)) conflict()
    if (op.operation === 'delete') delete result[op.code]
    else Object.defineProperty(result, op.code, { value: op.status, enumerable: true, configurable: true, writable: true })
  }
  return result
}

export async function savePlanningProgress(uid, careerId, command, assertLive = () => {}) {
  assertOwner(uid)
  assertLive()
  const user = auth.currentUser
  const career = getCareer(careerId)
  const sharingRef = doc(db, 'planningSharing', uid)
  const progressRef = doc(db, 'users', uid, 'careers', careerId)
  // Freeze caller intent before awaits/retries; never derive intent from live data.
  const intent = structuredClone(command)
  // Rules can reject stale CAS before the SDK receives ABORTED. Retry only
  // a prepared write with independently confirmed revision advancement.
  for (let attempt = 0; ; attempt++) {
    let observedRevision = null, preparedWrite = false
    try {
      await runTransaction(db, async (transaction) => {
        preparedWrite = false; observedRevision = null
        assertOwner(uid, user)
        assertLive()
        const control = await transaction.get(doc(db, 'migrationUsers', uid))
        const authority = resolveUserDataAuthority(uid, control.exists() ? control.data() : null)
        if (authority.authority !== 'legacy' || !authority.capabilities.academicWrite) throw new Error('ACADEMIC_AUTHORITY_CHANGED')
        const progressSnapshot = await transaction.get(progressRef)
        const previous = legacyProgressDocument(progressSnapshot)
        observedRevision = previous.writeRevision
        const statusMap = applyLegacyOperations(previous, intent)
        if (Object.keys(statusMap).length === Object.keys(previous.statusMap).length
          && Object.keys(statusMap).every(code => Object.hasOwn(previous.statusMap, code) && previous.statusMap[code] === statusMap[code])) return
        const sharing = await transaction.get(sharingRef)
        assertOwner(uid, user)
        assertLive()
        const now = serverTimestamp()
        preparedWrite = true
        transaction.set(progressRef, { statusMap, updatedAt: now, writeRevision: nextLegacyWriteRevision(progressSnapshot.data()) }, { mergeFields: ['statusMap', 'updatedAt', 'writeRevision'] })
        if (sharing.data()?.enabled && sharing.data().sharedCareerId === careerId) {
          transaction.set(doc(db, 'planningSnapshots', uid, 'careers', careerId),
            derivePlanningSnapshot(career, statusMap, now, now, sharing.data().consentVersion === 2))
        }
      })
      break
    } catch (error) {
      if (error.code !== 'permission-denied' || !preparedWrite || attempt >= 3) throw error
      assertOwner(uid, user); assertLive()
      const current = legacyProgressDocument(await getDocFromServer(progressRef))
      assertOwner(uid, user); assertLive()
      if (!current.exists || current.writeRevision <= observedRevision) throw error
      // Never refresh the user's expected values, including the reset revision.
      applyLegacyOperations(current, intent)
    }
  }
  assertOwner(uid, user)
  assertLive()
  const confirmed = legacyProgressDocument(await getDocFromServer(progressRef))
  assertOwner(uid, user)
  assertLive()
  return confirmed
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
      const decoded = legacyProgressDocument(progress)
      const statusMap = decoded.exists ? decoded.statusMap : career.initialStatus
      const sourceTime = progress.data()?.updatedAt ?? now
      if (!progress.data()?.updatedAt) {
        transaction.set(progressRef, { statusMap, updatedAt: now, writeRevision: nextLegacyWriteRevision(progress.data()) }, { mergeFields: ['statusMap', 'updatedAt', 'writeRevision'] })
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
