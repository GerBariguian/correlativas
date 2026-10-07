import { collection, doc, onSnapshot, query, where, runTransaction, serverTimestamp, getDocsFromServer, getDocFromServer, writeBatch, limit } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { jointCInvitationOccurrencePath, decodeJointCInvitationOccurrence } from '../jointPlanLogic'
import { newJointPlan, changePlanMembership, proposedSubject, assertPlanEditor, invitePlanParticipant, planName, jointCPlanPath, jointCSlotPath, decodeJointCPlan, decodeJointCSlot, decodeJointCRef, newJointCPlan, emptyJointCSlot, JOINT_C_SLOTS } from '../jointPlanLogic'
import { friendshipId } from './friends'
import { activityId, newActivity } from '../activityLogic'
import { assertSocialCreationAvailable } from '../socialMaintenance'
import { joinJointPlan } from './jointJoin'
import { canonicalFriendshipId, decodeFriendshipCycle, validateFriendshipCycleId } from '../friendshipCycleLogic'
import { newInvitationOccurrenceActivity, invitationOccurrenceActivityId } from '../activityLogic'
import { resolveUserDataAuthority } from '../userDataAuthorityLogic'
import { decodeCareerMetadata } from '../careerInstancePersistenceLogic'
import { transitionJointCMemberEdge } from '../jointPlanLogic'
import { jointCSubjectBasePath, jointCMemberEdgePath, decodeJointCMemberReference, decodeJointCSubjectBase, decodeJointCMemberEdge, newJointCSubjectBase, newJointCMemberEdge } from '../jointPlanLogic'

function subjectError() { return new Error('JOINT_C_SUBJECT_UNAVAILABLE') }
async function visibleMember(tx, planId, plan, uid, reference) {
  const r = decodeJointCMemberReference(reference)
  if (uid === plan.ownerId) {
    if (r.slotId !== 'owner' || r.instanceId !== plan.ownerInstanceId) throw subjectError()
  } else {
    if (r.slotId === 'owner') throw subjectError()
    const snapshot = await tx.get(doc(db, jointCSlotPath(planId, r.slotId)))
    if (!snapshot.exists()) throw subjectError()
    const slot = decodeJointCSlot(snapshot.data())
    if (slot.status !== 'member' || slot.uid !== uid || slot.binding !== r.instanceId
      || slot.occurrence !== r.occurrence || slot.joinedOccurrence !== r.occurrence
      || slot.revision !== r.slotRevision) throw subjectError()
  }
  return r
}
async function subjectActor(tx, uid, planId, reference) {
  const p = await tx.get(doc(db, jointCPlanPath(planId)))
  if (!p.exists()) throw subjectError()
  const plan = decodeJointCPlan(p.data())
  if (plan.closed || plan.deleting) throw subjectError()
  const actorRef = await visibleMember(tx, planId, plan, uid, reference)
  // Only the actor's private state is client-readable. Target operability belongs to Rules.
  const c = await tx.get(doc(db, 'migrationUsers', uid))
  const authority = resolveUserDataAuthority(uid, c.exists() ? c.data() : null)
  if (authority.authority !== 'instances' || authority.phase !== 'complete') throw subjectError()
  const m = await tx.get(doc(db, 'users', uid, 'careerInstances', actorRef.instanceId))
  if (!m.exists()) throw subjectError()
  const { instance } = decodeCareerMetadata(uid, actorRef.instanceId, m.data())
  if (instance.lifecycle !== 'active' || instance.catalogId !== plan.catalogId) throw subjectError()
  return { plan, actorRef }
}

export async function ensureJointCSubjectBase(uid, planId, code, reference) {
  const check = jointCSession(uid), actor = decodeJointCMemberReference(reference)
  const baseRef = doc(db, jointCSubjectBasePath(planId, code))
  const result = await runTransaction(db, async tx => {
    check()
    const { actorRef } = await subjectActor(tx, uid, planId, actor)
    const base = await tx.get(baseRef)
    check()
    if (base.exists()) {
      decodeJointCSubjectBase(planId, code, base.data())
      return { created: false }
    }
    tx.set(baseRef, newJointCSubjectBase(planId, code, uid, actorRef, serverTimestamp()))
    return { created: true }
  })
  check()
  return { planId, code, ...result }
}

