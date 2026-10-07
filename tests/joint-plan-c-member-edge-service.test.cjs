const {test}=require('node:test'),assert=require('node:assert/strict')
const {load,fixture,P,X,Y,C,root,time}=require('./joint-c-invite-harness.cjs')
const actor={slotId:'owner',instanceId:'ia',occurrence:'owner',slotRevision:0}
const target={slotId:'slot1',instanceId:'i_bob',occurrence:X,slotRevision:1}
const B=root+'/subjects/A',E=B+'/memberEdges/bob:'+X
function setup(){
 const records=new Map(Object.entries(fixture())),reads=[],writes=[],auth={currentUser:{uid:'alice'}}
 let failure=false,hook=()=>{}
 records.set(root+'/slots/slot1',{status:'member',uid:'bob',binding:'i_bob',occurrence:X,joinedOccurrence:X,revision:1,cycle:C,invitedBy:'alice',updatedAt:time})
 const api=load({doc:(_, ...p)=>p.join('/'),serverTimestamp:()=>time,runTransaction:async(_,fn)=>{
  const pending=[]
  const result=await fn({get:async p=>{
   assert.ok(!p.startsWith('users/bob/')&&!p.startsWith('migrationUsers/bob'),'private target read forbidden')
   assert.ok(!/sharing|progress|friendships|activityInbox/.test(p))
   reads.push(p);hook(p);const d=records.get(p);return {exists:()=>!!d,data:()=>structuredClone(d)}
  },set:(p,d)=>pending.push([p,d])})
  if(failure)throw Object.assign(Error('denied'),{code:'permission-denied'})
  for(const [p,d]of pending)records.set(p,d)
  writes.push(...pending);return result
 }},auth,{})
 return {api,records,reads,writes,auth,fail:()=>failure=true,hook:f=>hook=f,
 base:()=>api.ensureJointCSubjectBase('alice',P,'A',actor),
 edge:(r=target)=>api.createJointCMemberEdge('alice',P,'A',actor,'bob',r)}
}
test('S3-B separate base creation and compatible ensure preserve history',async()=>{const h=setup();assert.equal((await h.base()).created,true);const before=structuredClone(h.records.get(B));assert.equal((await h.base()).created,false);assert.deepEqual(h.records.get(B),before);assert.equal(h.writes.length,1)})
test('S3-B invalid existing base rejected',async()=>{const h=setup();h.records.set(B,{schemaVersion:31});await assert.rejects(h.base());assert.equal(h.writes.length,0)})
test('S3-B one edge with no target private access; exact reads',async()=>{const h=setup();await h.base();h.reads.length=0;await h.edge();assert.deepEqual(h.reads,[root,'migrationUsers/alice','users/alice/careerInstances/ia',B,root+'/slots/slot1',E]);assert.deepEqual(h.records.get(E).targetRef,target);assert.equal(h.writes.length,2)})
test('S3-B missing base never creates edge or base',async()=>{const h=setup();await assert.rejects(h.edge());assert.equal(h.writes.length,0)})
for(const [name,change]of Object.entries({pending:{status:'pending',binding:null,joinedOccurrence:null},staleOccurrence:{occurrence:Y,joinedOccurrence:Y},staleRevision:{revision:3},B1:{uid:'carol',occurrence:Y,joinedOccurrence:Y},A2:{occurrence:Y,joinedOccurrence:Y,revision:3},binding:{binding:'different'}}))test('S3-B observable rejection '+name,async()=>{const h=setup();await h.base();Object.assign(h.records.get(root+'/slots/slot1'),change);await assert.rejects(h.edge());assert.equal(h.records.has(E),false)})
test('S3-B current A2 uses distinct identity without reviving A1',async()=>{const h=setup();await h.base();await h.edge();Object.assign(h.records.get(root+'/slots/slot1'),{occurrence:Y,joinedOccurrence:Y,revision:3});await h.edge({...target,occurrence:Y,slotRevision:3});assert.ok(h.records.has(E));assert.ok(h.records.has(B+'/memberEdges/bob:'+Y));await assert.rejects(h.edge())})
test('S3-B duplicate edge cannot reset revision or overwrite history',async()=>{const h=setup();await h.base();await h.edge();await assert.rejects(h.edge());assert.equal(h.writes.length,2)})
for(const field of ['closed','deleting'])test('S3-B plan '+field+' rejects',async()=>{const h=setup();Object.assign(h.records.get(root),{closed:true,[field]:true});await assert.rejects(h.base())})
for(const change of [{lifecycle:'archived',archivedAt:time},{catalogId:'other'}])test('S3-B own actor metadata incompatible rejects '+JSON.stringify(change),async()=>{const h=setup();Object.assign(h.records.get('users/alice/careerInstances/ia'),change);await assert.rejects(h.base());assert.equal(h.writes.length,0)})
test('S3-B target private metadata is neither required nor interpreted',async()=>{const h=setup();h.records.delete('users/bob/careerInstances/i_bob');h.records.delete('migrationUsers/bob');await h.base();await h.edge();assert.ok(h.records.has(E))})
test('S3-B absent session rejects before reads',async()=>{const h=setup();h.auth.currentUser=null;await assert.rejects(h.base());assert.equal(h.reads.length,0)})
test('S3-B session change during reads prevents writes',async()=>{const h=setup();h.hook(()=>h.auth.currentUser={uid:'alice'});await assert.rejects(h.base());assert.equal(h.writes.length,0)})
test('S3-B denied edge leaves separately created base intact',async()=>{const h=setup();await h.base();h.fail();await assert.rejects(h.edge(),{code:'permission-denied'});assert.ok(h.records.has(B));assert.equal(h.records.has(E),false)})
test('S3-B selection is not read',async()=>{const h=setup();Object.defineProperty(h.auth.currentUser,'activeCareerInstanceId',{get(){throw Error('selection')}});await h.base();await h.edge()})
