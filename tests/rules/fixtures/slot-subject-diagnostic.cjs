// UNSAFE DIAGNOSTIC ABLATIONS. Not equivalent security and never deployable.
// All literal substitutions describe ONLY the fixed valid fixture, not client hints.
const {expanded}=require('./slot-expansion.cjs')
function editFunction(r,name,edit){
 const start=r.indexOf('function '+name+'(');if(start<0)throw Error('Missing '+name)
 const open=r.indexOf('{',start);let end=open+1,depth=1
 for(;depth;end++){if(r[end]==='{')depth++;if(r[end]==='}')depth--}
 return r.slice(0,open+1)+edit(r.slice(open+1,end-1))+r.slice(end-1)
}
function sub(r,a,b){if(!r.includes(a))throw Error('Missing diagnostic seam '+a);return r.replace(a,b)}
const p="{schemaVersion:30,ownerId:'owner',ownerInstanceId:'i_owner',catalogId:'catalog',closed:false,deleting:false}"
const slot="(u == 'one' ? 'slot1' : (u == 'two' ? 'slot2' : (u == 'three' ? 'slot3' : 'slot4')))"
const variants=['check-reduced','subject-reduced','authority-reduced','authority-schema-reduced','binding-reduced','index-reduced','slot-reduced','instance-reduced','subject-schema-reduced','subject-transition-reduced','subject-to-check-reduced','check-to-subject-reduced','plan-reduced','binding-iteration-unrolled','authority-iteration-unrolled']
function diagnostic(original,variant){
 let r=expanded(original)
 const fn=(name,body)=>{r=editFunction(r,name,()=>body)}
 if(variant==='check-reduced')fn('checked',' return true; ')
 else if(variant==='subject-reduced')fn('subject',' return true; ')
 else if(variant==='authority-reduced')fn('slotAuthority',' return true; ')
 else if(variant==='authority-schema-reduced')fn('slotAuthority',`let d=getAfter(/databases/$(database)/documents/migrationUsers/$(u)).data; return d.authority == 'instances' && d.phase == 'complete';`)
 else if(variant==='binding-reduced')fn('actorBinding',' return true; ')
 else if(variant==='index-reduced')fn('actorBinding',`let s=getAfter(/databases/$(database)/documents/jointPlans/$(planId)/slots/$(${slot})).data; return s.uid == u && s.status == 'member' && slotBinding(u,s.binding,p.catalogId);`)
 else if(variant==='slot-reduced')fn('actorBinding',`let index=getAfter(/databases/$(database)/documents/jointPlans/$(planId)/inviteeIndex/$(u)).data; return index.slotId == ${slot} && slotBinding(u,'i_'+u,p.catalogId);`)
 else if(variant==='instance-reduced')fn('slotBinding',' return true; ')
 else if(variant==='subject-schema-reduced')r=editFunction(r,'subject',body=>sub(body,"d.keys().hasAll(['code','proposedParticipantIds','addedByUid','createdAt','updatedAt'])\n            && d.keys().hasOnly(['code','proposedParticipantIds','addedByUid','createdAt','updatedAt'])","true"))
 else if(variant==='subject-transition-reduced')r=editFunction(r,'subject',body=>sub(body,`(resource == null ? d.addedByUid == request.auth.uid && d.createdAt == request.time
              : d.addedByUid == resource.data.addedByUid && d.createdAt == resource.data.createdAt)`,'true'))
 else if(variant==='subject-to-check-reduced')r=editFunction(r,'subject',body=>body
  .replace(/let before=get\([^;]+;/,'let before=null;')
  .replace(/let after=getAfter\([^;]+;/,"let after={revision:1,actorUid:request.auth.uid,updatedAt:request.time};"))
 else if(variant==='check-to-subject-reduced')r=editFunction(r,'checked',body=>body
  .replace(/let before=get\([^;]+;/,'let before=null;')
  .replace(/let after=getAfter\([^;]+;/,"let after={proposedParticipantIds:['owner','one','two','three'],updatedAt:request.time};"))
 else if(variant==='plan-reduced'){for(const name of ['subject','checked'])r=editFunction(r,name,body=>sub(body,'let p=parent();','let p='+p+';'))}
 else if(variant==='binding-iteration-unrolled')r=editFunction(r,'subject',body=>body.replace(/subjectBindingAt\(p,added,0\)[\s\S]*?subjectBindingAt\(p,added,4\)/,"subjectBinding(p,'one') && subjectBinding(p,'two') && subjectBinding(p,'three')"))
 else if(variant==='authority-iteration-unrolled')r=editFunction(r,'checked',body=>body.replace(/subjectAuthorityAt\(added,0\)[\s\S]*?subjectAuthorityAt\(added,4\)/,"slotAuthority('one') && slotAuthority('two') && slotAuthority('three')"))
 else if(variant!=='baseline')throw Error('Unknown variant '+variant)
 return r
}
module.exports={diagnostic,variants,editFunction}