// One edge creation only. Existing edges (including unassigned history) are not overwritten.
export async function createJointCMemberEdge(uid, planId, code, actorReference, targetUid, targetReference) {
  const check = jointCSession(uid), actor = decodeJointCMemberReference(actorReference)
  const target = decodeJointCMemberReference(targetReference)
  const baseRef = doc(db, jointCSubjectBasePath(planId, code))
  const edgeRef = doc(db, jointCMemberEdgePath(planId, code, targetUid, target.occurrence))
  await runTransaction(db, async tx => {
    check()
    const { plan, actorRef } = await subjectActor(tx, uid, planId, actor)
    const base = await tx.get(baseRef)
    if (!base.exists()) throw subjectError()
    decodeJointCSubjectBase(planId, code, base.data())
    if (targetUid === uid) {
      if (Object.keys(actorRef).some(k => actorRef[k] !== target[k])) throw subjectError()
    } else await visibleMember(tx, planId, plan, targetUid, target)
    const prior = await tx.get(edgeRef)
    if (prior.exists()) {
      decodeJointCMemberEdge(planId, code, targetUid, target.occurrence, prior.data())
      throw subjectError()
    }
    check()
    tx.set(edgeRef, newJointCMemberEdge(planId, code, targetUid, target, uid, actorRef, serverTimestamp()))
  })
  check()
  return { planId, code, uid: targetUid, occurrence: target.occurrence, created: true }
}

async function transitionMemberEdge(uid, planId, code, actorReference, targetUid, targetReference, expectedRevision, state) {
  const check = jointCSession(uid), actor = decodeJointCMemberReference(actorReference)
  const target = decodeJointCMemberReference(targetReference)
  const baseRef = doc(db, jointCSubjectBasePath(planId, code))
  const edgeRef = doc(db, jointCMemberEdgePath(planId, code, targetUid, target.occurrence))
  const result = await runTransaction(db, async tx => {
    check()
    const { plan, actorRef } = await subjectActor(tx, uid, planId, actor)
    const base = await tx.get(baseRef), prior = await tx.get(edgeRef)
    if (!base.exists() || !prior.exists()) throw subjectError()
    decodeJointCSubjectBase(planId, code, base.data())
    const next = transitionJointCMemberEdge(planId, code, targetUid, target, expectedRevision,
      prior.data(), state, uid, actorRef, serverTimestamp())
    // Historical unassign needs only a current actor; reassign requires current target occupancy.
    if (state === 'assigned') {
      if (targetUid === uid) {
        if (Object.keys(actorRef).some(k => actorRef[k] !== target[k])) throw subjectError()
      } else await visibleMember(tx, planId, plan, targetUid, target)
    }
    check()
    tx.update(edgeRef, { state: next.state, revision: next.revision, updatedByUid: next.updatedByUid,
      updatedAt: next.updatedAt, actorRef: next.actorRef })
    return { planId, code, uid: targetUid, occurrence: target.occurrence, state, revision: next.revision }
  })
  check()
  return result
}
export function unassignJointCMemberEdge(uid, planId, code, actorReference, targetUid, targetReference, expectedRevision) {
  return transitionMemberEdge(uid, planId, code, actorReference, targetUid, targetReference, expectedRevision, 'unassigned')
}
export function reassignJointCMemberEdge(uid, planId, code, actorReference, targetUid, targetReference, expectedRevision) {
  return transitionMemberEdge(uid, planId, code, actorReference, targetUid, targetReference, expectedRevision, 'assigned')
}

function session(uid) {
  const user = auth.currentUser
  if (user?.uid !== uid) throw new Error('La sesión cambió. Volvé a ingresar.')
  return () => { if (auth.currentUser !== user) throw new Error('La sesión cambió. Volvé a ingresar.') }
}

function jointCSession(uid) {
  if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(uid)) throw new Error('Identificador de sesión inválido.')
  return session(uid)
}

// Server reads, no discovery/selection lookup and no legacy fallback.
// null means a missing document; SDK errors and invalid DTOs remain errors.
export async function readJointCPlan(uid, planId) {
  const check = jointCSession(uid)
  const ref = doc(db, jointCPlanPath(planId))
  const snapshot = await getDocFromServer(ref)
  check()
  return snapshot.exists() ? { planId, plan: decodeJointCPlan(snapshot.data()) } : null
}

