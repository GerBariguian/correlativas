import {
  collection, doc, getDoc, onSnapshot, query, runTransaction,
  serverTimestamp, where,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import { activityId, newActivity } from '../activityLogic'
import { friendshipCycleActivityId, newFriendshipCycleActivity } from '../activityLogic'
import {
  canonicalFriendshipId, validateFriendshipCycleId, decodeFriendshipCycle,
  buildFriendshipCycleRequest, buildFriendshipCycleResponse, buildFriendshipCycleWithdrawal,
  buildAcceptedLegacyFriendshipUpgrade, decodeAcceptedLegacyFriendship,
} from '../friendshipCycleLogic'
import { assertSocialCreationAvailable } from '../socialMaintenance'

export function normalizeEmail(value) {
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(email)) {
    throw new Error('Ingresá un email válido y completo.')
  }
  return email
}

export function friendshipId(firstUid, secondUid) {
  if (firstUid === secondUid) throw new Error('No podés enviarte una solicitud a vos mismo.')
  if (![firstUid, secondUid].every((uid) => /^[A-Za-z0-9_-]+$/.test(uid))) {
    throw new Error('El identificador de usuario no es compatible.')
  }
  return [firstUid, secondUid].sort().join(':')
}

function requireUser(uid) {
  if (auth.currentUser?.uid !== uid || !auth.currentUser.emailVerified) {
    throw new Error('Volvé a iniciar sesión con tu cuenta de Google.')
  }
}

export function friendsError(error) {
  if (error.code === 'permission-denied') return 'No se pudo acceder a Amigos. Revisá las reglas de Firestore del proyecto.'
  if (error.code === 'unavailable') return 'No hay conexión con Firebase. Intentá nuevamente.'
  if (error.code) return 'No se pudo completar la operación. Intentá nuevamente.'
  return error.message || 'No se pudo completar la operación.'
}

export async function syncSocialProfile(user, careerId) {
  requireUser(user.uid)
  // Refresh claims so the index follows the authenticated email, not a stale profile.
  const token = await user.getIdTokenResult(true)
  const email = normalizeEmail(token.claims.email || '')
  if (token.claims.email_verified !== true) throw new Error('El email debe estar verificado.')
  const privateRef = doc(db, 'users', user.uid)
  const publicRef = doc(db, 'socialProfiles', user.uid)
  const indexRef = doc(db, 'socialEmails', email)
  await runTransaction(db, async (transaction) => {
    requireUser(user.uid)
    if (auth.currentUser !== user) throw new Error('La sesión cambió. Intentá nuevamente.')
    const privateProfile = await transaction.get(privateRef)
    const publicProfile = await transaction.get(publicRef)
    const currentIndex = await transaction.get(indexRef)
    if (currentIndex.exists() && currentIndex.data().uid !== user.uid) {
      throw new Error('Este email tiene un índice de otra cuenta. Se requiere revisión administrativa.')
    }
    // Legacy public email is read only by its owner, then removed by replacement.
    const previousEmails = [...new Set([
      privateProfile.data()?.socialEmail,
      publicProfile.data()?.email,
    ].filter((value) => typeof value === 'string').map(normalizeEmail))].filter((value) => value !== email)
    const previousIndexes = []
    for (const previousEmail of previousEmails) {
      const ref = doc(db, 'socialEmails', previousEmail)
      const snapshot = await transaction.get(ref)
      if (snapshot.exists() && snapshot.data().uid === user.uid) previousIndexes.push(ref)
    }
    // All reads precede writes. Failed/conflicting transactions leave every index intact.
    previousIndexes.forEach((ref) => transaction.delete(ref))
    transaction.set(privateRef, { socialEmail: email }, { merge: true })
    transaction.set(publicRef, {
      uid: user.uid,
      name: (user.displayName || 'Usuario de Correlativas').slice(0, 200),
      photoURL: user.photoURL || '',
      careerId,
      updatedAt: serverTimestamp(),
    })
    transaction.set(indexRef, { uid: user.uid })
  })
}

function visibleProfile(snapshot) {
  if (!snapshot.exists()) return null
  const { uid, name, photoURL, careerId, updatedAt } = snapshot.data()
  return { uid, name, photoURL, careerId, updatedAt }
}

