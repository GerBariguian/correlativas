import { collection, doc, onSnapshot, query, where, runTransaction, serverTimestamp, getDocsFromServer, writeBatch, limit } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { newJointPlan, changePlanMembership, proposedSubject, assertPlanEditor, invitePlanParticipant, planName } from '../jointPlanLogic'
import { friendshipId } from './friends'

function session(uid) {
  const user = auth.currentUser
  if (user?.uid !== uid) throw new Error('La sesión cambió. Volvé a ingresar.')
  return () => { if (auth.currentUser !== user) throw new Error('La sesión cambió. Volvé a ingresar.') }
}

export async function createJointPlan(uid, careerId, inviteeIds, name) {
  const check = session(uid)
  const ref = doc(collection(db, 'jointPlans'))
  const data = newJointPlan(uid, careerId, inviteeIds, serverTimestamp(), name)
  await runTransaction(db, async (tx) => {
    for (const invitee of inviteeIds) await assertFriend(tx, uid, invitee)
    check(); tx.set(ref, data)
  })
  return ref.id
}

async function assertFriend(tx, uid, other) {
  const id = friendshipId(uid, other)
  const forward = await tx.get(doc(db, 'friendships', id))
  const reverse = await tx.get(doc(db, 'friendships', id.split(':').reverse().join(':')))
  if (forward.data()?.status !== 'accepted' && reverse.data()?.status !== 'accepted') throw new Error('Solo podés invitar a tus amigos aceptados.')
}

export async function renameJointPlan(uid, id, name) {
  const check = session(uid)
  const normalized = planName(name)
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'jointPlans', id)
    const snapshot = await tx.get(ref)
    check()
    if (!snapshot.exists()) throw new Error('El plan ya no está disponible.')
    assertPlanEditor(snapshot.data(), uid)
    tx.update(ref, { name: normalized, updatedAt: serverTimestamp() })
  })
}

export async function inviteJointParticipant(uid, id, invitee) {
  const check = session(uid)
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'jointPlans', id)
    const snapshot = await tx.get(ref)
    if (!snapshot.exists()) throw new Error('El plan ya no está disponible.')
    const changes = invitePlanParticipant(snapshot.data(), uid, invitee)
    await assertFriend(tx, uid, invitee)
    check()
    tx.update(ref, { ...changes, updatedAt: serverTimestamp() })
  })
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
    if (!snapshot.exists() || snapshot.data().ownerId !== uid || snapshot.data().deleting) throw new Error('Solo el creador puede cerrar el plan.')
    tx.update(ref, { closed: true, updatedAt: serverTimestamp() })
  })
}

export async function saveJointSubject(uid, id, code, ids) {
  const check = session(uid)
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(doc(db, 'jointPlans', id))
    const subjectRef = doc(db, 'jointPlans', id, 'subjects', code)
    const previous = await tx.get(subjectRef)
    check()
    if (!snapshot.exists()) throw new Error('El plan ya no está disponible.')
    tx.set(subjectRef, proposedSubject(snapshot.data(), uid, code, ids, serverTimestamp(), previous.data()))
  })
}

export async function removeJointSubject(uid, id, code) {
  const check = session(uid)
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(doc(db, 'jointPlans', id))
    check()
    if (!snapshot.exists()) throw new Error('El plan ya no está disponible.')
    assertPlanEditor(snapshot.data(), uid)
    tx.delete(doc(db, 'jointPlans', id, 'subjects', code))
  })
}

export function subscribeJointPlans(uid, ownerId, onData, onError) {
  const filters = [uid === ownerId ? where('ownerId', '==', uid) : where('inviteeIds', 'array-contains', uid)]
  return onSnapshot(query(collection(db, 'jointPlans'), ...filters), { includeMetadataChanges: true },
    (snapshot) => onData(snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites ? null
      : snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))), onError)
}

// Lock -> drain the known subcollection -> delete parent last. A failed drain is resumable.
export async function deleteJointPlan(uid, id) {
  const check = session(uid)
  const ref = doc(db, 'jointPlans', id)
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref)
    check()
    if (!snapshot.exists() || snapshot.data().ownerId !== uid || !snapshot.data().closed) throw new Error('Solo el creador puede eliminar un plan cerrado.')
    tx.update(ref, { deleting: true, updatedAt: serverTimestamp() })
  })
  while (true) {
    check()
    const page = await getDocsFromServer(query(collection(db, 'jointPlans', id, 'subjects'), limit(100)))
    check()
    if (page.empty) break
    const batch = writeBatch(db)
    page.docs.forEach((item) => batch.delete(item.ref))
    await batch.commit()
  }
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref)
    check()
    if (!snapshot.exists()) return
    if (snapshot.data().ownerId !== uid || !snapshot.data().closed || !snapshot.data().deleting) throw new Error('El plan no está bloqueado para eliminar.')
    tx.delete(ref)
  })
}

export function subscribeJointSubjects(id, onData, onError) {
  return onSnapshot(collection(db, 'jointPlans', id, 'subjects'), { includeMetadataChanges: true },
    (snapshot) => onData(snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites ? null
      : snapshot.docs.map((item) => item.data())), onError)
}
