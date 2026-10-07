// Isolated addition to the approved C + Member Edge fixture. Never deployment input.
const {memberEdges}=require('./member-edge.cjs')
function discoveryRefs(original){
 let r=memberEdges(original)
 function replace(a,b){if(r.split(a).length!==2)throw Error('Ambiguous discovery seam: '+a);r=r.replace(a,()=>b)}
 replace("&& initialSlot('slot1')", "&& discoveryRef(request.auth.uid,planId) && initialSlot('slot1')")
 replace("&& getAfter(/databases/$(database)/documents/jointPlans/$(planId)/slots/$(request.resource.data.slotId)).data.status == 'pending';", "&& getAfter(/databases/$(database)/documents/jointPlans/$(planId)/slots/$(request.resource.data.slotId)).data.status == 'pending'\n          && discoveryRef(u,planId);")
 replace('    // ISOLATED C.',`    function discoveryRef(u,p) {
      let d=getAfter(/databases/$(database)/documents/users/$(u)/jointPlanRefs/$(p)).data;
      return d.keys().hasAll(['schemaVersion','createdAt'])
        && d.keys().hasOnly(['schemaVersion','createdAt'])
        && d.schemaVersion == 1 && d.createdAt is timestamp;
    }
    match /users/{u}/jointPlanRefs/{p} {
      allow get,list: if signedIn() && request.auth.uid == u;
      allow update,delete: if false;
      allow create: if socialUser() && discoveryRef(u,p)
        && request.resource.data.createdAt == request.time && acquisition();
      function acquisition() {
        let path=/databases/$(database)/documents/jointPlans/$(p);
        let plan=getAfter(path).data;
        return plan.schemaVersion == 30 && (plan.ownerId == u
          ? request.auth.uid == u && !exists(path) && plan.createdAt == request.time
          : invited());
      }
      function invited() {
        let idx=/databases/$(database)/documents/jointPlans/$(p)/inviteeIndex/$(u);
        let s=getAfter(idx).data.slotId;
        let path=/databases/$(database)/documents/jointPlans/$(p)/slots/$(s);
        let a=getAfter(path).data;
        return !exists(idx) && slotId(s) && get(path).data.status == 'empty'
          && a.uid == u && a.status == 'pending' && a.invitedBy == request.auth.uid
          && a.updatedAt == request.time;
      }
    }
    // ISOLATED C.`)
 return r
}
module.exports={discoveryRefs}
