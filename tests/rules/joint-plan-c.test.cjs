// Real product Rules. Reuses request builders only, never generated/transformed Rules.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
let helpers=fs.readFileSync('tests/rules/discovery-ref.test.cjs','utf8').split("test('discovery refs ordered")[0]
const {sdk,h,db,inputs,invite,P,X,root}=new Function('require',helpers+';return {sdk,h,db,inputs,invite,P,X,root}')(require)
test('C real Rules: native CREATE and four invitations',async t=>{
 const e=await h.initialize()
 const empty=()=>({status:'empty',uid:null,revision:0,occurrence:null,cycle:null,invitedBy:null,binding:null,joinedOccurrence:null,updatedAt:sdk.serverTimestamp()})
 async function gate(label,fn){try{await fn();t.diagnostic(label+' PASS')}catch(error){t.diagnostic(JSON.stringify({label,code:error.code,message:error.message,resource:/1000 expressions|Service call error/.test(error.message)}));throw error}}
 try{
  await e.clearFirestore();await h.seed(e,inputs('inverse'))
  await gate('native CREATE six writes',async()=>{const d=db(e,'owner'),b=sdk.writeBatch(d)
   b.set(sdk.doc(d,root),{schemaVersion:3,origin:'native',ownerId:'owner',ownerInstanceId:'i_owner',catalogId:'catalog',closed:false,deleting:false,createdAt:sdk.serverTimestamp()})
   for(let n=1;n<=4;n++)b.set(sdk.doc(d,root,'slots','slot'+n),empty())
   b.set(sdk.doc(d,'users/owner/jointPlanRefs',P),{schemaVersion:1,createdAt:sdk.serverTimestamp()});await b.commit()
  })
  // Same complete atomic NEW as the approved fixture, with the final notice schema.
  for(const [i,u] of ['one','two','three','four'].entries())await gate('NEW '+(i+1),()=>invite(e,'slot'+(i+1),u,i===0?X:'realoccurrence00'+(i+1),'cycle_unique_000'+(i+1),'owner',{activity:{schemaVersion:3}}))
  await gate('JOIN member five',()=>sdk.updateDoc(sdk.doc(db(e,'four'),root,'slots','slot4'),{status:'member',binding:'i_four',joinedOccurrence:'realoccurrence004',updatedAt:sdk.serverTimestamp()}))
  await h.assertFails(sdk.getDoc(sdk.doc(db(e,'one'),'users/owner/careerInstances/i_owner')))
 }finally{await e.cleanup()}
})
test('C children cannot piggyback a legacy parent CREATE',async t=>{
 const e=await h.initialize()
 try{
  await e.clearFirestore();await h.baseline(e)
  await h.seed(e,{'friendships/german:juan':h.friendship('german','juan')})
  const d=e.authenticatedContext('german',h.claims('german')).firestore(),b=sdk.writeBatch(d),p='legacychildplan01'
  b.set(sdk.doc(d,'jointPlans',p),{ownerId:'german',careerId:'test-career',inviteeIds:['juan'],memberIds:['german'],invitedBy:{juan:'german'},closed:false,createdAt:sdk.serverTimestamp(),updatedAt:sdk.serverTimestamp()})
  b.set(sdk.doc(d,'users/juan/activityInbox','jp_'+p),{schemaVersion:1,type:'JOINT_PLAN_INVITATION',actorUid:'german',target:{kind:'jointPlan',id:p},createdAt:sdk.serverTimestamp(),readAt:null})
  // Valid legacy control first: a resource failure here is an immediate STOP,
  // not an acceptable rejection of the malicious extra child below.
  await b.commit()
  t.diagnostic('valid legacy CREATE + Activity control PASS')
  await e.clearFirestore();await h.baseline(e)
  await h.seed(e,{'friendships/german:juan':h.friendship('german','juan')})
  const attack=sdk.writeBatch(d)
  attack.set(sdk.doc(d,'jointPlans',p),{ownerId:'german',careerId:'test-career',inviteeIds:['juan'],memberIds:['german'],invitedBy:{juan:'german'},closed:false,createdAt:sdk.serverTimestamp(),updatedAt:sdk.serverTimestamp()})
  attack.set(sdk.doc(d,'users/juan/activityInbox','jp_'+p),{schemaVersion:1,type:'JOINT_PLAN_INVITATION',actorUid:'german',target:{kind:'jointPlan',id:p},createdAt:sdk.serverTimestamp(),readAt:null})
  attack.set(sdk.doc(d,'jointPlans',p,'slots','slot1'),{status:'empty',uid:null,revision:0,occurrence:null,cycle:null,invitedBy:null,binding:null,joinedOccurrence:null,updatedAt:sdk.serverTimestamp()})
  let accepted=false;try{await attack.commit();accepted=true}catch(error){assert.equal(error.code,'permission-denied');assert.equal(/1000 expressions|Service call error/.test(error.message),false)}
  t.diagnostic(JSON.stringify({attack:'C slot under legacy CREATE',accepted}))
  assert.equal(accepted,false,'Legacy CREATE must not authorize a C child')
 }finally{await e.cleanup()}
})

// Historical nonfriend rejection may exhaust expressions; never treated as a valid path.
test('legacy CREATE without accepted friendship is denied',async()=>{
 const e=await h.initialize()
 try{
  await h.baseline(e)
  const d=e.authenticatedContext('german',h.claims('german')).firestore(),b=sdk.writeBatch(d),p='legacywithoutfriend'
  b.set(sdk.doc(d,'jointPlans',p),{...h.plan('german',['juan'],['german']),createdAt:sdk.serverTimestamp(),updatedAt:sdk.serverTimestamp()})
  b.set(sdk.doc(d,'users/juan/activityInbox','jp_'+p),{schemaVersion:1,type:'JOINT_PLAN_INVITATION',actorUid:'german',target:{kind:'jointPlan',id:p},createdAt:sdk.serverTimestamp(),readAt:null})
  await h.assertFails(b.commit())
 }finally{await e.cleanup()}
})