export async function readJointCSlot(uid, planId, slotId) {
  const check = jointCSession(uid)
  const ref = doc(db, jointCSlotPath(planId, slotId))
  const snapshot = await getDocFromServer(ref)
  check()
  return snapshot.exists() ? { planId, slotId, slot: decodeJointCSlot(snapshot.data()) } : null
}

// Historical structure only; neither this read nor its payload decides JOIN eligibility.
export async function readJointCInvitationOccurrence(uid, planId, occurrenceId) {
  const check = jointCSession(uid)
  const ref = doc(db, jointCInvitationOccurrencePath(planId, occurrenceId))
  const snapshot = await getDocFromServer(ref)
  check()
  return snapshot.exists() ? decodeJointCInvitationOccurrence(planId, occurrenceId, snapshot.data()) : null
}

// Refs are candidates only. Unavailable/invalid candidates return no plan data.
// Subject/edge reads expose stored history only, never current private operability.
export async function readJointCSubjectBase(uid, planId, code) {
  const check = jointCSession(uid)
  const snapshot = await getDocFromServer(doc(db, jointCSubjectBasePath(planId, code)))
  check()
  return snapshot.exists() ? { planId, code, base: decodeJointCSubjectBase(planId, code, snapshot.data()) } : null
}

// Like the careerInstances collection reader, invalid documents reject the whole list.
export async function listJointCSubjectBases(uid, planId) {
  const check = jointCSession(uid)
  const snapshot = await getDocsFromServer(collection(db, `${jointCPlanPath(planId)}/subjects`))
  check()
  const bases = snapshot.docs.map(row => ({ planId, code: row.id, base: decodeJointCSubjectBase(planId, row.id, row.data()) }))
  check()
  return bases
}

export async function readJointCMemberEdge(uid, planId, code, targetUid, occurrence) {
  const check = jointCSession(uid)
  const snapshot = await getDocFromServer(doc(db, jointCMemberEdgePath(planId, code, targetUid, occurrence)))
  check()
  return snapshot.exists() ? { planId, code, edgeId: `${targetUid}:${occurrence}`,
    edge: decodeJointCMemberEdge(planId, code, targetUid, occurrence, snapshot.data()) } : null
}

export async function listJointCMemberEdges(uid, planId, code) {
  const check = jointCSession(uid)
  const snapshot = await getDocsFromServer(collection(db, `${jointCSubjectBasePath(planId, code)}/memberEdges`))
  check()
  const edges = snapshot.docs.map(row => {
    const parts = row.id.split(':')
    if (parts.length !== 2) throw Object.assign(new Error('INVALID_JOINT_C_DOCUMENT'), { code: 'INVALID_JOINT_C_DOCUMENT' })
    return { planId, code, edgeId: row.id, edge: decodeJointCMemberEdge(planId, code, parts[0], parts[1], row.data()) }
  })
  check()
  return edges
}

// Refs are candidates only. Unavailable/invalid candidates return no plan data.
// Transport/list failures reject the operation rather than masquerading as empty discovery.
export async function discoverJointCPlans(uid) {
  const check = jointCSession(uid)
  const refs = await getDocsFromServer(collection(db, 'users', uid, 'jointPlanRefs'))
  check()
  const plans = [], unavailable = []
  for (const ref of refs.docs) {
    check()
    let candidate
    try { candidate = decodeJointCRef(ref.id, ref.data()) }
    catch (error) {
      if (!['INVALID_JOINT_C_DOCUMENT', 'INVALID_JOINT_C_ID'].includes(error.code)) throw error
      unavailable.push({ planId: ref.id, reason: 'invalid-ref' })
      continue
    }
    try {
      const result = await readJointCPlan(uid, candidate.planId)
      check()
      if (result) plans.push(result)
      else unavailable.push({ planId: candidate.planId, reason: 'unavailable' })
    } catch (error) {
      check()
      if (['permission-denied', 'not-found'].includes(error.code)) {
        unavailable.push({ planId: candidate.planId, reason: 'unavailable' })
      } else if (error.code === 'INVALID_JOINT_C_DOCUMENT') {
        unavailable.push({ planId: candidate.planId, reason: 'invalid-plan' })
      } else throw error
    }
  }
  check()
  return { plans, unavailable }
}

