// DIAGNOSTIC ONLY. Reduced authorization is never deployment input.
const {independent}=require('./independent-invitations.cjs')
function body(r,name,value){
 const start=r.indexOf('function '+name+'(');if(start<0)throw Error(name)
 const open=r.indexOf('{',start);let depth=1,end=open+1
 for(;depth;end++){if(r[end]==='{')depth++;if(r[end]==='}')depth--}
 return r.slice(0,open+1)+' return '+value+'; '+r.slice(end-1)
}
function variant(original,name){let r=independent(original)
 if(name==='activity-true')r=body(r,'validVersionedInvitation','true')
 if(name==='parent-true'){r=body(r,'validInstancePlanShape','true');r=body(r,'inviteInstanceMember','true')}
 if(name==='shape-true')r=body(r,'validInstancePlanShape','true')
 if(name==='transition-true')r=body(r,'inviteInstanceMember','true')
 if(name==='dispatch-fixed')r=body(r,'inviteInstanceMember',"invitationFor('two')")
 if(name==='dispatch-identity')r=body(r,'invitationFor',"uid == 'two'")
 if(name==='notice-true')r=body(r,'versionedNoticeRequired','true')
 if(name==='authority-true')r=body(r,'proposalAuthority','true')
 if(name==='binding-true')r=body(r,'operationalBinding','true')
 if(name==='shape-first-half'||name==='shape-second-half'){
  const s=r.indexOf('function validInstancePlanShape('),a=r.indexOf('return ',s),b=r.indexOf(';',a)
  const exp=r.slice(a+7,b),cut=exp.indexOf('&& d.memberIds is list')
  if(cut<0)throw Error('shape split seam')
  r=r.slice(0,a+7)+(name==='shape-first-half'?exp.slice(0,cut):exp.slice(cut+2))+r.slice(b)
 }
 return r
}
module.exports={variant,body}