async function readVisibleProfile(uid) {
  try {
    return visibleProfile(await getDoc(doc(db, 'socialProfiles', uid)))
  } catch (error) {
    // A legacy profile is intentionally unreadable until its owner migrates it.
    if (error.code === 'permission-denied') return null
    throw error
  }
}

export async function findUserByEmail(email) {
  let index
  try {
    index = await getDoc(doc(db, 'socialEmails', normalizeEmail(email)))
  } catch (error) {
    // Invalidated/legacy indexes are indistinguishable from an absent result.
    if (error.code === 'permission-denied') return null
    throw error
  }
  if (!index.exists()) return null
  return readVisibleProfile(index.data().uid)
}

export function subscribeFriendships(uid, onData, onError) {
  return onSnapshot(
    query(collection(db, 'friendships'), where('participants', 'array-contains', uid)),
    (snapshot) => onData(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))),
    onError
  )
}

export async function loadSocialProfiles(uids) {
  const entries = await Promise.all([...new Set(uids)].map(async (uid) => {
    return [uid, await readVisibleProfile(uid)]
  }))
  return Object.fromEntries(entries)
}

export async function sendFriendRequest(senderId, recipientId) {
  assertSocialCreationAvailable()
  requireUser(senderId)
  const id = friendshipId(senderId, recipientId)
  const ref = doc(db, 'friendships', id)
  const reverse = doc(db, 'friendships', id.split(':').reverse().join(':'))
  await runTransaction(db, async (transaction) => {
    requireUser(senderId)
    const existing = await transaction.get(ref)
    const reversed = await transaction.get(reverse)
    if (existing.exists() || reversed.exists()) {
      throw new Error('Ya existe una solicitud o relación con esta persona.')
    }
    transaction.set(ref, {
      participants: [senderId, recipientId].sort(),
      senderId,
      recipientId,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    transaction.set(doc(db, 'users', recipientId, 'activityInbox', activityId('FRIEND_REQUEST_RECEIVED', id)),
      newActivity('FRIEND_REQUEST_RECEIVED', senderId, id, serverTimestamp()))
  })
}

export async function respondToFriendRequest(uid, id, status) {
  if (status === 'accepted') assertSocialCreationAvailable()
  requireUser(uid)
  if (!['accepted', 'rejected'].includes(status)) throw new Error('Respuesta inválida.')
  await runTransaction(db, async (transaction) => {
    requireUser(uid)
    const ref = doc(db, 'friendships', id)
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists() || snapshot.data().recipientId !== uid) {
      throw new Error('Solo el destinatario puede responder la solicitud.')
    }
    if (snapshot.data().status !== 'pending') throw new Error('La solicitud ya fue respondida.')
    transaction.update(ref, { status, updatedAt: serverTimestamp() })
    if (status === 'accepted') transaction.set(doc(db, 'users', snapshot.data().senderId, 'activityInbox', activityId('FRIEND_REQUEST_ACCEPTED', id)),
      newActivity('FRIEND_REQUEST_ACCEPTED', uid, id, serverTimestamp()))
  })
}

// Isolated cycle protocol: not connected to the legacy UI. Structural builders
// do not authorize writes. Rules must enforce immutable, create-only reservations.
function cycleSession(uid) {
  if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]+$/.test(uid)) throw new Error('INVALID_UID')
  requireUser(uid)
  const user = auth.currentUser
  return () => {
    requireUser(uid)
    if (auth.currentUser !== user) throw new Error('La sesión cambió. Intentá nuevamente.')
  }
}

export function generateFriendshipCycleId() {
  // 128 random bits, no timestamp/user semantics and no weak fallback.
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return validateFriendshipCycleId(Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''))
}