// Native creation only. No invitations and no post-create completion writes.
export async function createJointCPlan(uid, careerInstanceId, catalogId, name = 'Plan conjunto') {
  const check = jointCSession(uid)
  assertSocialCreationAvailable()
  const now = serverTimestamp()
  const data = newJointCPlan(uid, careerInstanceId, catalogId, now, name)
  const ref = doc(collection(db, 'jointPlans'))
  jointCPlanPath(ref.id)
  const batch = writeBatch(db)
  batch.set(ref, data)
  for (const slotId of JOINT_C_SLOTS) {
    batch.set(doc(db, jointCSlotPath(ref.id, slotId)), emptyJointCSlot(now))
  }
  batch.set(doc(db, 'users', uid, 'jointPlanRefs', ref.id), { schemaVersion: 1, createdAt: now })
  check()
  await batch.commit()
  check()
  return ref.id
}

// Explicit C lifecycle. No legacy drain, reopening, child writes or fallback.
export async function renameJointCPlan(uid, planId, name) {
  const check = jointCSession(uid)
  const normalized = planName(name)
  const ref = doc(db, jointCPlanPath(planId))
  await runTransaction(db, async tx => {
    check()
    const snapshot = await tx.get(ref)
    check()
    if (!snapshot.exists()) throw new Error('JOINT_C_UNAVAILABLE')
    const plan = decodeJointCPlan(snapshot.data())
    if (plan.ownerId !== uid || plan.closed || plan.deleting) throw new Error('JOINT_C_TERMINAL_TRANSITION')
    tx.update(ref, { name: normalized })
  })
  check()
  return { planId, name: normalized }
}
async function terminalJointCPlan(uid, planId, deleting) {
  const check = jointCSession(uid)
  const ref = doc(db, jointCPlanPath(planId))
  await runTransaction(db, async tx => {
    check()
    const snapshot = await tx.get(ref)
    check()
    if (!snapshot.exists()) throw new Error('JOINT_C_UNAVAILABLE')
    const plan = decodeJointCPlan(snapshot.data())
    if (plan.ownerId !== uid || plan.deleting || (!deleting && plan.closed)) throw new Error('JOINT_C_TERMINAL_TRANSITION')
    tx.update(ref, deleting ? { closed: true, deleting: true } : { closed: true })
    if (deleting) tx.set(doc(db, 'jointPlanTombstones', planId), { deletedAt: serverTimestamp() })
  })
  check()
  return { planId, state: deleting ? 'deleted' : 'closed' }
}
export function closeJointCPlan(uid, planId) { return terminalJointCPlan(uid, planId, false) }
export function deleteJointCPlan(uid, planId) { return terminalJointCPlan(uid, planId, true) }

