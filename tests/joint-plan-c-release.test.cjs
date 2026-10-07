const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const P='releaseplan00001x',O='occurrence000001x',root=`jointPlans/${P}`,S=root+'/slots/slot1',I=root+'/inviteeIndex/bob',stamp={seconds:1,nanoseconds:0}
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x))
function setup(){
  const records=new Map(),reads=[],commits=[],auth={currentUser:{uid:'bob'}};let revision=0,deny=null,hook=()=>{}
  records.set(root,{schemaVersion:3,origin:'native',ownerId:'alice',ownerInstanceId:'ia',catalogId:'catalog',closed:false,deleting:false,createdAt:stamp})
  records.set(S,{status:'member',uid:'bob',revision:1,occurrence:O,cycle:'cycle00000000001',invitedBy:'alice',binding:'ib',joinedOccurrence:O,updatedAt:stamp})
  records.set(I,{slotId:'slot1'})
  for(const p of [root+'/invitationOccurrences/'+O,'users/bob/activityInbox/sp_'+P+'_'+O,'users/bob/jointPlanRefs/'+P])records.set(p,{historical:true})
  const sdk={doc:(_,p)=>p,serverTimestamp:()=>stamp,runTransaction:async(_,fn)=>{
    for(let n=0;n<5;n++){
      const start=revision,writes=[]
      await fn({get:async p=>{assert.equal(writes.length,0);reads.push(p);const d=clone(records.get(p));hook();return {exists:()=>d!==undefined,data:()=>d}},
        update:(p,d)=>writes.push([p,{...clone(records.get(p)),...clone(d)}]),delete:p=>writes.push([p,undefined])})
      if(start!==revision)continue
      if(writes.some(([p])=>p===deny))throw Object.assign(Error('denied'),{code:'permission-denied'})
      writes.forEach(([p,d])=>d===undefined?records.delete(p):records.set(p,d));revision++;commits.push(writes);return
    }throw Error('conflict')
  }}
  const source=['jointPlanLogic.js','jointJoinLogic.js','services/jointJoin.js'].map(f=>fs.readFileSync(path.resolve(__dirname,'../src',f),'utf8').replace(/^import .*\r?\n/gm,'').replace(/export /g,'')).join('\n')
  const api=new Function('doc','serverTimestamp','runTransaction',source+';return {releaseJointCSlot,decodeJointCSlot,buildJointCRelease}')(...Object.values(sdk))
  return {api,records,reads,commits,auth,sdk,deny:p=>deny=p,hook:f=>hook=f,release:(o=O,r=1,uid='bob')=>api.releaseJointCSlot({db:{},auth},uid,P,'slot1',o,r)}
}
test('F1 T1/T2/T3/T7 exact atomic release and revision advance',async()=>{const h=setup();await h.release();assert.equal(h.records.get(S).status,'empty');assert.equal(h.records.get(S).revision,2);assert.equal(h.records.has(I),false);assert.deepEqual(h.commits[0].map(x=>x[0]),[S,I]);assert.equal(h.commits.length,1)})
test('F1 T4/T5/T6 all historical documents preserved',async()=>{const h=setup(),history=[...h.records].filter(([p])=>![S,I].includes(p));await h.release();for(const [p,d]of history)assert.deepEqual(h.records.get(p),d)})
test('F1 T8 stale occupant rejected',async()=>{const h=setup();h.records.get(S).uid='carol';await assert.rejects(h.release());assert.equal(h.commits.length,0)})
test('F1 T9 stale revision and occurrence rejected',async()=>{const h=setup();await assert.rejects(h.release(O,2));await assert.rejects(h.release('otheroccurrence01',1));assert.equal(h.commits.length,0)})
test('F1 T10 other uid and spoof rejected',async()=>{const h=setup();await assert.rejects(h.release(O,1,'alice'));h.auth.currentUser={uid:'carol'};await assert.rejects(h.release(O,1,'carol'));assert.equal(h.commits.length,0)})
for(const [label,p] of [['T11',I],['T12',S]])test('F1 '+label+' denied write leaves both documents intact',async()=>{const h=setup(),before=clone([...h.records]);h.deny(p);await assert.rejects(h.release(),{code:'permission-denied'});assert.deepEqual([...h.records],before)})
test('F1 T13 concurrent releases perform at most one transition',async()=>{const h=setup(),r=await Promise.allSettled([h.release(),h.release()]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(h.commits.length,1);assert.equal(h.records.get(S).revision,2)})
test('F1 T14 replay cannot revive A; empty is not idempotent success',async()=>{const h=setup();await h.release();await assert.rejects(h.release());assert.equal(h.commits.length,1)})
test('F1 T15 released DTO ready for future occupancy without historical pointers',async()=>{const h=setup();await h.release();const s=h.api.decodeJointCSlot(h.records.get(S));for(const k of ['uid','occurrence','cycle','invitedBy','binding','joinedOccurrence'])assert.equal(s[k],null);assert.equal(s.status,'empty')})
test('F1 T16/T17 only parent, slot and own index read',async()=>{const h=setup();Object.defineProperty(h.auth.currentUser,'activeCareerInstanceId',{get(){throw Error('selection')}});await h.release();assert.deepEqual(h.reads,[root,S,I])})
test('F1 T18 invalid parent never falls back to legacy',async()=>{for(const schemaVersion of [undefined,2]){const h=setup();h.records.get(root).schemaVersion=schemaVersion;await assert.rejects(h.release());assert.equal(h.commits.length,0);assert.deepEqual(h.reads,[root,S,I])}})
test('F1 T19 absent/replaced session rejects',async()=>{const h=setup();h.auth.currentUser=null;await assert.rejects(h.release());assert.equal(h.reads.length,0);const b=setup();b.hook(()=>b.auth.currentUser={uid:'bob'});await assert.rejects(b.release());assert.equal(b.commits.length,0)})
test('F1 corrupt/missing index rejected without cleanup',async()=>{for(const idx of [null,{slotId:'slot2'},{slotId:'slot1',extra:true}]){const h=setup();idx?h.records.set(I,idx):h.records.delete(I);await assert.rejects(h.release());assert.equal(h.commits.length,0)}})
test('F1 pending/imported occupants may release and closed parent is allowed',async()=>{for(const kind of ['pending','imported']){const h=setup(),s=h.records.get(S);h.records.get(root).closed=true;if(kind==='pending'){s.status='pending';s.binding=null;s.joinedOccurrence=null}else{s.occurrence='import_'+O;s.joinedOccurrence=s.occurrence;s.cycle=null;s.invitedBy=null}await h.release(s.occurrence);assert.equal(h.records.get(S).status,'empty')}})
test('F1 deleting parent and revision exhaustion rejected',async()=>{const h=setup();h.records.get(root).closed=true;h.records.get(root).deleting=true;await assert.rejects(h.release());const b=setup();b.records.get(S).revision=Number.MAX_SAFE_INTEGER;await assert.rejects(b.release(O,Number.MAX_SAFE_INTEGER));assert.equal(b.commits.length,0)})
