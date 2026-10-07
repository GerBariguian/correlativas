import { doc, runTransaction, getDocFromServer, serverTimestamp } from 'firebase/firestore'
import { resolveUserDataAuthority } from '../userDataAuthorityLogic'
import { canonicalFriendshipId, decodeFriendshipCycle } from '../friendshipCycleLogic'
import { jointCInvitationOccurrencePath, decodeJointCInvitationOccurrence } from '../jointPlanLogic'
import { buildJointCJoin } from '../jointJoinLogic'
import { decodeCareerMetadata, decodeCatalogMembership, validateCareerPersistenceId } from '../careerInstancePersistenceLogic'
import { changePlanMembership, jointCPlanPath, jointCSlotPath, decodeJointCPlan, decodeJointCSlot } from '../jointPlanLogic'
import { sameJoinValue, jointJoinError, assertJoinPlan, buildJointJoin, compatibleJoinAdvance, buildJointCRelease } from '../jointJoinLogic'

// Explicit occupancy compare-and-release. No recovery writes or legacy fallback.
// Publication/authority and hostile-client enforcement remain Rules obligations.
export async function releaseJointCSlot({ db, auth }, uid, planId, slotId, expectedOccurrence, expectedRevision) {
  const user = auth.currentUser
  const check = () => {
    if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(uid)
      || !user || user.uid !== uid || auth.currentUser !== user) throw jointJoinError('JOINT_RELEASE_SESSION_CHANGED')
  }
  check()
  const parentPath = jointCPlanPath(planId), slotPath = jointCSlotPath(planId, slotId)
  if (typeof expectedOccurrence !== 'string' || !/^(?:import_)?[A-Za-z0-9]{16,40}$/.test(expectedOccurrence)
    || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw jointJoinError('JOINT_RELEASE_INVALID_OCCUPANCY')
  const slotRef = doc(db, slotPath), indexRef = doc(db, `${parentPath}/inviteeIndex/${uid}`)
  await runTransaction(db, async tx => {
    check()
    const parent = await tx.get(doc(db, parentPath))
    const current = await tx.get(slotRef)
    const index = await tx.get(indexRef)
    check()
    if (!parent.exists() || !current.exists()) throw jointJoinError('JOINT_RELEASE_UNAVAILABLE')
    const plan = decodeJointCPlan(parent.data()), slot = decodeJointCSlot(current.data())
    if (plan.deleting || plan.ownerId === uid) throw jointJoinError('JOINT_RELEASE_UNAVAILABLE')
    if (slot.uid !== uid || slot.occurrence !== expectedOccurrence || slot.revision !== expectedRevision)
      throw jointJoinError('JOINT_RELEASE_STALE_OCCUPANCY')
    const pointer = index.exists() ? index.data() : null
    if (!pointer || Object.keys(pointer).length !== 1 || pointer.slotId !== slotId)
      throw jointJoinError('JOINT_RELEASE_INVALID_INDEX')
    const released = decodeJointCSlot(buildJointCRelease(slot, uid, serverTimestamp()))
    tx.update(slotRef, released)
    tx.delete(indexRef)
  })
  check()
  return { planId, slotId, revision: expectedRevision + 1, status: 'released' }
}

// Standalone C JOIN. The occurrence is read inside this transaction, never via
// a separate GET: invitation, occupancy and friendship must share one snapshot.
export async function joinJointCPlan({ db, auth }, uid, planId, occurrenceId, careerInstanceId) {
  const user = auth.currentUser
  const check = () => {
    if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(uid)
      || !user || user.uid !== uid || auth.currentUser !== user) throw jointJoinError('JOINT_JOIN_SESSION_CHANGED')
  }
  check()
  const parentPath = jointCPlanPath(planId)
  const occurrencePath = jointCInvitationOccurrencePath(planId, occurrenceId)
  validateCareerPersistenceId(careerInstanceId)
  await runTransaction(db, async tx => {
    check()
    const p = await tx.get(doc(db, parentPath))
    const o = await tx.get(doc(db, occurrencePath))
    check()
    if (!p.exists() || !o.exists()) throw jointJoinError()
    const plan = decodeJointCPlan(p.data())
    const { occurrence } = decodeJointCInvitationOccurrence(planId, occurrenceId, o.data())
    if (plan.closed || plan.deleting || plan.ownerId === uid || occurrence.uid !== uid) throw jointJoinError()
    const slotRef = doc(db, jointCSlotPath(planId, occurrence.slotId))
    const s = await tx.get(slotRef)
    const i = await tx.get(doc(db, `${parentPath}/inviteeIndex/${uid}`))
    if (!s.exists() || !i.exists()) throw jointJoinError()
    const slot = decodeJointCSlot(s.data()), index = i.data()
    if (Object.keys(index).length !== 1 || index.slotId !== occurrence.slotId
      || slot.uid !== uid || slot.occurrence !== occurrenceId || slot.revision !== occurrence.revision
      || slot.invitedBy !== occurrence.invitedBy || slot.cycle !== occurrence.cycle) throw jointJoinError()
    const relationshipId = canonicalFriendshipId(occurrence.invitedBy, uid)
    const f = await tx.get(doc(db, 'friendships', relationshipId))
    const reverse = await tx.get(doc(db, 'friendships', relationshipId.split(':').reverse().join(':')))
    if (f.exists() === reverse.exists()) throw jointJoinError()
    const friend = decodeFriendshipCycle(relationshipId, (f.exists() ? f : reverse).data())
    if (friend.status !== 'accepted' || friend.cycleId !== occurrence.cycle) throw jointJoinError()
    const c = await tx.get(doc(db, 'migrationUsers', uid))
    const authority = resolveUserDataAuthority(uid, c.exists() ? c.data() : null)
    if (authority.authority !== 'instances' || authority.phase !== 'complete') throw jointJoinError()
    const m = await tx.get(doc(db, 'users', uid, 'careerInstances', careerInstanceId))
    if (!m.exists()) throw jointJoinError()
    const { instance } = decodeCareerMetadata(uid, careerInstanceId, m.data())
    if (instance.lifecycle !== 'active' || instance.catalogId !== plan.catalogId) throw jointJoinError()
    const next = buildJointCJoin(slot, uid, careerInstanceId, occurrenceId, serverTimestamp())
    check()
    tx.update(slotRef, { status: next.status, binding: next.binding,
      joinedOccurrence: next.joinedOccurrence, updatedAt: next.updatedAt })
  })
  check()
  return { planId, occurrenceId, careerInstanceId, status: 'joined' }
}

