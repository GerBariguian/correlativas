// Architectural alternatives only. Never used by application or deployment.
const {invitations}=require('./distributed-invitation-updates.cjs')
const {friendActivity}=require('./distributed-friend-activity.cjs')
function replaceFunction(rules,start,end,body){const a=rules.indexOf(start),b=rules.indexOf(end,a);if(a<0||b<0)throw Error('Missing architectural seam '+start);return rules.slice(0,a)+body+rules.slice(b)}
function children(original){
 let rules=friendActivity(invitations(original))
 rules=replaceFunction(rules,'    function versionedNoticeRequired(','    function invitationCycle(',`    function versionedNoticeRequired(uid, planId, index) {
      let o=request.resource.data.invitationOccurrences[uid];
      let path=/databases/$(database)/documents/jointPlans/$(planId)/invitations/$(string(o));
      return o == index + 1 && !exists(path) && existsAfter(path);
    }
`)
 const start=rules.indexOf('        function validVersionedInvitation() {'),end=rules.indexOf('        function validNotice() {',start)
 let activity=rules.slice(start,end)
 // Preserve the complete Activity shape; specific academic/source checks move to the child permission.
 const tail=activity.indexOf('            && p.schemaVersion == 2')
 if(start<0||end<0||tail<0)throw Error('Missing Activity shape')
 activity=activity.slice(0,tail)+`            && !exists(path) && p.inviteeUid == uid && p.invitedBy == n.actorUid
            && p.friendshipCycleId == n.friendshipCycleId && p.occurrence == n.occurrence;
        }
`
 activity=activity.replace('documents/jointPlans/$(n.target.id);','documents/jointPlans/$(n.target.id)/invitations/$(string(n.occurrence));')
 rules=rules.slice(0,start)+activity+rules.slice(end)
 rules=rules.replace('    function signedIn()',()=>`    match /jointPlans/{planId}/invitations/{invitationId} {
      allow get: if socialUser() && request.auth.uid in [resource.data.inviteeUid, resource.data.invitedBy];
      allow list, update, delete: if false;
      allow create: if socialUser() && validInvitationChild();
      function validInvitationChild() {
        let d=request.resource.data;
        let parent=/databases/$(database)/documents/jointPlans/$(planId);
        let p=getAfter(parent).data;
        let b=p.participants[d.inviteeUid];
        let notice=/databases/$(database)/documents/users/$(d.inviteeUid)/activityInbox/$('jp_' + planId + '_' + string(d.occurrence));
        return d.keys().hasAll(['inviteeUid','invitedBy','friendshipCycleId','occurrence','createdAt'])
          && d.keys().hasOnly(['inviteeUid','invitedBy','friendshipCycleId','occurrence','createdAt'])
          && d.inviteeUid is string && d.inviteeUid.matches('^[A-Za-z0-9_-]+$')
          && d.invitedBy == request.auth.uid && d.invitedBy != d.inviteeUid
          && d.friendshipCycleId is string && d.friendshipCycleId.matches('^[A-Za-z0-9_-]{16,64}$')
          && d.occurrence is int && d.occurrence >= 1 && d.occurrence <= 9007199254740991
          && invitationId == string(d.occurrence) && d.createdAt == request.time
          && !exists(parent) && p.schemaVersion == 2 && d.inviteeUid in p.inviteeIds
          && p.invitedBy[d.inviteeUid] == d.invitedBy && p.invitationCycles[d.inviteeUid] == d.friendshipCycleId
          && p.invitationOccurrences[d.inviteeUid] == d.occurrence
          && instanceAuthority(d.invitedBy) && socialAuthorityAvailable(d.inviteeUid)
          && invitationCycle(d.inviteeUid,d.friendshipCycleId)
          && b.keys().hasAll(['careerInstanceId','bindingState']) && b.keys().hasOnly(['careerInstanceId','bindingState'])
          && b.careerInstanceId == null && b.bindingState == 'unresolved'
          && !exists(notice) && existsAfter(notice);
      }
    }
    function signedIn()`)
 rules=rules.replace('        let inviter=p.invitedBy[uid];',`        let c=get(/databases/$(database)/documents/jointPlans/$(planId)/invitations/$(string(p.invitationOccurrences[uid]))).data;
        let inviter=p.invitedBy[uid];`)
 rules=rules.replace("return (a != null && b == null && a.data.status == 'accepted' && a.data.cycleId == p.invitationCycles[uid])", "return c.inviteeUid == uid && c.invitedBy == inviter && c.occurrence == p.invitationOccurrences[uid] && c.friendshipCycleId == p.invitationCycles[uid] && ((a != null && b == null && a.data.status == 'accepted' && a.data.cycleId == p.invitationCycles[uid])")
 rules=rules.replace("|| (b != null && a == null && b.data.status == 'accepted' && b.data.cycleId == p.invitationCycles[uid]);", "|| (b != null && a == null && b.data.status == 'accepted' && b.data.cycleId == p.invitationCycles[uid]));")
 return rules
}
module.exports={children,replaceFunction}

