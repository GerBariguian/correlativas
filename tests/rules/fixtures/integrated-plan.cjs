// Isolated experiment. Never loaded by product/deployment.
const {discoveryRefs}=require('./discovery-ref.cjs')
function integrated(original){
 let r=discoveryRefs(original)
 const start=r.indexOf('    match /jointPlans/{planId} {'),end=r.indexOf('    match /users/{u}/activityInbox/{id} {',start)
 if(start<0||end<0)throw Error('Missing integrated seams')
 let p=r.slice(start,end)
 p=p.replace(/allow ([^:]+): if socialUser\(\)/g,'allow $1: if published() && socialUser()')
 p=p.replace(/allow (get(?:,list)?): if published\(\)/g,'allow $1: if readable()')
 p=p.replace('      function parent()',`      function readable() {
        return get(/databases/$(database)/documents/prototypePlanControls/$(planId)).data.state == 'active'
          && !get(/databases/$(database)/documents/jointPlans/$(planId)).data.deleting;
      }
      function published() {
        return getAfter(/databases/$(database)/documents/prototypePlanControls/$(planId)).data.state == 'active'
          && !getAfter(/databases/$(database)/documents/jointPlans/$(planId)).data.deleting;
      }
      function parent()`)
 // Existing slot pointers carry ONLY current occupancy identity. Provenance lives
 // in the protected checkpoint. Imported tokens cannot be C invitation IDs.
 p=p.replace('opaqueId(r.occurrence) && edgeSlot(u,r)',()=>"(opaqueId(r.occurrence) || r.occurrence.matches('^import_[A-Za-z0-9]{16,40}$')) && edgeSlot(u,r)")
 p=p.replace('      allow delete,list: if false;',`      allow update: if socialUser() && resource.data.schemaVersion == 30
        && !resource.data.deleting && request.auth.uid == resource.data.ownerId && slotAuthority(request.auth.uid)
        && get(/databases/$(database)/documents/prototypePlanControls/$(planId)).data.state == 'active'
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['closed','deleting'])
        && request.resource.data.closed && request.resource.data.deleting
        && !exists(/databases/$(database)/documents/jointPlanTombstones/$(planId))
        && getAfter(/databases/$(database)/documents/jointPlanTombstones/$(planId)).data.deletedAt == request.time;
      allow delete,list: if false;`)
 // Minimal legacy self-JOIN surface: proves allow-before / deny-after freeze.
 // Separate explicit family; never accepts writes to C or creates C authority.
 p+=`    match /jointPlans/{legacyId} {
      allow update: if socialUser() && !('schemaVersion' in resource.data)
        && !('schemaVersion' in request.resource.data)
        && get(/databases/$(database)/documents/prototypeLegacyControls/$(legacyId)).data.state == 'open'
        && !resource.data.closed && !resource.data.deleting
        && request.auth.uid != resource.data.ownerId && request.auth.uid in resource.data.inviteeIds
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['memberIds','updatedAt'])
        && request.resource.data.memberIds.toSet() == resource.data.memberIds.toSet().union([request.auth.uid].toSet())
        && request.resource.data.memberIds.size() == request.resource.data.memberIds.toSet().size()
        && request.resource.data.updatedAt == request.time
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.activeCareerId == resource.data.careerId;
    }
`
 r=r.slice(0,start)+p+r.slice(end)
 // Replace existing tombstone grant, rather than add a permissive overlapping grant.
 const ts=r.indexOf('    match /jointPlanTombstones/{planId} {');let te=r.indexOf(' {',ts)+2,depth=1
 for(;depth;te++){if(r[te]==='{')depth++;if(r[te]==='}')depth--}
 if(ts<0||te<0)throw Error('Tombstone seam')
 r=r.slice(0,ts)+`    match /jointPlanTombstones/{planId} {
      allow read,update,delete: if false;
      allow create: if socialUser() && slotAuthority(request.auth.uid)
        && request.resource.data.keys().hasOnly(['deletedAt']) && request.resource.data.deletedAt == request.time
        && get(/databases/$(database)/documents/jointPlans/$(planId)).data.schemaVersion == 30
        && get(/databases/$(database)/documents/jointPlans/$(planId)).data.ownerId == request.auth.uid
        && !get(/databases/$(database)/documents/jointPlans/$(planId)).data.deleting
        && getAfter(/databases/$(database)/documents/jointPlans/$(planId)).data.deleting
        && getAfter(/databases/$(database)/documents/jointPlans/$(planId)).data.closed;
    }
`+r.slice(te)
 return r
}
module.exports={integrated}
