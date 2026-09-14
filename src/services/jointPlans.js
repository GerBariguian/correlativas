import { collection, doc, onSnapshot, query, where, runTransaction, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { newJointPlan, changePlanMembership, proposedSubject } from '../jointPlanLogic'

function session(uid) {
  const user = auth.currentUser
  if (user?.uid !== uid) throw new Error('La sesión cambió. Volvé a ingresar.')
  return () => { if (auth.currentUser !== user) throw new Error('La sesión cambió. Volvé a ingresar.') }
}

export async function createJointPlan(uid, careerId, inviteeIds) {
  const check = session(uid)
  const ref = doc(collection(db, 'jointPlans'))
  const data = newJointPlan(uid, careerId, inviteeIds, serverTimestamp())
  await runTransaction(db, async (tx) => { check(); tx.set(ref, data) })
  return ref.id
}

export async function updatePlanMembership(uid, id, join) {
  const check = session(uid)
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'jointPlans', id)
    const snapshot = await tx.get(ref)
    check()
    if (!snapshot.exists()) throw new Error('El plan ya no está disponible.')
    tx.update(ref, { ...changePlanMembership(snapshot.data(), uid, join), updatedAt: serverTimestamp() })
  })
}

export async function closeJointPlan(uid, id) {
  const check = session(uid)
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'jointPlans', id)
    const snapshot = await tx.get(ref)
    check()
    if (!snapshot.exists() || snapshot.data().ownerId !== uid) throw new Error('Solo el creador puede cerrar el plan.')
    tx.update(ref, { closed: true, updatedAt: serverTimestamp() })
  })
}

export async function saveJointSubject(uid, id, code, ids) {
  const check = session(uid)
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(doc(db, 'jointPlans', id))
    check()
    if (!snapshot.exists()) throw new Error('El plan ya no está disponible.')
    tx.set(doc(db, 'jointPlans', id, 'subjects', code), proposedSubject(snapshot.data(), uid, code, ids, serverTimestamp()))
  })
}

export async function removeJointSubject(uid, id, code) {
  const check = session(uid)
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(doc(db, 'jointPlans', id))
    check()
    if (!snapshot.exists() || snapshot.data().ownerId !== uid || snapshot.data().closed) throw new Error('Solo el creador puede editar un plan abierto.')
    tx.delete(doc(db, 'jointPlans', id, 'subjects', code))
  })
}

export function subscribeJointPlans(uid, ownerId, onData, onError) {
  const filters = [where('ownerId', '==', ownerId)]
  if (uid !== ownerId) filters.push(where('inviteeIds', 'array-contains', uid))
  return onSnapshot(query(collection(db, 'jointPlans'), ...filters), { includeMetadataChanges: true },
    (snapshot) => onData(snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites ? null
      : snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))), onError)
}

export function subscribeJointSubjects(id, onData, onError) {
  return onSnapshot(collection(db, 'jointPlans', id, 'subjects'), { includeMetadataChanges: true },
    (snapshot) => onData(snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites ? null
      : snapshot.docs.map((item) => item.data())), onError)
}
