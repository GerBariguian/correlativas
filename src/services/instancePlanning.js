import { doc, getDocFromServer, runTransaction, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { careers } from '../data/careers'
import { derivePlanningSnapshot, snapshotCompatible } from '../planningLogic'
import { decodeCareerMetadata, validateCareerPersistenceId } from '../careerInstancePersistenceLogic'
import { resolveUserDataAuthority } from '../userDataAuthorityLogic'

function session(uid) {
  validateCareerPersistenceId(uid)
  const user = auth.currentUser
  const check = () => { if (!user || user.uid !== uid || auth.currentUser !== user) throw new Error('CAREER_SESSION_CHANGED') }
  check(); return check
}
function path(uid, id) {
  validateCareerPersistenceId(uid); validateCareerPersistenceId(id)
  return `users/${uid}/careerInstances/${id}`
}
function careerFor(catalogId) {
  const career = careers.find(c => c.id === catalogId)
  if (!career) throw new Error('CATALOG_UNAVAILABLE')
  return career
}
async function own(tx, uid, id) {
  const control = await tx.get(doc(db, 'migrationUsers', uid))
  const a = resolveUserDataAuthority(uid, control.exists() ? control.data() : null)
  if (a.authority !== 'instances' || a.phase !== 'complete') throw new Error('INSTANCE_AUTHORITY_REQUIRED')
  const m = await tx.get(doc(db, path(uid, id)))
  if (!m.exists()) throw new Error('CAREER_INSTANCE_NOT_FOUND')
  return decodeCareerMetadata(uid, id, m.data()).metadata
}
function progressData(snapshot, metadata, career) {
  if (!snapshot.exists()) return { statusMap: career.initialStatus, revision: 0, updatedAt: metadata.createdAt }
  const p = snapshot.data()
  if (Object.keys(p).sort().join() !== 'revision,schemaVersion,statusMap,updatedAt' || p.schemaVersion !== 1
    || !Number.isSafeInteger(p.revision) || p.revision < 1 || !p.statusMap || typeof p.statusMap !== 'object'
    || Array.isArray(p.statusMap) || !p.updatedAt || !Number.isInteger(p.updatedAt.seconds)) throw new Error('INVALID_ACADEMIC_PROGRESS')
  return p
}
function derive(career, p, consent, now) {
  return { ...derivePlanningSnapshot(career, p.statusMap, p.updatedAt, now, consent.consentVersion === 2),
    schemaVersion: 3, sourceProgressRevision: p.revision, consentEpoch: consent.epoch }
}

export async function readInstancePlanningSharing(uid, instanceId) {
  const check = session(uid); path(uid, instanceId)
  const result = await runTransaction(db, async tx => {
    check(); const metadata = await own(tx, uid, instanceId); check()
    return { careerInstanceId: instanceId, catalogId: metadata.catalogId, lifecycle: metadata.lifecycle,
      sharing: metadata.sharing ? { ...metadata.sharing } : null }
  })
  check(); return result
}

// consentVersion is explicit: callers cannot silently upgrade migrated consent v1.
export async function setInstancePlanningSharing(uid, instanceId, enabled, consentVersion = null) {
  const check = session(uid), root = path(uid, instanceId)
  if (typeof enabled !== 'boolean' || (enabled && ![1, 2].includes(consentVersion))) throw new Error('INVALID_CONSENT')
  await runTransaction(db, async tx => {
    check(); const m = await own(tx, uid, instanceId)
    if (m.lifecycle !== 'active') throw new Error('INSTANCE_NOT_ACTIVE')
    const epoch = (m.sharing?.epoch ?? 0) + 1
    if (!Number.isSafeInteger(epoch)) throw new Error('INVALID_CONSENT')
    const now = serverTimestamp(), sharing = { enabled, consentVersion: enabled ? consentVersion : m.sharing?.consentVersion ?? null, epoch, updatedAt: now }
    let snapshot
    if (enabled) {
      const career = careerFor(m.catalogId)
      const p = progressData(await tx.get(doc(db, root + '/academic/progress')), m, career)
      snapshot = derive(career, p, sharing, now)
    }
    check()
    tx.update(doc(db, root), { sharing, updatedAt: now })
    if (snapshot) tx.set(doc(db, root + '/sharing/snapshot'), snapshot)
  })
  check()
}

// Refresh never grants consent. It serializes against progress, consent and lifecycle.
export async function refreshInstancePlanningSnapshot(uid, instanceId) {
  const check = session(uid), root = path(uid, instanceId)
  await runTransaction(db, async tx => {
    check(); const m = await own(tx, uid, instanceId)
    if (m.lifecycle !== 'active' || !m.sharing?.enabled) throw new Error('SHARING_DISABLED')
    const career = careerFor(m.catalogId)
    const p = progressData(await tx.get(doc(db, root + '/academic/progress')), m, career)
    check(); tx.set(doc(db, root + '/sharing/snapshot'), derive(career, p, m.sharing, serverTimestamp()))
  })
  check()
}

export async function readInstancePlanningSnapshot(uid, targetUid, instanceId, catalogId) {
  const check = session(uid), root = path(targetUid, instanceId), career = careerFor(catalogId)
  const s = await getDocFromServer(doc(db, root + '/sharing/snapshot'))
  check()
  if (!s.exists()) return null
  const d = s.data(), hasFinals = Object.hasOwn(d, 'pendingFinalCodes')
  const keys = ['schemaVersion','approvedCodes','availableToCourseCodes','sourceProgressRevision','sourceUpdatedAt','consentEpoch','logicVersion','catalogVersion','updatedAt', ...(hasFinals ? ['pendingFinalCodes'] : [])]
  if (Object.keys(d).length !== keys.length || !keys.every(k => Object.hasOwn(d, k)) || d.schemaVersion !== 3
    || !Number.isSafeInteger(d.sourceProgressRevision) || d.sourceProgressRevision < 0
    || !Number.isSafeInteger(d.consentEpoch) || d.consentEpoch < 1
    || ![d.sourceUpdatedAt,d.updatedAt].every(t => t && Number.isInteger(t.seconds) && Number.isInteger(t.nanoseconds) && t.nanoseconds >= 0 && t.nanoseconds < 1e9)
    || !snapshotCompatible({ ...d, schemaVersion: hasFinals ? 2 : 1 }, career)) throw new Error('INVALID_INSTANCE_SNAPSHOT')
  // Remote Rules establish current consent/progress and compatible reader, not this DTO.
  return { uid: targetUid, careerInstanceId: instanceId, catalogId, snapshot: d }
}
