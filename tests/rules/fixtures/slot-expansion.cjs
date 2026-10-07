// Isolated expansion; never used by production or deployment.
const {slots}=require('./slot-prototype.cjs')
function replace(r,a,b){if(!r.includes(a))throw Error('Missing expansion seam: '+a);return r.replace(a,b)}
function expanded(original){
 let r=slots(original)
 r=replace(r,'(activation() || joining())',`(request.resource.data.status == 'empty' ? releasing() : (activation() || joining()))`)
 r=replace(r,'        function joining() {',`        function releasing() {
          let a=request.resource.data;
          let b=resource.data;
          let p=parent();
          return p.schemaVersion == 30 && !p.deleting && slotAuthority(request.auth.uid)
            && b.uid == request.auth.uid && b.status in ['pending','member']
            && a.keys() == b.keys() && a.status == 'empty' && a.uid == null
            && a.revision == b.revision+1 && a.revision <= 9007199254740991
            && a.occurrence == null && a.cycle == null && a.invitedBy == null
            && a.binding == null && a.joinedOccurrence == null && a.updatedAt == request.time
            && get(/databases/$(database)/documents/jointPlans/$(planId)/inviteeIndex/$(b.uid)).data.slotId == s
            && !existsAfter(/databases/$(database)/documents/jointPlans/$(planId)/inviteeIndex/$(b.uid));
        }
        function joining() {`)
 r=replace(r,'        allow update,delete,list: if false;',`        allow delete: if socialUser() && u == request.auth.uid
          && get(/databases/$(database)/documents/jointPlans/$(planId)/slots/$(resource.data.slotId)).data.uid == u
          && getAfter(/databases/$(database)/documents/jointPlans/$(planId)/slots/$(resource.data.slotId)).data.status == 'empty'
          && getAfter(/databases/$(database)/documents/jointPlans/$(planId)/slots/$(resource.data.slotId)).data.revision
            == get(/databases/$(database)/documents/jointPlans/$(planId)/slots/$(resource.data.slotId)).data.revision+1;
        allow update,list: if false;`)
 r=replace(r,'      match /invitationOccurrences/{o} {',require('node:fs').readFileSync('tests/rules/fixtures/slot-subjects.fragment.rules','utf8')+'\n      match /invitationOccurrences/{o} {')
 return r
}
module.exports={expanded}
