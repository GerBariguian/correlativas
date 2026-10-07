// Frozen JOIN implementation audited before integration. Diagnostic only.
function session(uid) {
  const user = auth.currentUser
  if (user?.uid !== uid) throw new Error('Session changed')
  return () => { if (auth.currentUser !== user) throw new Error('Session changed') }
}
async function updatePlanMembership(uid, id, join) {
  const check = session(uid)
  await runTransaction(db, async tx => {
    const ref = doc(db, 'jointPlans', id)
    const snapshot = await tx.get(ref)
    check()
    if (!snapshot.exists()) throw new Error('Plan unavailable')
    tx.update(ref, { ...changePlanMembership(snapshot.data(), uid, join), updatedAt: serverTimestamp() })
    if (!join) tx.delete(doc(db, 'users', uid, 'activityInbox', activityId('JOINT_PLAN_INVITATION', id)))
  })
}
