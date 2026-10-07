// Final functional R06/R07 boundary, not an isolated expression-budget probe.
const {test}=require('node:test'),assert=require('node:assert/strict'),sdk=require('firebase/firestore')
const h=require('./helpers.cjs'),{load,fixture,P,X,C,root}=require('../joint-c-invite-harness.cjs')
const {values}=require('../joint-plan-migration-harness.cjs')
const resource=/1000\s+expressions|service[ -]call|resource[ -]exhaust|maximum.*calls/i
test('R06/R07 final functional boundary',async t=>{
 const e=await h.initialize(),clients=new Map(),evidence=[];let validPathFailure=null
 const db=u=>{if(!clients.has(u))clients.set(u,e.authenticatedContext(u,h.claims(u)).firestore());return clients.get(u)}
 const index=root+'/inviteeIndex/bob',occurrence=root+'/invitationOccurrences/'+X
 const occurrenceData=()=>({slotId:'slot1',uid:'bob',invitedBy:'alice',cycle:C,revision:1,createdAt:sdk.serverTimestamp()})
 const api=u=>load(sdk,{currentUser:{uid:u}},db(u))
 async function read(p){let data;await e.withSecurityRulesDisabled(async c=>{data=(await sdk.getDocFromServer(sdk.doc(c.firestore(),p))).data()});return data}
 async function denied(name,fn){let error;try{await fn()}catch(x){error=x}assert.ok(error,'Unexpected ALLOW: '+name);assert.equal(error.code,'permission-denied');evidence.push({name,status:resource.test(error.message)?'DEFERRED RESOURCE DEBT':'LOGICAL DENY',message:error.message})}
 try{
  await t.test('native C positive control: real NEW creates index and occurrence',async()=>{
   await e.clearFirestore();await h.seed(e,values(fixture(),sdk))
   try{await api('alice').inviteJointCParticipant('alice',P,'slot1','bob',X,C,0,null)}catch(x){validPathFailure={name:'NEW control',resource:resource.test(x.message),message:x.message};throw x}
   assert.equal((await read(index)).slotId,'slot1');assert.equal((await read(occurrence)).cycle,C)
  })
  if(validPathFailure)return
  for(const family of ['legacy','v2'])await t.test(family+' cannot acquire operational C index/occurrence',async()=>{
   await e.clearFirestore();const d=fixture()
   d[root]=family==='legacy' ? {...h.plan('alice',['bob'],['alice']),careerId:'catalog'}
    : {schemaVersion:2,ownerId:'alice',catalogId:'catalog',inviteeIds:['bob'],memberIds:['alice'],
      participants:{alice:{careerInstanceId:'ia',bindingState:'resolved'},bob:{careerInstanceId:null,bindingState:'unresolved'}},
      name:'Plan',invitedBy:{bob:'alice'},closed:false,deleting:false,createdAt:h.TIME,updatedAt:h.TIME}
   d['migrationUsers/alice']={...d['migrationUsers/alice'],authority:'legacy',phase:'pending'}
   await h.seed(e,values(d,sdk))
   await denied('R06 '+family+' index CREATE',()=>sdk.setDoc(sdk.doc(db('alice'),index),{slotId:'slot1'}))
   await denied('R07 '+family+' occurrence CREATE',()=>sdk.setDoc(sdk.doc(db('alice'),occurrence),occurrenceData()))
   const batch=sdk.writeBatch(db('alice'))
   batch.update(sdk.doc(db('alice'),root+'/slots/slot1'),{status:'pending',uid:'bob',revision:1,occurrence:X,cycle:C,invitedBy:'alice',binding:null,joinedOccurrence:null,updatedAt:sdk.serverTimestamp()})
   batch.set(sdk.doc(db('alice'),index),{slotId:'slot1'})
   batch.set(sdk.doc(db('alice'),occurrence),occurrenceData())
   batch.set(sdk.doc(db('alice'),`users/bob/jointPlanRefs/${P}`),{schemaVersion:1},{merge:true})
   batch.set(sdk.doc(db('alice'),`users/bob/activityInbox/sp_${P}_${X}`),{schemaVersion:3,type:'SLOT_INVITATION',planId:P,occurrence:X,actorUid:'alice',cycle:C,createdAt:sdk.serverTimestamp(),readAt:null})
   await denied('R06/R07 '+family+' atomic acquisition',()=>batch.commit())
   assert.equal(await read(index),undefined);assert.equal(await read(occurrence),undefined)
   assert.equal((await read(root+'/slots/slot1')).status,'empty')
   // Even administrative residuals under the wrong family cannot authorize C reads.
   await h.seed(e,{[index]:{slotId:'slot1'},[occurrence]:{slotId:'slot1',uid:'bob',invitedBy:'alice',cycle:C,revision:1,createdAt:h.TIME}})
   await denied('R06 '+family+' residual index GET',()=>sdk.getDocFromServer(sdk.doc(db('bob'),index)))
   await denied('R07 '+family+' residual occurrence GET',()=>sdk.getDocFromServer(sdk.doc(db('bob'),occurrence)))
  })
 }finally{t.diagnostic(JSON.stringify({evidence,validPathFailure,negativeResourceDebt:evidence.filter(x=>x.status==='DEFERRED RESOURCE DEBT').map(x=>x.name)}));await e.cleanup()}
})
