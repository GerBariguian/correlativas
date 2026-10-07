// Approved per-invitation atomicity prototype. Never deployment Rules.
const {invitations}=require('./distributed-invitation-updates.cjs')
const {friendActivity}=require('./distributed-friend-activity.cjs')
function independent(original){
 let rules=friendActivity(invitations(original))
 rules=rules.replace('d.invitationSerial >= 1','d.invitationSerial >= 0')
 rules=rules.replaceAll("'invitationOccurrences']", "'invitationOccurrences', 'joinOccurrence']")
 rules=rules.replace('&& d.invitationSerial is int','&& d.joinOccurrence is int && d.joinOccurrence >= 0 && d.joinOccurrence <= 9007199254740991 && d.invitationSerial is int')
 const a=rules.indexOf('      allow create: if socialUser() && validInstancePlanShape()'),b=rules.indexOf('      allow create: if socialUser() && validPlan()',a)
 if(a<0||b<0)throw Error('Missing base CREATE seam')
 rules=rules.slice(0,a)+`      allow create: if socialUser() && validInstancePlanShape()
        && request.resource.data.ownerId == request.auth.uid
        && request.resource.data.inviteeIds == [] && request.resource.data.memberIds == [request.auth.uid]
        && request.resource.data.invitationSerial == 0 && request.resource.data.joinOccurrence == 0
        && !request.resource.data.closed && !request.resource.data.deleting
        && request.resource.data.createdAt == request.time
        && request.resource.data.participants[request.auth.uid].keys().hasAll(['careerInstanceId','bindingState'])
        && request.resource.data.participants[request.auth.uid].keys().hasOnly(['careerInstanceId','bindingState'])
        && proposalAuthority(request.auth.uid) && operationalBinding(request.resource.data,request.auth.uid)
        && !exists(/databases/$(database)/documents/jointPlanTombstones/$(planId));
`+rules.slice(b)
 // An explicit occurrence acknowledgment makes a stale raw JOIN payload reject too.
 rules=rules.replace("hasOnly(['memberIds', 'participants', 'updatedAt'])", "hasOnly(['memberIds', 'participants', 'updatedAt', 'joinOccurrence'])")
 rules=rules.replace('&& operationalBinding(after, uid) && currentInvitation(before, uid);','&& after.joinOccurrence == before.invitationOccurrences[uid] && operationalBinding(after, uid) && currentInvitation(before, uid);')
 return rules
}
module.exports={independent}
