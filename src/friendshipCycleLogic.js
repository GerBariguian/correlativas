// Pure lifecycle core from the accepted cycle protocol. No authorization or I/O.
// Reservation identity is its document ID; it is not an extra stored field.
// Persistence must atomically enforce global reservation absence: supplied history
// is evidence for local consistency only, never proof that an ID is unused.
function invalidCycle() {
  throw Object.assign(new Error('INVALID_FRIENDSHIP_CYCLE'), { code: 'INVALID_FRIENDSHIP_CYCLE' })
}
const uidShape = value => typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value)
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))

export function canonicalFriendshipId(firstUid, secondUid) {
  if (!uidShape(firstUid) || !uidShape(secondUid) || firstUid === secondUid) invalidCycle()
  return [firstUid, secondUid].sort().join(':')
}

export function validateFriendshipCycleId(cycleId) {
  if (typeof cycleId !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(cycleId)) invalidCycle()
  return cycleId
}

function participantsFor(relationshipId, participants) {
  if (!Array.isArray(participants) || participants.length !== 2
    || canonicalFriendshipId(participants[0], participants[1]) !== relationshipId
    || participants[0] >= participants[1]) invalidCycle()
  return Object.freeze([...participants])
}

export function decodeFriendshipCycle(relationshipId, data) {
  if (!exactKeys(data, ['participants', 'senderId', 'recipientId', 'status', 'cycleId'])) invalidCycle()
  const participants = participantsFor(relationshipId, data.participants)
  validateFriendshipCycleId(data.cycleId)
  if (!participants.includes(data.senderId) || !participants.includes(data.recipientId)
    || data.senderId === data.recipientId
    || !['pending', 'accepted', 'rejected', 'withdrawn'].includes(data.status)) invalidCycle()
  return Object.freeze({ ...data, participants })
}

export function decodeFriendshipCycleReservation(cycleId, data) {
  validateFriendshipCycleId(cycleId)
  if (!exactKeys(data, ['relationshipId', 'participants'])) invalidCycle()
  const participants = participantsFor(data.relationshipId, data.participants)
  return Object.freeze({ cycleId, data: Object.freeze({ relationshipId: data.relationshipId, participants }) })
}

// cycleId is proposed explicitly by the adapter (cryptographic randomness there).
// No local clock, counters, legacy conversion or authority inference here.
export function buildFriendshipCycleRequest({ senderId, recipientId, cycleId, previous = null, reservations }) {
  const relationshipId = canonicalFriendshipId(senderId, recipientId)
  validateFriendshipCycleId(cycleId)
  if (!Array.isArray(reservations)) invalidCycle()
  for (const entry of reservations) {
    if (!entry || decodeFriendshipCycleReservation(entry.cycleId, entry.data).cycleId === cycleId) invalidCycle()
  }
  if (previous !== null) {
    const before = decodeFriendshipCycle(relationshipId, previous)
    if (!['rejected', 'withdrawn'].includes(before.status) || before.cycleId === cycleId) invalidCycle()
  }
  const participants = [senderId, recipientId].sort()
  const friendship = decodeFriendshipCycle(relationshipId, { participants, senderId, recipientId, status: 'pending', cycleId })
  const reservation = decodeFriendshipCycleReservation(cycleId, { relationshipId, participants })
  return Object.freeze({ relationshipId, friendship, reservation })
}

export function buildFriendshipCycleResponse(relationshipId, data, recipientId, status) {
  const before = decodeFriendshipCycle(relationshipId, data)
  if (before.status !== 'pending' || recipientId !== before.recipientId || !['accepted', 'rejected'].includes(status)) invalidCycle()
  return decodeFriendshipCycle(relationshipId, { ...before, status })
}

export function buildFriendshipCycleWithdrawal(relationshipId, data, participantId) {
  const before = decodeFriendshipCycle(relationshipId, data)
  if (!before.participants.includes(participantId)) invalidCycle()
  if (before.status === 'withdrawn') return before
  if (!['pending', 'accepted'].includes(before.status)) invalidCycle()
  return decodeFriendshipCycle(relationshipId, { ...before, status: 'withdrawn' })
}

// Explicit identity upgrade only. Neither decoding nor this builder authorizes I/O.
export function decodeAcceptedLegacyFriendship(sourceId, data, actorUid) {
  if (!exactKeys(data, ['participants','senderId','recipientId','status','createdAt','updatedAt'])
    || !Array.isArray(data.participants) || data.participants.length !== 2
    || sourceId !== data.participants.join(':') || data.status !== 'accepted'
    || !data.participants.includes(actorUid) || !data.participants.includes(data.senderId)
    || !data.participants.includes(data.recipientId) || data.senderId === data.recipientId
    || ![data.createdAt,data.updatedAt].every(t => t && Number.isInteger(t.seconds)
      && t.seconds >= -62135596800 && t.seconds <= 253402300799
      && Number.isInteger(t.nanoseconds) && t.nanoseconds >= 0 && t.nanoseconds < 1000000000)) invalidCycle()
  const relationshipId = canonicalFriendshipId(...data.participants)
  return { relationshipId, friendship: { ...data, participants: [...data.participants] } }
}
export function buildAcceptedLegacyFriendshipUpgrade(sourceId, data, actorUid, cycleId) {
  const { relationshipId } = decodeAcceptedLegacyFriendship(sourceId, data, actorUid)
  const participants = [...data.participants].sort()
  const friendship = decodeFriendshipCycle(relationshipId, { participants, senderId:data.senderId,
    recipientId:data.recipientId, status:'accepted', cycleId })
  const reservation = decodeFriendshipCycleReservation(cycleId, {relationshipId,participants})
  return { relationshipId, friendship, reservation }
}