export async function sendFriendshipCycleRequest(uid, recipientId, cycleId) {
  const checkSession = cycleSession(uid)
  assertSocialCreationAvailable()
  const id = canonicalFriendshipId(uid, recipientId)
  validateFriendshipCycleId(cycleId)
  const ref = doc(db, 'friendships', id)
  const reverse = doc(db, 'friendships', id.split(':').reverse().join(':'))
  await runTransaction(db, async transaction => {
    checkSession()
    const current = await transaction.get(ref)
    const reversed = await transaction.get(reverse)
    checkSession()
    // No conversion of legacy relationships (including their reverse orientation).
    if (reversed.exists()) throw new Error('FRIENDSHIP_REVERSE_EXISTS')
    const next = buildFriendshipCycleRequest({ senderId: uid, recipientId, cycleId,
      previous: current.exists() ? current.data() : null, reservations: [] })
    // [] is not evidence of freshness. A used certificate makes this entire commit
    // fail in Rules; certificates are deliberately not readable by the client.
    transaction.set(ref, next.friendship)
    transaction.set(doc(db, 'usedFriendshipCycles', cycleId), next.reservation.data)
    transaction.set(doc(db, 'users', recipientId, 'activityInbox', friendshipCycleActivityId('FRIEND_REQUEST', cycleId)),
      newFriendshipCycleActivity('FRIEND_REQUEST', uid, id, cycleId, serverTimestamp()))
  })
  checkSession()
  return { relationshipId: id, cycleId }
}

async function transitionFriendshipCycle(uid, otherUid, cycleId, status) {
  const checkSession = cycleSession(uid)
  if (status === 'accepted') assertSocialCreationAvailable()
  const id = canonicalFriendshipId(uid, otherUid)
  validateFriendshipCycleId(cycleId)
  await runTransaction(db, async transaction => {
    checkSession()
    const ref = doc(db, 'friendships', id)
    const snapshot = await transaction.get(ref)
    checkSession()
    if (!snapshot.exists()) throw new Error('FRIENDSHIP_CYCLE_NOT_FOUND')
    const before = decodeFriendshipCycle(id, snapshot.data())
    if (before.cycleId !== cycleId) throw new Error('STALE_FRIENDSHIP_CYCLE')
    const next = status === 'withdrawn'
      ? buildFriendshipCycleWithdrawal(id, before, uid)
      : buildFriendshipCycleResponse(id, before, uid, status)
    if (before.status === next.status) return // Only the contracted withdrawal no-op.
    transaction.update(ref, { status: next.status })
    if (status === 'accepted') {
      transaction.set(doc(db, 'users', before.senderId, 'activityInbox', friendshipCycleActivityId('FRIEND_ACCEPTED', cycleId)),
        newFriendshipCycleActivity('FRIEND_ACCEPTED', uid, id, cycleId, serverTimestamp()))
    }
  })
  checkSession()
  return { relationshipId: id, cycleId, status }
}

export async function respondToFriendshipCycle(uid, otherUid, cycleId, status) {
  if (!['accepted', 'rejected'].includes(status)) throw new Error('INVALID_RESPONSE')
  return transitionFriendshipCycle(uid, otherUid, cycleId, status)
}

export function withdrawFriendshipCycle(uid, otherUid, cycleId) {
  return transitionFriendshipCycle(uid, otherUid, cycleId, 'withdrawn')
}

// Explicit bridge: never called by request, invite, reads or Activity.
export async function upgradeAcceptedLegacyFriendship(uid, otherUid) {
  const check = cycleSession(uid)
  assertSocialCreationAvailable()
  const id = canonicalFriendshipId(uid, otherUid), inverse = id.split(':').reverse().join(':')
  let cycleId
  await runTransaction(db, async tx => {
    check()
    const canonicalRef = doc(db, 'friendships', id), inverseRef = doc(db, 'friendships', inverse)
    const a = await tx.get(canonicalRef), b = await tx.get(inverseRef)
    check()
    if (a.exists() === b.exists()) throw new Error('LEGACY_FRIENDSHIP_AMBIGUOUS_OR_MISSING')
    const source = a.exists() ? a : b, sourceId = a.exists() ? id : inverse
    // Validate BEFORE generating an identity, including on transaction retries.
    decodeAcceptedLegacyFriendship(sourceId, source.data(), uid)
    cycleId ??= generateFriendshipCycleId()
    const next = buildAcceptedLegacyFriendshipUpgrade(sourceId, source.data(), uid, cycleId)
    tx.set(canonicalRef, next.friendship)
    tx.set(doc(db, 'usedFriendshipCycles', cycleId), next.reservation.data)
    if (b.exists()) tx.delete(inverseRef)
  })
  check()
  return { relationshipId:id, cycleId, status:'accepted' }
}
