// Isolated participant-local experiment, not deployable product Rules.
const fs=require('node:fs'),{expanded}=require('./slot-expansion.cjs')
function memberEdges(original){
 const before=fs.readFileSync('tests/rules/fixtures/slot-subjects.fragment.rules','utf8'),r=expanded(original)
 if(!r.includes(before))throw Error('Missing subject seam')
 return r.replace(before,()=>fs.readFileSync('tests/rules/fixtures/member-edge.fragment.rules','utf8'))
  .replace('allow update, delete, list: if false;',`allow update: if socialUser() && resource.data.schemaVersion == 30
        && resource.data.ownerId == request.auth.uid && !resource.data.deleting && actorValid(resource.data)
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['closed']) && request.resource.data.closed == true;
      allow delete,list: if false;`)
}
module.exports={memberEdges}
