const {test}=require('node:test'),assert=require('node:assert/strict')
const {load,fixture,P,X,Y,C,C2,root,time}=require('./joint-c-invite-harness.cjs')
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x)),S=root+'/slots/slot1',I=root+'/inviteeIndex/bob',REF=`users/bob/jointPlanRefs/${P}`
function setup(){
 const records=new Map(Object.entries(fixture())),reads=[],commits=[],auth={currentUser:{uid:'alice'}};let version=0,fail=null,readHook=()=>{},commitHook=()=>{}
 const sdk={doc:(_, ...p)=>p.join('/'),serverTimestamp:()=>time,runTransaction:async(_,fn)=>{
  for(let n=0;n<5;n++){
   const start=version,writes=[]
   await fn({get:async p=>{assert.equal(writes.length,0);reads.push(p);const d=clone(records.get(p));readHook();return {exists:()=>d!==undefined,data:()=>d}},
    set:(p,d,options)=>writes.push({p,d:clone(d),options}),update:(p,d)=>writes.push({p,d:clone(d),options:{merge:true}})})
   if(start!==version)continue
   // Policy stub only: emulator tests must demonstrate these Rules obligations.
   for(const w of writes)if(fail?.(w.p)||((w.p.includes('/inviteeIndex/')||w.p.includes('/invitationOccurrences/'))&&records.has(w.p)))throw Object.assign(Error('denied'),{code:'permission-denied'})
   for(const w of writes)records.set(w.p,w.options?.merge?{...records.get(w.p),...w.d}:w.d)
   version++;commits.push(writes);commitHook();return
  }throw Error('conflict')
 }}
 const api=load(sdk,auth,{})
 return {api,records,reads,commits,auth,fail:f=>fail=f,onRead:f=>readHook=f,onCommit:f=>commitHook=f,
  invite:(over={})=>{const a={uid:'alice',slot:'slot1',invitee:'bob',occurrence:X,cycle:C,revision:0,previous:null,...over};return api.inviteJointCParticipant(a.uid,P,a.slot,a.invitee,a.occurrence,a.cycle,a.revision,a.previous)},
  release:()=>{const s=records.get(S);records.set(S,api.emptyJointCSlot(time,s.revision+1));records.delete(I);version++}}
}
test('E1 FIRST NEW five atomic writes and minimal ref',async()=>{const h=setup();await h.invite();assert.equal(h.commits[0].length,5);assert.deepEqual(h.records.get(REF),{schemaVersion:1});assert.deepEqual(h.records.get(I),{slotId:'slot1'});assert.equal(h.records.get(S).revision,1);assert.equal(h.records.get(root+'/invitationOccurrences/'+X).cycle,C);assert.equal(h.records.get(`users/bob/activityInbox/sp_${P}_${X}`).occurrence,X)})
for(const historic of [false,true])test('E1 reentry preserves '+(historic?'timestamp':'minimal')+' ref',async()=>{const h=setup();await h.invite();h.release();if(historic)h.records.set(REF,{schemaVersion:1,createdAt:{seconds:5,nanoseconds:0}});const before=clone([...h.records].filter(([p])=>p===REF||p.includes('/activityInbox/')||p.includes('/invitationOccurrences/')));await h.invite({occurrence:Y,revision:2});assert.equal(h.commits.at(-1).length,5);for(const [p,d]of before)assert.deepEqual(h.records.get(p),d)})
test('E1 pending REINVITE is three writes, preserves X and ref',async()=>{const h=setup();await h.invite();h.records.get('friendships/alice:bob').cycleId=C2;const old=clone(h.records.get(root+'/invitationOccurrences/'+X));await h.invite({occurrence:Y,previous:X,revision:1,cycle:C2});assert.equal(h.commits[1].length,3);assert.deepEqual(h.records.get(root+'/invitationOccurrences/'+X),old);assert.ok(!h.commits[1].some(w=>w.p.includes('jointPlanRefs')||w.p.includes('inviteeIndex')))})
test('E1 member inviter differs from owner',async()=>{const h=setup();h.auth.currentUser={uid:'carol'};h.records.set(root+'/inviteeIndex/carol',{slotId:'slot2'});h.records.set(root+'/slots/slot2',{...h.records.get(S),status:'member',uid:'carol',revision:1,occurrence:Y,cycle:C,invitedBy:'alice',binding:'i_carol',joinedOccurrence:Y});h.records.set('friendships/bob:carol',{participants:['bob','carol'],senderId:'bob',recipientId:'carol',status:'accepted',cycleId:C});await h.invite({uid:'carol'});assert.equal(h.records.get(S).invitedBy,'carol')})
test('E1 duplicate UID rejected',async()=>{const h=setup();await h.invite();await assert.rejects(h.invite({slot:'slot2',occurrence:Y}));assert.equal(h.commits.length,1)})
test('E1 fifth slot invalid before reads',async()=>{const h=setup();await assert.rejects(h.invite({slot:'slot5'}));assert.equal(h.reads.length,0)})
for(const key of ['cycle','revision','previous'])test('E1 stale '+key+' rejected',async()=>{const h=setup();await assert.rejects(h.invite({[key]:key==='revision'?2:key==='cycle'?C2:Y}));assert.equal(h.commits.length,0)})
test('E1 pending same cycle and reused occurrence rejected',async()=>{const h=setup();await h.invite();await assert.rejects(h.invite({previous:X,revision:1,occurrence:Y}));await assert.rejects(h.invite({previous:X,revision:1,cycle:C2}));assert.equal(h.commits.length,1)})
for(const part of ['/slots/','/inviteeIndex/','/invitationOccurrences/','/activityInbox/','/jointPlanRefs/'])test('E1 atomic denial '+part,async()=>{const h=setup(),before=clone([...h.records]);h.fail(p=>p.includes(part));await assert.rejects(h.invite(),{code:'permission-denied'});assert.deepEqual([...h.records],before)})
test('E1 no private ref/target metadata or academic reads',async()=>{const h=setup();Object.defineProperty(h.auth.currentUser,'activeCareerInstanceId',{get(){throw Error('selection')}});await h.invite();assert.deepEqual(h.reads,[root,...[1,2,3,4].map(n=>root+'/slots/slot'+n),'migrationUsers/alice','users/alice/careerInstances/ia','friendships/alice:bob','friendships/bob:alice'])})
test('E1 concurrent same UID/two slots only one acquisition',async()=>{const h=setup(),r=await Promise.allSettled([h.invite(),h.invite({slot:'slot2',occurrence:Y})]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(h.commits.length,1)})
test('E1 concurrent different invitees same slot only one',async()=>{const h=setup(),r=await Promise.allSettled([h.invite(),h.invite({invitee:'dave',occurrence:Y})]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1)})
test('E1 concurrent reinvites only one revision',async()=>{const h=setup();await h.invite();h.records.get('friendships/alice:bob').cycleId=C2;const args={previous:X,revision:1,cycle:C2};const r=await Promise.allSettled([h.invite({...args,occurrence:Y}),h.invite({...args,occurrence:'occurrence000003z'})]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(h.records.get(S).revision,2)})
test('E1 session absent/change before commit rejects',async()=>{const h=setup();h.auth.currentUser=null;await assert.rejects(h.invite());assert.equal(h.reads.length,0);const b=setup();b.onRead(()=>b.auth.currentUser={uid:'alice'});await assert.rejects(b.invite());assert.equal(b.commits.length,0)})
test('E1 session after commit never reports success',async()=>{const h=setup();h.onCommit(()=>h.auth.currentUser=null);await assert.rejects(h.invite());assert.equal(h.commits.length,1)})
test('E1 minimal/historical decoder and malformed refs',()=>{const h=setup();for(const d of [{schemaVersion:1},{schemaVersion:1,createdAt:time}])assert.deepEqual(h.api.decodeJointCRef(P,d),{planId:P});for(const d of [{schemaVersion:1,createdAt:null},{schemaVersion:1,extra:true},{schemaVersion:2}])assert.throws(()=>h.api.decodeJointCRef(P,d))})
for(const variant of ['legacy','closed','archived','not-friend'])test('E1 rejects '+variant+' without fallback',async()=>{const h=setup();if(variant==='legacy')delete h.records.get(root).schemaVersion;if(variant==='closed')h.records.get(root).closed=true;if(variant==='archived')Object.assign(h.records.get('users/alice/careerInstances/ia'),{lifecycle:'archived',archivedAt:time});if(variant==='not-friend')h.records.get('friendships/alice:bob').status='withdrawn';await assert.rejects(h.invite());assert.equal(h.commits.length,0)})