// One explicit acquisition per call. Rules enforce immutable occurrence/index
// creation and recipient authority; no reads of another user's private refs/data.
export async function inviteJointCParticipant(uid, planId, slotId, inviteeUid, occurrenceId, cycleId, expectedRevision, expectedOccurrence = null) {
  const check = jointCSession(uid)
  assertSocialCreationAvailable()
  const parentPath = jointCPlanPath(planId), slotPath = jointCSlotPath(planId, slotId)
  const occurrencePath = jointCInvitationOccurrencePath(planId, occurrenceId)
  const relationshipId = canonicalFriendshipId(uid, inviteeUid)
  validateFriendshipCycleId(cycleId)
  if (typeof inviteeUid !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(inviteeUid)
    || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER)
    throw new Error('INVALID_JOINT_C_INVITATION')
  if (expectedOccurrence !== null) jointCInvitationOccurrencePath(planId, expectedOccurrence)
  if (occurrenceId === expectedOccurrence) throw new Error('STALE_JOINT_C_INVITATION')
  await runTransaction(db, async tx => {
    check()
    const p = await tx.get(doc(db, parentPath))
    check()
    if (!p.exists()) throw new Error('JOINT_C_UNAVAILABLE')
    const plan = decodeJointCPlan(p.data())
    if (plan.closed || plan.deleting || plan.ownerId === inviteeUid) throw new Error('JOINT_C_UNAVAILABLE')
    const slots = []
    for (const id of JOINT_C_SLOTS) {
      const s = await tx.get(doc(db, jointCSlotPath(planId, id)))
      if (!s.exists()) throw new Error('INVALID_JOINT_C_SLOTS')
      slots.push(decodeJointCSlot(s.data()))
    }
    const before = slots[JOINT_C_SLOTS.indexOf(slotId)]
    if (before.revision !== expectedRevision || before.occurrence !== expectedOccurrence
      || (expectedOccurrence === null ? before.status !== 'empty'
        : before.status !== 'pending' || before.uid !== inviteeUid || before.invitedBy !== uid || before.cycle === cycleId)
      || slots.some((s,i) => JOINT_C_SLOTS[i] !== slotId && s.uid === inviteeUid)) throw new Error('STALE_JOINT_C_INVITATION')
    let instanceId = plan.ownerInstanceId
    if (uid !== plan.ownerId) {
      const index = await tx.get(doc(db, `${parentPath}/inviteeIndex/${uid}`))
      const pointer = index.exists() ? index.data() : null
      const actor = pointer && Object.keys(pointer).length === 1 && slots[JOINT_C_SLOTS.indexOf(pointer.slotId)]
      if (!actor || actor.status !== 'member' || actor.uid !== uid) throw new Error('JOINT_C_ACTOR_UNAVAILABLE')
      instanceId = actor.binding
    }
    const control = await tx.get(doc(db, 'migrationUsers', uid))
    const authority = resolveUserDataAuthority(uid, control.exists() ? control.data() : null)
    if (authority.authority !== 'instances' || authority.phase !== 'complete') throw new Error('JOINT_C_ACTOR_UNAVAILABLE')
    const metadata = await tx.get(doc(db, 'users', uid, 'careerInstances', instanceId))
    if (!metadata.exists()) throw new Error('JOINT_C_ACTOR_UNAVAILABLE')
    const { instance } = decodeCareerMetadata(uid, instanceId, metadata.data())
    if (instance.lifecycle !== 'active' || instance.catalogId !== plan.catalogId) throw new Error('JOINT_C_ACTOR_UNAVAILABLE')
    const f = await tx.get(doc(db, 'friendships', relationshipId))
    const r = await tx.get(doc(db, 'friendships', relationshipId.split(':').reverse().join(':')))
    if (f.exists() === r.exists()) throw new Error('JOINT_C_FRIENDSHIP_UNAVAILABLE')
    const friend = decodeFriendshipCycle(relationshipId, (f.exists() ? f : r).data())
    if (friend.status !== 'accepted' || friend.cycleId !== cycleId) throw new Error('STALE_FRIENDSHIP_CYCLE')
    const now = serverTimestamp(), revision = before.revision + 1
    const next = decodeJointCSlot({ ...before, status: 'pending', uid: inviteeUid,
      occurrence: occurrenceId, cycle: cycleId, invitedBy: uid, revision, updatedAt: now })
    const notice = newInvitationOccurrenceActivity(uid, planId, occurrenceId, cycleId, now)
    check()
    tx.update(doc(db, slotPath), next)
    if (before.status === 'empty') {
      tx.set(doc(db, `${parentPath}/inviteeIndex/${inviteeUid}`), { slotId })
      tx.set(doc(db, 'users', inviteeUid, 'jointPlanRefs', planId), { schemaVersion: 1 }, { merge: true })
    }
    tx.set(doc(db, occurrencePath), { slotId, uid: inviteeUid, invitedBy: uid, cycle: cycleId, revision, createdAt: now })
    tx.set(doc(db, 'users', inviteeUid, 'activityInbox', invitationOccurrenceActivityId(planId, occurrenceId)), notice)
  })
  check()
  return { planId, slotId, occurrenceId, cycleId, revision: expectedRevision + 1 }
}

