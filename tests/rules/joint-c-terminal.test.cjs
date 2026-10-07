const {test}=require('node:test'),assert=require('node:assert/strict'),sdk=require('firebase/firestore')
const h=require('./helpers.cjs'),{load,fixture,P,X,C,root,time}=require('../joint-c-invite-harness.cjs')
const {values}=require('../joint-plan-migration-harness.cjs')
const owner={slotId:'owner',instanceId:'ia',occurrence:'owner',slotRevision:0}
const target={slotId:'slot1',instanceId:'i_bob',occurrence:X,slotRevision:1}
const resource=/1000\s+expressions|service[ -]call|resource[ -]exhaust|maximum.*calls/i
test('S5 product C terminal lifecycle',async t=>{
 const e=await h.initialize(),clients=new Map(),evidence=[];let fatal=null
 const db=u=>{if(!clients.has(u))clients.set(u,e.authenticatedContext(u,h.claims(u)).firestore());return clients.get(u)}
 const api=u=>load(sdk,{currentUser:{uid:u}},db(u))
 const doc=(u,p)=>sdk.doc(db(u),p)
 async function read(p){let d;await e.withSecurityRulesDisabled(async c=>{d=(await sdk.getDocFromServer(sdk.doc(c.firestore(),p))).data()});return d}
 async function valid(name,fn){try{const r=await fn();evidence.push({name,status:'PASS'});return r}catch(x){fatal={name,resource:resource.test(x.message),message:x.message};throw x}}
 async function deny(name,fn){let x;try{await fn()}catch(err){x=err}assert.ok(x,'unexpected ALLOW '+name);assert.equal(x.code,'permission-denied');evidence.push({name,status:resource.test(x.message)?'RESOURCE BLOCKED':'LOGICAL DENY',message:x.message})}
 async function reset(){
  await e.clearFirestore();const d=fixture()
  d[root+'/slots/slot1']={status:'member',uid:'bob',binding:'i_bob',occurrence:X,joinedOccurrence:X,revision:1,cycle:C,invitedBy:'alice',updatedAt:time}
  d[root+'/inviteeIndex/bob']={slotId:'slot1'}
  d[root+'/invitationOccurrences/'+X]={slotId:'slot1',uid:'bob',invitedBy:'alice',cycle:C,revision:1,createdAt:time}
  d[`users/bob/jointPlanRefs/${P}`]={schemaVersion:1}
  d[`users/bob/activityInbox/sp_${P}_${X}`]={schemaVersion:3,type:'SLOT_INVITATION',planId:P,occurrence:X,actorUid:'alice',cycle:C,createdAt:time,readAt:null}
  await h.seed(e,values(d,sdk))
  await valid('setup base',()=>api('alice').ensureJointCSubjectBase('alice',P,'A',owner))
  await valid('setup edge',()=>api('alice').createJointCMemberEdge('alice',P,'A',owner,'bob',target))
 }
 async function run(name,fn){if(fatal)return;await t.test(name,async()=>{await reset();await fn()})}
 function terminal(u='alice',extra=false){const b=sdk.writeBatch(db(u));b.update(doc(u,root),{closed:true,deleting:true});b.set(doc(u,'jointPlanTombstones/'+P),{deletedAt:sdk.serverTimestamp()});if(extra)b.set(doc(u,root+'/subjects/EXTRA'),api(u).newJointCSubjectBase(P,'EXTRA',u,owner,sdk.serverTimestamp()));return b.commit()}
 async function forbiddenMutations(){
  await deny('JOIN after terminal',()=>sdk.updateDoc(doc('bob',root+'/slots/slot1'),{status:'member',binding:'i_bob',joinedOccurrence:X,updatedAt:sdk.serverTimestamp()}))
  await deny('base after terminal',()=>sdk.setDoc(doc('alice',root+'/subjects/NEW'),api('alice').newJointCSubjectBase(P,'NEW','alice',owner,sdk.serverTimestamp())))
  await deny('edge after terminal',()=>sdk.updateDoc(doc('alice',root+'/subjects/A/memberEdges/bob:'+X),{state:'unassigned',revision:2,updatedByUid:'alice',updatedAt:sdk.serverTimestamp(),actorRef:owner}))
  await deny('REINVITE after terminal',()=>sdk.updateDoc(doc('alice',root+'/slots/slot1'),{status:'pending',occurrence:'terminalInvite01',revision:2,updatedAt:sdk.serverTimestamp()}))
  await deny('NEW after terminal',()=>sdk.updateDoc(doc('alice',root+'/slots/slot2'),{status:'pending',uid:'carol',occurrence:'terminalInvite02',revision:1,updatedAt:sdk.serverTimestamp()}))
 }
 try{
  await run('native CREATE persists valid name',async()=>{
   const id=await valid('named CREATE',()=>api('alice').createJointCPlan('alice','ia','catalog','  Nuevo plan  '))
   assert.equal((await read('jointPlans/'+id)).name,'Nuevo plan')
  })
  await run('owner RENAME only name; all children and authority preserved',async()=>{
   const before=await read(root),paths=[root+'/slots/slot1',root+'/subjects/A',root+'/subjects/A/memberEdges/bob:'+X,'migrationUsers/alice']
   const unchanged=await Promise.all(paths.map(read))
   await valid('real RENAME',()=>api('alice').renameJointCPlan('alice',P,'Nuevo nombre'))
   assert.deepEqual(await read(root),{...before,name:'Nuevo nombre'})
   assert.deepEqual(await Promise.all(paths.map(read)),unchanged)
  })
  await run('RENAME strict owner fields and names',async()=>{
   await deny('nonowner rename',()=>sdk.updateDoc(doc('bob',root),{name:'Nuevo'}))
   for(const extra of [{catalogId:'other'},{ownerId:'bob'},{closed:true},{deleting:true},{schemaVersion:2},{ownerInstanceId:'other'}])
    await deny('rename extra '+Object.keys(extra)[0],()=>sdk.updateDoc(doc('alice',root),{name:'Nuevo',...extra}))
   for(const name of ['', '   ', '\t', null, 'x'.repeat(81), 'a\nb'])
    await deny('invalid name '+JSON.stringify(name),()=>sdk.updateDoc(doc('alice',root),{name}))
   assert.equal((await read(root)).name,undefined)
  })
  await run('closed and deleted RENAME denied',async()=>{
   await valid('close before rename',()=>api('alice').closeJointCPlan('alice',P))
   await deny('closed rename',()=>sdk.updateDoc(doc('alice',root),{name:'Nuevo'}))
   await valid('delete before rename',()=>api('alice').deleteJointCPlan('alice',P))
   await deny('deleted rename',()=>sdk.updateDoc(doc('alice',root),{name:'Nuevo'}))
  })
  await run('owner close irreversible; history readable; mutations denied',async()=>{
   await valid('real CLOSE',()=>api('alice').closeJointCPlan('alice',P))
   assert.equal((await valid('historical parent',()=>api('bob').readJointCPlan('bob',P))).plan.closed,true)
   await valid('historical slot',()=>api('bob').readJointCSlot('bob',P,'slot1'))
   await valid('historical edges',()=>api('bob').listJointCMemberEdges('bob',P,'A'))
   await forbiddenMutations();await deny('reopen',()=>sdk.updateDoc(doc('alice',root),{closed:false}))
  })
  await run('nonowner close/delete and orphan halves denied',async()=>{
   await deny('nonowner close',()=>sdk.updateDoc(doc('bob',root),{closed:true}))
   await deny('nonowner delete',()=>terminal('bob'))
   await deny('parent half',()=>sdk.updateDoc(doc('alice',root),{closed:true,deleting:true}))
   await deny('tombstone half',()=>sdk.setDoc(doc('alice','jointPlanTombstones/'+P),{deletedAt:sdk.serverTimestamp()}))
   assert.equal((await read(root)).deleting,false);assert.equal(await read('jointPlanTombstones/'+P),undefined)
  })
  for(const closed of [false,true])await run('real DELETE '+(closed?'closed':'active')+' retains inert children',async()=>{
   if(closed)await valid('CLOSE',()=>api('alice').closeJointCPlan('alice',P))
   await valid('DELETE',()=>api('alice').deleteJointCPlan('alice',P))
   assert.equal((await read(root)).deleting,true);assert.ok(await read('jointPlanTombstones/'+P))
   await forbiddenMutations()
   for(const p of [root,root+'/slots/slot1',root+'/inviteeIndex/bob',root+'/invitationOccurrences/'+X,root+'/subjects/A',root+'/subjects/A/memberEdges/bob:'+X]){
    assert.ok(await read(p));await deny('residual read '+p,()=>sdk.getDocFromServer(doc('bob',p)))
   }
   assert.ok((await sdk.getDocFromServer(doc('bob',`users/bob/jointPlanRefs/${P}`))).exists())
   assert.ok((await sdk.getDocFromServer(doc('bob',`users/bob/activityInbox/sp_${P}_${X}`))).exists())
   await deny('resurrection retained parent',()=>sdk.setDoc(doc('alice',root),values(fixture()[root],sdk)))
   await deny('tombstone mutation',()=>sdk.updateDoc(doc('alice','jointPlanTombstones/'+P),{deletedAt:sdk.serverTimestamp()}))
   await e.withSecurityRulesDisabled(c=>sdk.deleteDoc(sdk.doc(c.firestore(),root)))
   const native=values(fixture()[root],sdk);native.createdAt=sdk.serverTimestamp()
   await deny('missing parent resurrection',()=>sdk.setDoc(doc('alice',root),native))
   await deny('legacy replacement',()=>sdk.setDoc(doc('alice',root),h.plan('alice',['bob'],['alice'])))
  })
  await run('archive owner does not prevent delete; frozen authority does',async()=>{
   await h.seed(e,values({'users/alice/careerInstances/ia':{...fixture()['users/alice/careerInstances/ia'],lifecycle:'archived',archivedAt:time}},sdk))
   await valid('archived owner DELETE',()=>api('alice').deleteJointCPlan('alice',P))
  })
  await run('frozen owner cannot delete',async()=>{
   await h.seed(e,values({'migrationUsers/alice':{...fixture()['migrationUsers/alice'],authority:'frozen',phase:'copying'}},sdk))
   await deny('frozen DELETE',()=>terminal())
  })
  await run('combined delete + valid child rejects atomically',async()=>{
   await deny('combined delete/child',()=>terminal('alice',true))
   assert.equal((await read(root)).deleting,false);assert.equal(await read('jointPlanTombstones/'+P),undefined);assert.equal(await read(root+'/subjects/EXTRA'),undefined)
  })
  await run('concurrent child/delete cannot resurrect',async()=>{
   const result=await Promise.allSettled([api('alice').deleteJointCPlan('alice',P),api('alice').ensureJointCSubjectBase('alice',P,'RACE',owner)])
   if(result[0].status==='rejected'){fatal={name:'concurrent DELETE',resource:resource.test(result[0].reason.message),message:result[0].reason.message};throw result[0].reason}
   assert.equal((await read(root)).deleting,true)
   await deny('postrace child',()=>sdk.setDoc(doc('alice',root+'/subjects/LATER'),api('alice').newJointCSubjectBase(P,'LATER','alice',owner,sdk.serverTimestamp())))
  })
  await run('inconsistent active parent plus tombstone fails closed',async()=>{
   await h.seed(e,{['jointPlanTombstones/'+P]:{deletedAt:h.TIME}})
   await deny('inconsistent parent read',()=>api('alice').readJointCPlan('alice',P));await forbiddenMutations()
  })
 }finally{t.diagnostic(JSON.stringify({evidence,validPathFailure:fatal,negativeResourceDebt:evidence.filter(x=>x.status==='RESOURCE BLOCKED').map(x=>x.name)}));await e.cleanup()}
})
