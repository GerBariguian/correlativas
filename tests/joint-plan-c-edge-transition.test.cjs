const {test}=require('node:test'),assert=require('node:assert/strict')
const {load,fixture,P,X,Y,C,root,time}=require('./joint-c-invite-harness.cjs')
const actor={slotId:'owner',instanceId:'ia',occurrence:'owner',slotRevision:0},target={slotId:'slot1',instanceId:'i_bob',occurrence:X,slotRevision:1}
const B=root+'/subjects/A',E=B+'/memberEdges/bob:'+X
function setup(){
 const records=new Map(Object.entries(fixture())),reads=[],writes=[],auth={currentUser:{uid:'alice'}};let version=0,hook=()=>{},after=()=>{},fail=false
 const api=load({doc:(_, ...p)=>p.join('/'),serverTimestamp:()=>time,runTransaction:async(_,fn)=>{
  for(let n=0;n<5;n++){
   const start=version,pending=[]
   const result=await fn({get:async p=>{assert.ok(p===root||p.startsWith(root+'/subjects/')||p.startsWith(root+'/slots/')||p==='migrationUsers/alice'||p==='users/alice/careerInstances/ia');reads.push(p);hook();const d=records.get(p);return {exists:()=>!!d,data:()=>structuredClone(d)}},update:(p,d)=>pending.push([p,d])})
   if(start!==version)continue
   if(fail)throw Object.assign(Error('denied'),{code:'permission-denied'})
   for(const [p,d]of pending)records.set(p,{...records.get(p),...d});writes.push(...pending);version++;after();return result
  }throw Error('conflict')
 }},auth,{})
 records.set(root+'/slots/slot1',{status:'member',uid:'bob',binding:'i_bob',occurrence:X,joinedOccurrence:X,revision:1,cycle:C,invitedBy:'alice',updatedAt:time})
 records.set(B,api.newJointCSubjectBase(P,'A','alice',actor,time));records.set(E,api.newJointCMemberEdge(P,'A','bob',target,'alice',actor,time))
 return {api,records,reads,writes,auth,hook:f=>hook=f,after:f=>after=f,fail:()=>fail=true,
 un:(rev=1,r=target)=>api.unassignJointCMemberEdge('alice',P,'A',actor,'bob',r,rev),re:(rev=2,r=target)=>api.reassignJointCMemberEdge('alice',P,'A',actor,'bob',r,rev)}
}
test('S3-E unassign/reassign same occupancy preserve identity and creation; exact budgets',async()=>{const h=setup(),before=structuredClone(h.records.get(E));await h.un();assert.equal(h.records.get(E).state,'unassigned');assert.deepEqual(h.reads,[root,'migrationUsers/alice','users/alice/careerInstances/ia',B,E]);h.reads.length=0;await h.re();assert.equal(h.records.get(E).revision,3);assert.deepEqual(h.reads,[root,'migrationUsers/alice','users/alice/careerInstances/ia',B,E,root+'/slots/slot1']);for(const k of ['uid','targetRef','createdAt','createdByUid'])assert.deepEqual(h.records.get(E)[k],before[k]);assert.equal(h.writes.length,2)})
for(const [name,r]of [['occurrence',{...target,occurrence:Y}],['slotRevision',{...target,slotRevision:3}],['instanceId',{...target,instanceId:'other'}],['slotId',{...target,slotId:'slot2'}]])test('S3-E stale '+name,async()=>{const h=setup();await assert.rejects(h.un(1,r));assert.equal(h.writes.length,0)})
test('S3-E stale revisions/state/missing/input reject',async()=>{const h=setup();for(const rev of [0,2,1.5,Number.MAX_SAFE_INTEGER])await assert.rejects(h.un(rev));await assert.rejects(h.re(1));await h.un();await assert.rejects(h.un(2));await assert.rejects(h.re(1));h.records.delete(E);await assert.rejects(h.re())})
test('S3-E UID/path mismatch rejected',async()=>{const h=setup();h.records.get(E).uid='carol';await assert.rejects(h.un())})
for(const mode of ['released','B1','A2'])test('S3-E historical unassign allowed but no A1 revival after '+mode,async()=>{const h=setup();Object.assign(h.records.get(root+'/slots/slot1'),mode==='released'?{status:'empty',uid:null,revision:2,occurrence:null,joinedOccurrence:null,binding:null}:{uid:mode==='B1'?'carol':'bob',revision:3,occurrence:Y,joinedOccurrence:Y});await h.un();await assert.rejects(h.re());assert.equal(h.records.get(E).state,'unassigned')})
test('S3-E independence subjects and identities; unassigned remains decodable',async()=>{const h=setup();const other=B+'/memberEdges/bob:'+Y,otherSubject=root+'/subjects/B/memberEdges/bob:'+X;h.records.set(other,{...h.records.get(E),targetRef:{...target,occurrence:Y}});h.records.set(otherSubject,structuredClone(h.records.get(E)));const before=structuredClone([...h.records]);await h.un();for(const [p,d]of before)if(p!==E)assert.deepEqual(h.records.get(p),d);assert.equal(h.api.decodeJointCMemberEdge(P,'A','bob',X,h.records.get(E)).state,'unassigned')})
for(const operation of ['un','re'])test('S3-E concurrent '+operation+' only one winner',async()=>{const h=setup();if(operation==='re')await h.un();const before=h.writes.length;const r=await Promise.allSettled([h[operation](),h[operation]()]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(h.writes.length,before+1)})
test('S3-E session changes before writes and after commit do not report success',async()=>{const h=setup();h.hook(()=>h.auth.currentUser={uid:'alice'});await assert.rejects(h.un());assert.equal(h.writes.length,0);const j=setup();j.after(()=>j.auth.currentUser={uid:'alice'});await assert.rejects(j.un());assert.equal(j.writes.length,1)})
test('S3-E denied write preserves all records',async()=>{const h=setup(),before=structuredClone([...h.records]);h.fail();await assert.rejects(h.un());assert.deepEqual([...h.records],before)})
test('S3-E builder does not mutate frozen input; overflow denied',()=>{const h=setup(),d=h.records.get(E),before=structuredClone(d);Object.freeze(d);Object.freeze(d.targetRef);h.api.transitionJointCMemberEdge(P,'A','bob',target,1,d,'unassigned','alice',actor,time);assert.deepEqual(d,before);assert.throws(()=>h.api.transitionJointCMemberEdge(P,'A','bob',target,Number.MAX_SAFE_INTEGER,{...d,revision:Number.MAX_SAFE_INTEGER},'unassigned','alice',actor,time))})
