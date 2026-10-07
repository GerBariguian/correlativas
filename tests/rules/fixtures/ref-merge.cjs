// Isolated S2-E1-P variant. Never a deployment input.
const {discoveryRefs}=require('./discovery-ref.cjs')
function refMerge(original){
 // The old prototype replaces legacy plan rules. Exclude the subsequently added
 // parallel product C block in-memory so it cannot duplicate prototype seams or
 // accidentally grant access. This is NOT validation of product Rules.
 const start=original.indexOf('    function cDiscoveryRef(u,p) {')
 const end=original.indexOf('    match /friendships/{id} {',start)
 if(start<0||end<start)throw Error('Missing isolated product C boundary')
 let r=discoveryRefs(original.slice(0,start)+original.slice(end))
 const replace=(a,b)=>{if(r.split(a).length!==2)throw Error('Ambiguous ref merge seam');r=r.replace(a,()=>b)}
 replace("d.keys().hasAll(['schemaVersion','createdAt'])","d.keys().hasAll(['schemaVersion'])")
 replace('&& d.schemaVersion == 1 && d.createdAt is timestamp;',"&& d.schemaVersion == 1 && (!('createdAt' in d) || d.createdAt is timestamp);")
 replace('      allow update,delete: if false;\n      allow create: if socialUser() && discoveryRef(u,p)',`      allow delete: if false;
      allow update: if socialUser() && discoveryRef(u,p)
        && request.resource.data == resource.data && invited();
      allow create: if socialUser() && discoveryRef(u,p)`)
 replace('&& request.resource.data.createdAt == request.time && acquisition();',"&& (!('createdAt' in request.resource.data) || request.resource.data.createdAt == request.time) && acquisition();")
 return r
}
module.exports={refMerge}