function manifest(original){
 let rules=friendActivity(invitations(original))
 const start=rules.indexOf('      allow create: if socialUser() && validInstancePlanShape()'),end=rules.indexOf('      allow create: if socialUser() && validPlan()',start)
 if(start<0||end<0)throw Error('Missing CREATE E seam')
 let parent=rules.slice(start,end)
 const link=parent.indexOf('        && validInvitee(')
 if(link<0)throw Error('Missing parent fanout seam')
 parent=parent.slice(0,link)+'        && requiredCreationManifest(planId);\n'
 rules=rules.slice(0,start)+parent+rules.slice(end)
 rules=rules.replace('    function signedIn()',()=>`    function requiredCreationManifest(planId) {
      let path=/databases/$(database)/documents/jointPlans/$(planId)/invitationManifests/create;
      return !exists(path) && existsAfter(path);
    }
    match /jointPlans/{planId}/invitationManifests/{manifestId} {
      allow read, update, delete: if false;
      allow create: if socialUser() && manifestId == 'create' && validCreationManifest();
      function validCreationManifest() {
        let d=request.resource.data;
        let path=/databases/$(database)/documents/jointPlans/$(planId);
        let p=getAfter(path).data;
        return d.keys().hasAll(['inviteeIds','invitedBy','invitationCycles','invitationOccurrences','participants','invitationSerial','createdAt'])
          && d.keys().hasOnly(['inviteeIds','invitedBy','invitationCycles','invitationOccurrences','participants','invitationSerial','createdAt'])
          && !exists(path) && p.schemaVersion == 2 && p.ownerId == request.auth.uid
          && d.createdAt == request.time && d.inviteeIds == p.inviteeIds && d.invitedBy == p.invitedBy
          && d.invitationCycles == p.invitationCycles && d.invitationOccurrences == p.invitationOccurrences
          && d.participants == p.participants && d.invitationSerial == p.invitationSerial
          && manifestNotice(d,0) && manifestNotice(d,1) && manifestNotice(d,2) && manifestNotice(d,3);
      }
      function manifestNotice(d,index) {
        return d.inviteeIds.size() <= index || (d.inviteeIds[index] is string
          && d.inviteeIds[index].matches('^[A-Za-z0-9_-]+$')
          && d.invitedBy[d.inviteeIds[index]] == request.auth.uid
          && d.invitationOccurrences[d.inviteeIds[index]] == index + 1
          && freshManifestNotice(d.inviteeIds[index],d.invitationOccurrences[d.inviteeIds[index]]));
      }
      function freshManifestNotice(uid,occurrence) {
        let path=/databases/$(database)/documents/users/$(uid)/activityInbox/$('jp_' + planId + '_' + string(occurrence));
        return !exists(path) && existsAfter(path);
      }
    }
    function signedIn()`)
 return rules
}
module.exports.manifest=manifest
