const {test}=require('node:test'),assert=require('node:assert/strict'),sdk=require('firebase/firestore')
const h=require('./helpers.cjs'),{load,fixture,P,X,Y,C,root,time}=require('../joint-c-invite-harness.cjs')
const owner={slotId:'owner',instanceId:'ia',occurrence:'owner',slotRevision:0}
const target={slotId:'slot1',instanceId:'i_bob',occurrence:X,slotRevision:1}
const B=root+'/subjects/A',E=B+'/memberEdges/bob:'+X
const resource=/1000\s+expressions|service[ -]call|resource[ -]exhaust|maximum.*calls/i
function values(v){if(Array.isArray(v))return v.map(values);if(v&&typeof v==='object'){if(Object.keys(v).sort().join()==='nanoseconds,seconds')return new sdk.Timestamp(v.seconds,v.nanoseconds);return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,values(x)]))}return v}

test('S3-E real services and product edge UPDATE Rules',async t=>{
 const env=await h.initialize(),clients=new Map(),evidence=[];let validPathFailure=null
 const db=u=>{if(!clients.has(u))clients.set(u,env.authenticatedContext(u,h.claims(u)).firestore());return clients.get(u)}
 const api=u=>load(sdk,{currentUser:{uid:u}},db(u))
 async function read(p){let d;await env.withSecurityRulesDisabled(async c=>{d=(await sdk.getDocFromServer(sdk.doc(c.firestore(),p))).data()});return d}
 async function patch(p,d){await h.seed(env,{[p]:{...await read(p),...values(d)}})}
 async function valid(name,fn){try{const result=await fn();evidence.push({name,status:'PASS'});return result}catch(e){validPathFailure={name,resource:resource.test(e.message),message:e.message};throw e}}
 async function reset(){
  await env.clearFirestore();const f=fixture()
  f[root+'/slots/slot1']={status:'member',uid:'bob',binding:'i_bob',occurrence:X,joinedOccurrence:X,revision:1,cycle:C,invitedBy:'alice',updatedAt:time}
  f[root+'/inviteeIndex/bob']={slotId:'slot1'};await h.seed(env,values(f))
  await valid('setup base',()=>api('alice').ensureJointCSubjectBase('alice',P,'A',owner))
  await valid('setup edge',()=>api('alice').createJointCMemberEdge('alice',P,'A',owner,'bob',target))
 }
 const unassign=(revision=1)=>api('alice').unassignJointCMemberEdge('alice',P,'A',owner,'bob',target,revision)
 const reassign=(revision=2)=>api('alice').reassignJointCMemberEdge('alice',P,'A',owner,'bob',target,revision)
 const update=(data={},u='alice')=>sdk.updateDoc(sdk.doc(db(u),E),{state:'unassigned',revision:2,updatedByUid:u,updatedAt:sdk.serverTimestamp(),actorRef:owner,...data})
 async function deny(name,fn){const before=await read(E);let e;try{await fn()}catch(error){e=error}assert.ok(e,'unexpected ALLOW: '+name);assert.equal(e.code,'permission-denied');evidence.push({name,status:resource.test(e.message)?'RESOURCE BLOCKED':'LOGICAL DENY',message:e.message});assert.deepEqual(await read(E),before)}
 async function run(name,fn){if(validPathFailure)return;await t.test(name,async()=>{await reset();await fn()})}
 try{
  await run('real UNASSIGN and REASSIGN preserve history/base/other edges',async()=>{
   await valid('other edge',()=>api('alice').createJointCMemberEdge('alice',P,'A',owner,'alice',owner))
   await valid('other base',()=>api('alice').ensureJointCSubjectBase('alice',P,'B',owner))
   await valid('other subject edge',()=>api('alice').createJointCMemberEdge('alice',P,'B',owner,'bob',target))
   const paths=[B,B+'/memberEdges/alice:owner',root+'/subjects/B',root+'/subjects/B/memberEdges/bob:'+X]
   const untouched=await Promise.all(paths.map(read)),before=await read(E)
   await valid('UNASSIGN',()=>unassign());assert.equal((await read(E)).state,'unassigned')
   await valid('REASSIGN',()=>reassign());const after=await read(E)
   assert.equal(after.state,'assigned');assert.equal(after.revision,3)
   for(const k of ['schemaVersion','uid','targetRef','createdByUid','createdAt'])assert.deepEqual(after[k],before[k])
   assert.deepEqual(await Promise.all(paths.map(read)),untouched)
   assert.ok((await api('alice').listJointCMemberEdges('alice',P,'A')).some(x=>x.edgeId==='bob:'+X))
  })
  await run('non-owner actor can transition owner edge',async()=>{
   await valid('create owner edge',()=>api('bob').createJointCMemberEdge('bob',P,'A',target,'alice',owner))
   await valid('member UNASSIGN',()=>api('bob').unassignJointCMemberEdge('bob',P,'A',target,'alice',owner,1))
   await valid('member REASSIGN',()=>api('bob').reassignJointCMemberEdge('bob',P,'A',target,'alice',owner,2))
  })
  for(const [name,d]of [
   ['stale revision',{revision:1}],['skipped revision',{revision:3}],['wrong prior state',{state:'assigned'}],
   ['uid mutation',{uid:'carol'}],['schema mutation',{schemaVersion:2}],['creation mutation',{createdByUid:'bob'}],
   ['creation timestamp',{createdAt:sdk.serverTimestamp()}],['extra',{extra:true}],['actor spoof',{updatedByUid:'bob'}],
   ['timestamp spoof',{updatedAt:h.TIME}],['occurrence mutation',{targetRef:{...target,occurrence:Y}}],
   ['slotRevision mutation',{targetRef:{...target,slotRevision:2}}],['instance mutation',{targetRef:{...target,instanceId:'i_carol'}}],
   ['slot mutation',{targetRef:{...target,slotId:'slot2'}}],
  ])await run(name,()=>deny(name,()=>update(d)))
  await run('unauthorized actor',()=>deny('outsider',()=>update({},'frank')))
  for(const [name,p,d]of [
   ['target archived','users/bob/careerInstances/i_bob',{lifecycle:'archived',archivedAt:time}],
   ['target catalog','users/bob/careerInstances/i_bob',{catalogId:'other'}],
   ['target authority','migrationUsers/bob',{authority:'frozen'}],
   ['released',root+'/slots/slot1',{status:'empty',uid:null}],
   ['A2',root+'/slots/slot1',{occurrence:Y,joinedOccurrence:Y,revision:3}],
   ['B1',root+'/slots/slot1',{uid:'carol',binding:'i_carol',occurrence:Y,joinedOccurrence:Y,revision:3}],
  ])await run('historical UNASSIGN; no REASSIGN '+name,async()=>{
   await patch(p,d);await valid('historical UNASSIGN '+name,()=>unassign())
   await deny('REASSIGN '+name,()=>update({state:'assigned',revision:3}))
   assert.equal((await read(E)).state,'unassigned')
  })
  await run('restore same occupancy permits REASSIGN',async()=>{
   await patch('users/bob/careerInstances/i_bob',{lifecycle:'archived',archivedAt:time})
   await valid('archived target UNASSIGN',()=>unassign())
   await patch('users/bob/careerInstances/i_bob',{lifecycle:'active',archivedAt:null})
   await valid('restored target REASSIGN',()=>reassign())
  })
  for(const [name,p,d]of [
   ['actor archived','users/alice/careerInstances/ia',{lifecycle:'archived',archivedAt:time}],
   ['closed',root,{closed:true}],['deleting',root,{closed:true,deleting:true}],
  ])await run(name,async()=>{await patch(p,d);await deny(name,()=>update())})
  await run('same-revision concurrent UNASSIGN: one winner; stale REASSIGN rejected',async()=>{
   const results=await Promise.allSettled([unassign(),unassign()])
   for(const r of results)if(r.status==='rejected'&&resource.test(r.reason.message)){validPathFailure={name:'concurrent UNASSIGN',resource:true,message:r.reason.message};throw r.reason}
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
   assert.equal((await read(E)).revision,2)
   await assert.rejects(reassign(1));await valid('current REASSIGN',()=>reassign())
   assert.equal((await read(E)).revision,3)
  })
  await run('private target data still unreadable',async()=>{
   await valid('UNASSIGN privacy',()=>unassign());await valid('REASSIGN privacy',()=>reassign())
   for(const p of ['migrationUsers/bob','users/bob/careerInstances/i_bob','users/bob/careerInstances/i_bob/academic/progress','users/bob/careerInstances/i_bob/sharing/snapshot']){
    await assert.rejects(sdk.getDocFromServer(sdk.doc(db('alice'),p)),e=>e.code==='permission-denied')
   }
  })
 }finally{t.diagnostic(JSON.stringify({evidence,validPathFailure,negativeResourceDebt:evidence.filter(x=>x.status==='RESOURCE BLOCKED').map(x=>x.name)}));await env.cleanup()}
})