export async function createJointPlan(uid, careerId, inviteeIds, name) {
  assertSocialCreationAvailable()
  const check = session(uid)
  const ref = doc(collection(db, 'jointPlans'))
  const data = newJointPlan(uid, careerId, inviteeIds, serverTimestamp(), name)
  await runTransaction(db, async (tx) => {
    for (const invitee of inviteeIds) await assertFriend(tx, uid, invitee)
    check(); tx.set(ref, data)
    for (const invitee of inviteeIds) tx.set(doc(db, 'users', invitee, 'activityInbox', activityId('JOINT_PLAN_INVITATION', ref.id)),
      newActivity('JOINT_PLAN_INVITATION', uid, ref.id, serverTimestamp()))
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
  assertSocialCreationAvailable()
  const check = session(uid)
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'jointPlans', id)
    const snapshot = await tx.get(ref)
    if (!snapshot.exists()) throw new Error('El plan ya no está disponible.')
    const changes = invitePlanParticipant(snapshot.data(), uid, invitee)
    await assertFriend(tx, uid, invitee)
    check()
    tx.update(ref, { ...changes, updatedAt: serverTimestamp() })
    tx.set(doc(db, 'users', invitee, 'activityInbox', activityId('JOINT_PLAN_INVITATION', id)),
      newActivity('JOINT_PLAN_INVITATION', uid, id, serverTimestamp()))
  })
}

export async function updatePlanMembership(uid, id, join, careerInstanceId = null) {
  if (join) return joinJointPlan({ db, auth }, uid, id, careerInstanceId)
  const check = session(uid)
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'jointPlans', id)
    const snapshot = await tx.get(ref)
    check()
    if (!snapshot.exists()) throw new Error('El plan ya no está disponible.')
    tx.update(ref, { ...changePlanMembership(snapshot.data(), uid, join), updatedAt: serverTimestamp() })
    if (!join) tx.delete(doc(db, 'users', uid, 'activityInbox', activityId('JOINT_PLAN_INVITATION', id)))
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
    const checkRef = doc(db, 'jointPlans', id, 'subjectChecks', code)
    const witness = snapshot.data()?.schemaVersion === 2 ? await tx.get(checkRef) : null
    check()
    if (!snapshot.exists()) throw new Error('El plan ya no está disponible.')
    const proposed = proposedSubject(snapshot.data(), uid, code, ids, serverTimestamp(), previous.data())
    if (snapshot.data().schemaVersion === 2) {
      if (previous.exists() && JSON.stringify(previous.data().proposedParticipantIds) === JSON.stringify(ids)) return
      const revision = witness.exists() ? witness.data().revision : 0
      if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) throw new Error('No se pudo validar la revisión de la propuesta.')
      tx.set(checkRef, { revision: revision + 1, actorUid: uid, updatedAt: serverTimestamp() })
    }
    tx.set(subjectRef, proposed)
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

// Lock -> drain -> atomically reserve the ID and delete parent. A failed drain is resumable.
export async function deleteJointPlan(uid, id) {
  const check = session(uid)
  const ref = doc(db, 'jointPlans', id)
  let instancePlan = false
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref)
    check()
    if (!snapshot.exists() || snapshot.data().ownerId !== uid || !snapshot.data().closed) throw new Error('Solo el creador puede eliminar un plan cerrado.')
    instancePlan = snapshot.data().schemaVersion === 2
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
  // Counters survive individual subject removal. Only a locked retirement drains them.
  if (instancePlan) while (true) {
    check()
    const page = await getDocsFromServer(query(collection(db, 'jointPlans', id, 'subjectChecks'), limit(100)))
    check()
    if (page.empty) break
    const batch = writeBatch(db)
    page.docs.forEach(item => batch.delete(item.ref))
    await batch.commit()
  }
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref)
    check()
    if (!snapshot.exists()) return
    if (snapshot.data().ownerId !== uid || !snapshot.data().closed || !snapshot.data().deleting) throw new Error('El plan no está bloqueado para eliminar.')
    tx.set(doc(db, 'jointPlanTombstones', id), { deletedAt: serverTimestamp() })
    for (const invitee of snapshot.data().inviteeIds) tx.delete(doc(db, 'users', invitee, 'activityInbox', activityId('JOINT_PLAN_INVITATION', id)))
    tx.delete(ref)
  })
}

export function subscribeJointSubjects(id, onData, onError) {
  return onSnapshot(collection(db, 'jointPlans', id, 'subjects'), { includeMetadataChanges: true },
    (snapshot) => onData(snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites ? null
      : snapshot.docs.map((item) => item.data())), onError)
}