export async function joinJointPlan({ db, auth }, uid, id, requestedInstanceId = null) {
  validateCareerPersistenceId(id)
  if (requestedInstanceId !== null) validateCareerPersistenceId(requestedInstanceId)
  const user = auth.currentUser
  const check = () => { if (!user || user.uid !== uid || auth.currentUser !== user) throw jointJoinError('JOINT_JOIN_SESSION_CHANGED') }
  check()
  const planRef = doc(db, 'jointPlans', id), controlRef = doc(db, 'migrationUsers', uid)
  let attempted = null
  const run = () => runTransaction(db, async tx => {
    check(); attempted = null
    const p = await tx.get(planRef), c = await tx.get(controlRef)
    check()
    if (!p.exists()) throw jointJoinError()
    const plan = p.data(), control = c.exists() ? c.data() : null
    const authority = resolveUserDataAuthority(uid, control)
    if (authority.capabilities.legacySocial && plan.schemaVersion !== 2) {
      if (requestedInstanceId !== null) throw jointJoinError()
      const changes = changePlanMembership(plan, uid, true)
      check(); tx.update(planRef, { ...changes, updatedAt: serverTimestamp() }); return 'joined'
    }
    if (authority.authority !== 'instances' || !authority.capabilities.academicWrite) throw jointJoinError()
    assertJoinPlan(plan, uid)
    const indexRef = doc(db, 'users', uid, 'catalogMemberships', plan.catalogId), indexSnapshot = await tx.get(indexRef)
    if (!indexSnapshot.exists()) throw jointJoinError()
    const index = indexSnapshot.data(), instanceId = decodeCatalogMembership(index)
    if (requestedInstanceId !== null && requestedInstanceId !== instanceId) throw jointJoinError()
    const metadataRef = doc(db, 'users', uid, 'careerInstances', instanceId), m = await tx.get(metadataRef)
    if (!m.exists()) throw jointJoinError()
    const metadata = m.data(), { instance } = decodeCareerMetadata(uid, instanceId, metadata)
    if (instance.lifecycle !== 'active' || instance.catalogId !== plan.catalogId) throw jointJoinError()
    const changes = buildJointJoin(plan, uid, instanceId)
    check()
    if (!changes) return 'already-joined'
    attempted = { plan, control, metadata, index, instanceId, indexRef, metadataRef }
    tx.update(planRef, { ...changes, updatedAt: serverTimestamp() })
    return 'joined'
  }, { maxAttempts: 5 })
  try { return await run() }
  catch (error) {
    check()
    const prior = attempted
    if (error?.code !== 'permission-denied' || !prior) throw error
    // Server-only evidence read. It cannot authorize the second transaction.
    let evidence
    try {
      evidence = await Promise.all([planRef, controlRef, prior.metadataRef, prior.indexRef].map(ref => getDocFromServer(ref)))
      check()
    } catch { check(); throw error }
    const [p, c, m, i] = evidence
    if (!evidence.every(s => s.exists()) || !sameJoinValue(c.data(), prior.control)
      || !sameJoinValue(m.data(), prior.metadata) || !sameJoinValue(i.data(), prior.index)
      || !compatibleJoinAdvance(prior.plan, p.data(), uid, prior.instanceId)) throw error
    // Exactly one external recovery; all paths, authority and payload are rebuilt.
    return run()
  }
}
