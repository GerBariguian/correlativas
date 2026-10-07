// Isolated activation feasibility only. No production integration or recovery protocol.
const {invitations}=require('./distributed-invitation-updates.cjs')
const {friendActivity}=require('./distributed-friend-activity.cjs')
function activation(original){
 let rules=friendActivity(invitations(original))
 rules=rules.replaceAll("'invitationOccurrences']", "'invitationOccurrences', 'generationId', 'activationState']")
 rules=rules.replace('&& d.invitationSerial is int', "&& d.generationId == planId && d.activationState == 'activated' && d.invitationSerial is int")
 const a=rules.indexOf('      function validInstancePlanShape() {'),b=rules.indexOf('      function pendingBindingAt(',a)
 if(a<0||b<0)throw Error('Missing preparation schema seam')
 const shape=rules.slice(a,b).replace('function validInstancePlanShape()', 'function preparedShape()').replace('let d = request.resource.data;', 'let d = request.resource.data.plan;')
 rules=rules.replace('    function signedIn()',()=>`    match /jointPlanPreparations/{planId} {
      allow get: if socialUser() && resource.data.ownerId == request.auth.uid;
      allow list, delete: if false;
      allow create: if socialUser() && header() && request.resource.data.state == 'draft'
        && !exists(/databases/$(database)/documents/jointPlans/$(planId))
        && !exists(/databases/$(database)/documents/jointPlanTombstones/$(planId));
      allow update: if socialUser() && header() && resource.data.ownerId == request.auth.uid
        && !existsAfter(/databases/$(database)/documents/jointPlans/$(planId))
        && ((resource.data.state == 'draft' && request.resource.data.state == 'prepared' && preparedShape() && preparedGlobal())
          || (resource.data.state in ['draft','prepared'] && request.resource.data.state == 'cancelled'
            && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['state'])));
      function header() {
        return planId.matches('^[A-Za-z0-9_-]{16,64}$')
          && request.resource.data.keys().hasAll(['ownerId','state','plan'])
          && request.resource.data.keys().hasOnly(['ownerId','state','plan'])
          && request.resource.data.ownerId == request.auth.uid && request.resource.data.plan is map;
      }
${shape}
      function preparedGlobal() {
        let p=request.resource.data.plan;
        return p.ownerId == request.auth.uid && p.memberIds == [request.auth.uid]
          && p.inviteeIds.size() >= 1 && p.invitationSerial == p.inviteeIds.size()
          && !p.closed && !p.deleting
          && p.participants[p.ownerId].keys().hasAll(['careerInstanceId','bindingState'])
          && p.participants[p.ownerId].keys().hasOnly(['careerInstanceId','bindingState'])
          && p.participants[p.ownerId].bindingState == 'resolved'
          && slot(p,0) && slot(p,1) && slot(p,2) && slot(p,3);
      }
      function slot(p,index) {
        return p.inviteeIds.size() <= index || (p.inviteeIds[index] is string
          && p.inviteeIds[index].matches('^[A-Za-z0-9_-]+$')
          && p.invitedBy[p.inviteeIds[index]] == p.ownerId
          && p.invitationOccurrences[p.inviteeIds[index]] == index + 1
          && p.invitationCycles[p.inviteeIds[index]].matches('^[A-Za-z0-9_-]{16,64}$')
          && p.participants[p.inviteeIds[index]].keys().hasAll(['careerInstanceId','bindingState'])
          && p.participants[p.inviteeIds[index]].keys().hasOnly(['careerInstanceId','bindingState'])
          && p.participants[p.inviteeIds[index]].careerInstanceId == null
          && p.participants[p.inviteeIds[index]].bindingState == 'unresolved');
      }
    }
    function signedIn()`)
 const start=rules.indexOf('      allow create: if socialUser() && validInstancePlanShape()'),end=rules.indexOf('      allow create: if socialUser() && validPlan()',start)
 if(start<0||end<0)throw Error('Missing activation seam')
 rules=rules.slice(0,start)+`      allow create: if socialUser() && activatePrepared();
      function activatePrepared() {
        let p=request.resource.data;
        let prep=getAfter(/databases/$(database)/documents/jointPlanPreparations/$(planId)).data;
        return prep.state == 'prepared' && prep.ownerId == request.auth.uid
          && p.generationId == planId && p.activationState == 'activated'
          && p.diff(prep.plan).affectedKeys().hasOnly(['createdAt','updatedAt'])
          && p.createdAt == request.time && p.updatedAt == request.time
          && proposalAuthority(request.auth.uid) && operationalBinding(p,request.auth.uid)
          && !exists(/databases/$(database)/documents/jointPlanTombstones/$(planId))
          && versionedNoticeRequired(p.inviteeIds[0],planId,0)
          && activationNotice(p,1) && activationNotice(p,2) && activationNotice(p,3);
      }
      function activationNotice(p,index) {
        return p.inviteeIds.size() <= index || versionedNoticeRequired(p.inviteeIds[index],planId,index);
      }
`+rules.slice(end)
 // Operational v2 entry points explicitly require activation; draft lives elsewhere.
 rules=rules.replace("return p.get('schemaVersion', 0) == 2;", "return p.get('schemaVersion', 0) == 2 && p.get('activationState','') == 'activated';")
 rules=rules.replace('function visiblePlan(data) {','function visiblePlan(data) {')
 rules=rules.replace('return request.auth.uid == data.ownerId\n          || request.auth.uid in data.inviteeIds;', "return (data.get('schemaVersion',0) != 2 || data.get('activationState','') == 'activated') && (request.auth.uid == data.ownerId || request.auth.uid in data.inviteeIds);")
 rules=rules.replace('return request.auth.uid in data.memberIds &&', "return (data.get('schemaVersion',0) != 2 || data.get('activationState','') == 'activated') && request.auth.uid in data.memberIds &&")
 return rules
}
module.exports={activation}
