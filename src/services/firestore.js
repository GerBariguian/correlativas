import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

export async function loadUserStatus(userId, careerId) {
  const ref = doc(db, 'users', userId, 'careers', careerId)

  const snap = await getDoc(ref)

  if (!snap.exists()) return null

  return snap.data().statusMap
}

export async function saveUserStatus(userId, careerId, statusMap) {
  const ref = doc(db, 'users', userId, 'careers', careerId)

  await setDoc(
    ref,
    {
      statusMap,
      updatedAt: new Date(),
    },
    { merge: true }
  )
}