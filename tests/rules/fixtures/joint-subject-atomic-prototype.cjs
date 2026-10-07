// Isolated design prototype. NEVER imported by the app or deployment tooling.
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
module.exports = () => {
  const source = readFileSync(resolve(__dirname, '../../../firestore.rules'), 'utf8')
  const start = source.indexOf('    function validAuthority(')
  const end = source.indexOf('    function metadataWritable(')
  if (start < 0 || end <= start) throw Error('Authority fixture extraction failed')
  // Evaluate the final atomic state. No fixture client may mutate controls.
  const authority = source.slice(start, end).replaceAll('get(', 'getAfter(')
  return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    ${authority}
    function social() {
      return request.auth != null && request.auth.token.email_verified == true
        && request.auth.token.firebase.sign_in_provider == 'google.com';
    }
    function member(p) { return social() && request.auth.uid in p.memberIds; }
    function editor(p) { return member(p) && p.schemaVersion == 2 && !p.closed && !p.deleting; }
    function bound(p, uid) {
      let b = p.participants[uid];
      let i = getAfter(/databases/$(database)/documents/users/$(uid)/careerInstances/$(b.careerInstanceId)).data;
      return b.bindingState == 'resolved' && i.schemaVersion == 1
        && i.lifecycle == 'active' && i.catalogId == p.catalogId;
    }
    function boundAt(p, ids, n) {
      return ids.size() <= n || ids[n] == request.auth.uid || bound(p, ids[n]);
    }
    function authorityAt(ids, n) {
      return ids.size() <= n || ids[n] == request.auth.uid || instanceAuthority(ids[n]);
    }
    match /jointPlans/{planId} {
      allow get: if member(resource.data);
      // Prototype supports only monotonic closure for race tests, not creation/join.
      allow update: if social() && request.auth.uid == resource.data.ownerId
        && instanceAuthority(request.auth.uid)
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['closed'])
        && request.resource.data.closed == true;
      function planAfter() { return getAfter(/databases/$(database)/documents/jointPlans/$(planId)).data; }
      match /subjectChecks/{code} {
        allow get: if member(get(/databases/$(database)/documents/jointPlans/$(planId)).data);
        allow create, update: if validCheck();
        function validCheck() {
          let p = planAfter();
          let before = get(/databases/$(database)/documents/jointPlans/$(planId)/subjects/$(code));
          let after = getAfter(/databases/$(database)/documents/jointPlans/$(planId)/subjects/$(code)).data;
          let d = request.resource.data;
          let ids = after.proposedParticipantIds.removeAll(before == null ? [] : before.data.proposedParticipantIds);
          return editor(p) && instanceAuthority(request.auth.uid)
            && d.keys().hasAll(['revision', 'actorUid', 'updatedAt'])
            && d.keys().hasOnly(['revision', 'actorUid', 'updatedAt'])
            && d.revision is int && d.revision > 0 && d.revision <= 9007199254740991
            && (resource == null ? d.revision == 1 : d.revision == resource.data.revision + 1)
            && d.actorUid == request.auth.uid && d.updatedAt == request.time
            && (before == null || before.data != after)
            && after.updatedAt == request.time
            && authorityAt(ids, 0) && authorityAt(ids, 1) && authorityAt(ids, 2)
            && authorityAt(ids, 3) && authorityAt(ids, 4);
        }
      }
      match /subjects/{code} {
        allow get: if member(get(/databases/$(database)/documents/jointPlans/$(planId)).data);
        allow create, update: if validSubject();
        function validSubject() {
          let p = planAfter();
          let checkBefore = get(/databases/$(database)/documents/jointPlans/$(planId)/subjectChecks/$(code));
          let checkAfter = getAfter(/databases/$(database)/documents/jointPlans/$(planId)/subjectChecks/$(code)).data;
          let d = request.resource.data;
          let ids = d.proposedParticipantIds;
          let added = ids.removeAll(resource == null ? [] : resource.data.proposedParticipantIds);
          return editor(p) && bound(p, request.auth.uid)
            && (checkBefore == null ? checkAfter.revision == 1 : checkAfter.revision == checkBefore.data.revision + 1)
            && checkAfter.actorUid == request.auth.uid && checkAfter.updatedAt == request.time
            && d.keys().hasAll(['code', 'proposedParticipantIds', 'addedByUid', 'createdAt', 'updatedAt'])
            && d.keys().hasOnly(['code', 'proposedParticipantIds', 'addedByUid', 'createdAt', 'updatedAt'])
            && d.code == code && code.size() > 0 && code.size() <= 100
            && d.updatedAt == request.time
            && (resource == null ? d.addedByUid == request.auth.uid && d.createdAt == request.time
              : d.addedByUid == resource.data.addedByUid && d.createdAt == resource.data.createdAt)
            && ids is list && ids.size() >= 2 && ids.size() <= 5
            && ids.toSet().size() == ids.size()
            && added.toSet().difference(p.inviteeIds.toSet()).hasOnly([p.ownerId])
            && boundAt(p, added, 0) && boundAt(p, added, 1) && boundAt(p, added, 2)
            && boundAt(p, added, 3) && boundAt(p, added, 4);
        }
      }
    }
    // Isolated lifecycle transition for same-commit and concurrent archive tests.
    match /users/{uid}/careerInstances/{id} {
      allow update: if social() && request.auth.uid == uid && instanceAuthority(uid)
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['lifecycle'])
        && request.resource.data.lifecycle in ['active', 'archived'];
    }
    // Everything else (including private academic data and authority) default-deny.
  }
}`
}
