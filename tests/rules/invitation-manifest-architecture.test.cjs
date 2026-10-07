const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),sdk=require('firebase/firestore'),h=require('./helpers.cjs')
const {manifest:children}=require('./fixtures/invitation-architecture-alternatives.cjs')
let source=fs.readFileSync('tests/rules/distributed-versioned-invitations.test.cjs','utf8');source=source.slice(0,source.indexOf("test('complete CREATE"));const {input}=new Function('require',source+';return {input}')(require)
test('B manifest architecture full composition feasibility; STOP on first valid failure',async t=>{
 const rules=children(fs.readFileSync('firestore.rules','utf8'));fs.writeFileSync('.tools/architecture-B.rules',rules)
 const env=await h.initialize(rules);let stop=false
 try{outer:for(const count of [1,2,3,4])for(const orientation of ['direct','inverse','mixed']){
 await t.test(count+' '+orientation,async t=>{
 await env.clearFirestore();const {entries,plan}=input(count,orientation)
 // One fresh opaque cycle per relationship; do not seed globally reused cycles.
 plan.inviteeIds.forEach((uid,index)=>{
   const cycle='cycle_unique_000'+(index+1),path=entries['friendships/owner:'+uid]?'friendships/owner:'+uid:'friendships/'+uid+':owner'
   entries[path].cycleId=cycle;plan.invitationCycles[uid]=cycle
   entries['usedFriendshipCycles/'+cycle]={relationshipId:path.slice('friendships/'.length),participants:entries[path].participants}
 });await h.seed(env,entries)
 const db=env.authenticatedContext('owner',h.claims('owner')).firestore(),batch=sdk.writeBatch(db),paths=['jointPlans/p'];batch.set(sdk.doc(db,'jointPlans/p'),plan)
 const manifestPath='jointPlans/p/invitationManifests/create';paths.push(manifestPath);batch.set(sdk.doc(db,manifestPath),Object.fromEntries(['inviteeIds','invitedBy','invitationCycles','invitationOccurrences','participants','invitationSerial','createdAt'].map(k=>[k,plan[k]])));
 for(const uid of plan.inviteeIds){const occurrence=plan.invitationOccurrences[uid],path='jointPlans/p/invitations/'+occurrence,notice='users/'+uid+'/activityInbox/jp_p_'+occurrence;paths.push(notice)

 batch.set(sdk.doc(db,notice),{schemaVersion:2,type:'JOINT_PLAN_INVITATION',actorUid:'owner',createdAt:sdk.serverTimestamp(),readAt:null,target:{kind:'jointPlan',id:'p'},friendshipCycleId:plan.invitationCycles[uid],occurrence})}
 let error;try{await batch.commit()}catch(e){error=e;stop=true}
 t.diagnostic(JSON.stringify({alternative:'B',count,orientation,allowed:!error,code:error?.code,expressions:/1000 expressions/.test(error?.message||''),serviceCall:/Service call error/.test(error?.message||'')}))
 if(error)await env.withSecurityRulesDisabled(async c=>{for(const path of paths)assert.equal((await sdk.getDocFromServer(sdk.doc(c.firestore(),path))).exists(),false,path)})
 assert.equal(error,undefined)
 });if(stop){t.diagnostic('STOP B: remaining matrix and follow-up corpus not executed');break outer}
 }}finally{await env.cleanup()}
})
