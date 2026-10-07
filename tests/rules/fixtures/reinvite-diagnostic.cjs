// DIAGNOSTIC ONLY: reductions are not candidate optimizations.
const {optimized}=require('./invitation-dispatch.cjs'),{body}=require('./second-dissection.cjs')
function variant(original,name){let r=optimized(original)
 if(name==='shape-true')r=body(r,'validInstancePlanShape','true')
 if(name==='transition-true')r=body(r,'inviteInstanceMember','true')
 if(name==='activity-true')r=body(r,'validVersionedInvitation','true')
 if(name==='dispatch-fixed')r=body(r,'inviteInstanceMember',"invitationFor('one')")
 if(name==='binding-equality-true')r=r.replace('&& after.participants == before.participants','&& true /* DIAGNOSTIC ONLY */')
 if(name==='renewal-branch-true'){
  const start=r.indexOf('&& ((uid in before.inviteeIds'),end=r.indexOf('&& versionedNoticeRequired(uid, planId, 0)',start)
  if(start<0||end<0)throw Error('renewal seam')
  r=r.slice(0,start)+'&& true /* DIAGNOSTIC ONLY renewal branch */\n          '+r.slice(end)
 }
 return r
}
module.exports={variant}
