// Isolated extension of COMPLETE current Rules. Never loaded by the app/deploy.
function versionedInvitations(original) {
  const once = (s, a, b) => { if (!s.includes(a)) throw Error('Fixture seam missing: ' + a); return s.replace(a, () => b) }
  let rules = original
  const fields = "'participants', 'name', 'invitedBy', 'closed', 'deleting', 'createdAt', 'updatedAt']"
  if (rules.split(fields).length !== 3) throw Error('Expected exact shape hasAll + hasOnly')
  rules = rules.replaceAll(fields, "'participants', 'name', 'invitedBy', 'closed', 'deleting', 'createdAt', 'updatedAt', 'invitationSerial', 'invitationCycles', 'invitationOccurrences']")
  rules = once(rules, '&& d.schemaVersion is int && d.schemaVersion == 2', `&& d.invitationSerial is int && d.invitationSerial >= 1 && d.invitationSerial <= 9007199254740991
          && d.invitationCycles is map && d.invitationOccurrences is map
          && d.invitationCycles.keys().toSet() == d.inviteeIds.toSet()
          && d.invitationOccurrences.keys().toSet() == d.inviteeIds.toSet()
          && d.schemaVersion is int && d.schemaVersion == 2`)
  rules = once(rules, 'allow create: if socialUser() && validInstancePlanShape()', `allow create: if socialUser() && validInstancePlanShape()
        && request.resource.data.invitationSerial == request.resource.data.inviteeIds.size()`)
  rules = once(rules, '&& ids[index].matches(\'^[A-Za-z0-9_-]+$\') && invitationRequired(ids[index], planId)', `&& ids[index].matches('^[A-Za-z0-9_-]+$')
          && (request.resource.data.get('schemaVersion', 0) == 2
            ? versionedNoticeRequired(ids[index], planId, index) : invitationRequired(ids[index], planId))`)
  rules = once(rules, 'function invitationRequired(uid, planId) {', `function versionedNoticeRequired(uid, planId, index) {
      let p = request.resource.data;
      let occurrence = p.invitationOccurrences[uid];
      let path = /databases/$(database)/documents/users/$(uid)/activityInbox/$('jp_' + planId + '_' + string(occurrence));
      let n = getAfter(path).data;
      return activityCreationEnabled() && occurrence is int
        && (resource == null ? occurrence == index + 1 : occurrence == p.invitationSerial)
        && !exists(path) && n.schemaVersion == 2 && n.type == 'JOINT_PLAN_INVITATION'
        && n.actorUid == request.auth.uid && n.target.kind == 'jointPlan' && n.target.id == planId
        && n.occurrence == occurrence && n.friendshipCycleId == p.invitationCycles[uid]
        && n.createdAt == request.time && n.readAt == null;
    }
    function invitationCycle(uid, expected) {
      let a = getAfter(/databases/$(database)/documents/friendships/$(request.auth.uid + ':' + uid));
      let b = getAfter(/databases/$(database)/documents/friendships/$(uid + ':' + request.auth.uid));
      return (a != null && b == null && a.data.status == 'accepted' && a.data.cycleId == expected)
        || (b != null && a == null && b.data.status == 'accepted' && b.data.cycleId == expected);
    }
    function invitationRequired(uid, planId) {`)
  // A legacy notice must not serve as a second route for a v2 invitation.
  rules = once(rules, "return (after.get('schemaVersion', 0) == 2", "return after.get('schemaVersion', 0) != 2 && (after.get('schemaVersion', 0) == 2")
  rules = once(rules, 'function validNotice() {', `// Complete v2 notice. Existing recipient-private read/readAt remain unchanged.
        allow create: if socialUser() && activityCreationEnabled() && validVersionedInvitation();
        function validVersionedInvitation() {
          let n = request.resource.data;
          let path = /databases/$(database)/documents/jointPlans/$(n.target.id);
          let p = getAfter(path).data;
          return n.keys().hasAll(['schemaVersion', 'type', 'actorUid', 'createdAt', 'target', 'readAt', 'friendshipCycleId', 'occurrence'])
            && n.keys().hasOnly(['schemaVersion', 'type', 'actorUid', 'createdAt', 'target', 'readAt', 'friendshipCycleId', 'occurrence'])
            && n.schemaVersion is int && n.schemaVersion == 2 && n.type == 'JOINT_PLAN_INVITATION'
            && n.actorUid == request.auth.uid && n.actorUid != uid
            && n.createdAt == request.time && n.readAt == null
            && n.target is map && n.target.keys().hasAll(['kind', 'id']) && n.target.keys().hasOnly(['kind', 'id'])
            && n.target.kind == 'jointPlan' && n.target.id is string && n.target.id.matches('^[A-Za-z0-9_-]{1,100}$')
            && n.friendshipCycleId is string && n.friendshipCycleId.matches('^[A-Za-z0-9_-]{16,64}$')
            && n.occurrence is int && n.occurrence >= 1 && n.occurrence <= 9007199254740991
            && itemId == 'jp_' + n.target.id + '_' + string(n.occurrence)
            && p.schemaVersion == 2 && uid in p.inviteeIds && p.invitedBy[uid] == request.auth.uid
            && p.invitationCycles[uid] == n.friendshipCycleId && p.invitationOccurrences[uid] == n.occurrence
            && instanceAuthority(request.auth.uid) && socialAuthorityAvailable(uid)
            && invitationCycle(uid, n.friendshipCycleId)
            // First feasibility gate: CREATE only, no incomplete INVITE authorization.
            && !exists(path) && validCreationRecipient(p);
        }
        function validNotice() {`)
  return rules
}
module.exports = { versionedInvitations }
