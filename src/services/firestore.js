import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { savePlanningProgress } from './planning'

export async function loadUserStatus(userId, careerId) {
  const ref = doc(db, 'users', userId, 'careers', careerId)

  const snap = await getDoc(ref)

  if (!snap.exists()) return null

  return snap.data().statusMap
}

export function subscribeUserStatus(userId, careerId, onData, onError) {
  return onSnapshot(doc(db, 'users', userId, 'careers', careerId), { includeMetadataChanges: true }, snap => {
    if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) onData(snap.exists() ? snap.data().statusMap : null)
  }, onError)
}

export async function saveUserStatus(userId, careerId, statusMap) {
  await savePlanningProgress(userId, careerId, statusMap)
}

export async function loadUserProfile(userId) {
  const ref = doc(db, 'users', userId)
  const snap = await getDoc(ref)

  if (!snap.exists()) return null

  return snap.data()
}

export async function saveUserProfile(userId, data) {
  const ref = doc(db, 'users', userId)

  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true })
}
