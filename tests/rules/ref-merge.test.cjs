const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {refMerge}=require('./fixtures/ref-merge.cjs')
let source=fs.readFileSync('tests/rules/slot-prototype.test.cjs','utf8').split("test('C ordered feasibility gates'")[0]
source=source.replace('await b.commit()\n}',"b.set(sdk.doc(d,'users','owner','jointPlanRefs',P),{schemaVersion:1});await b.commit()\n}")
source=source.replace(' await b.commit()\n}\nasync function refriend',` if(before.status==='empty'&&!options.noRef)b.set(sdk.doc(d,'users',u,'jointPlanRefs',P),options.refData||{schemaVersion:1},options.replaceRef?{}:{merge:true});await b.commit()
}
async function refriend`)
const {sdk,h,db,inputs,root,create,invite,refriend,join,P,X,Y}=new Function('require',source+';return {sdk,h,db,inputs,root,create,invite,refriend,join,P,X,Y}')(require)
test('S2-E1-P ordered ref merge gates',async t=>{
 const rules=refMerge(fs.readFileSync('firestore.rules','utf8')),evidence=[],negativeFailures=[]
 fs.writeFileSync('.tools/ref-merge.rules',rules)
 const e=await h.initialize(rules),ref=u=>`users/${u}/jointPlanRefs/${P}`
 const flush=()=>fs.writeFileSync('.tools/ref-merge-evidence.json',JSON.stringify(evidence,null,2)+'\n')
 async function attempt(label,fn,negative=false){
  let error;try{await fn()}catch(x){error=x}
  const message=error?.message||'',expressions=/1000\s+expressions/i.test(message),service=/service[ -]call error|maximum[^\n]*calls|too many[^\n]*calls|resource[ -]exhaust(?:ed|ion)/i.test(message)||error?.code==='resource-exhausted'
  // Alternate branches can emit evaluation errors on an ordinary denied request.
  // Resource signals take precedence; branch diagnostics alone do not override DENY.
  const category=!error?'PASS':expressions||service?'RESOURCE BLOCKED':error.code==='permission-denied'?'LOGICAL DENY':'OTHER ERROR'
  evidence.push({label,negative,category,expressions,service,code:error?.code||null,message});flush();t.diagnostic(JSON.stringify(evidence.at(-1)))
  if(!negative&&error)throw error
  if(negative&&category!=='LOGICAL DENY')negativeFailures.push({label,category})
 }
 async function read(p){let d;await e.withSecurityRulesDisabled(async c=>{d=(await sdk.getDoc(sdk.doc(c.firestore(),p))).data()});return d}
 async function reset(){await e.clearFirestore();await h.seed(e,inputs('inverse'));await create(e)}
 async function release(u,s='slot1'){
  const old=await read(root+'/slots/'+s),d=db(e,u),b=sdk.writeBatch(d)
  b.set(sdk.doc(d,root,'slots',s),{status:'empty',uid:null,revision:old.revision+1,occurrence:null,cycle:null,invitedBy:null,binding:null,joinedOccurrence:null,updatedAt:sdk.serverTimestamp()})
  b.delete(sdk.doc(d,root,'inviteeIndex',u));await b.commit()
 }
 async function unchanged(paths,fn){const before=await Promise.all(paths.map(read));await fn();assert.deepEqual(await Promise.all(paths.map(read)),before)}
 const first=(options={})=>invite(e,'slot1','one',X,'cycle_unique_0001','owner',options)
 try{
  await reset()
  await attempt('R1/P1 FIRST NEW',()=>first());assert.deepEqual(await read(ref('one')),{schemaVersion:1});evidence.push({label:'P2 minimal shape',category:'PASS'})
  const history=[ref('one'),`${root}/invitationOccurrences/${X}`,`users/one/activityInbox/sp_${P}_${X}`]
  await release('one')
  await attempt('R2/P3/P6 NEW after RELEASE minimal',()=>unchanged(history,()=>invite(e,'slot1','one',Y,'cycle_unique_0001')))
  await reset();await first();await release('one')
  // Historical pre-variant document established solely as a test precondition.
  await h.seed(e,{[ref('one')]:{schemaVersion:1,createdAt:h.TIME}})
  await attempt('R3/P4/P5 historical timestamp preserved',()=>unchanged(history,()=>invite(e,'slot1','one',Y,'cycle_unique_0001')))
  await reset();await first();await join(e,X)
  await h.seed(e,{'friendships/one:two':{participants:['one','two'],senderId:'one',recipientId:'two',status:'accepted',cycleId:'cycle_member0001'}})
  await attempt('R4/P7 invitedBy != owner',()=>invite(e,'slot2','two',Y,'cycle_member0001','one'))
  await reset();await first();await release('one')
  await attempt('P8 A release B release A',()=>unchanged(history,async()=>{await invite(e,'slot1','two',Y,'cycle_unique_0002');await release('two');await invite(e,'slot1','one','returnoccur00001','cycle_unique_0001')}))
  await reset();await first();await refriend(e)
  await attempt('REINVITE pending three writes preserves ref/history',()=>unchanged(history,()=>invite(e,'slot1','one',Y,'cycle_refriend_0001')))
  for(const [label,data,replace]of [
   ['N1 schema changed',{schemaVersion:2},false],['N2 timestamp changed',{schemaVersion:1,createdAt:sdk.serverTimestamp()},false],
   ['N3 extra field',{schemaVersion:1,extra:true},false],['N4 timestamp removed',{schemaVersion:1},true]]){
   await reset();await first();await release('one');await h.seed(e,{[ref('one')]:{schemaVersion:1,createdAt:h.TIME}})
   const paths=[ref('one'),root+'/slots/slot1',root+'/inviteeIndex/one',root+'/invitationOccurrences/'+Y,`users/one/activityInbox/sp_${P}_${Y}`]
   await unchanged(paths,()=>attempt(label,()=>invite(e,'slot1','one',Y,'cycle_unique_0001','owner',{refData:data,replaceRef:replace}),true))
  }
  await reset();await attempt('N5 create extra field',()=>first({refData:{schemaVersion:1,extra:true}}),true)
  await attempt('N6 standalone CREATE',()=>sdk.setDoc(sdk.doc(db(e,'owner'),ref('one')),{schemaVersion:1},{merge:true}),true)
  await first();await attempt('N6 standalone no-op UPDATE',()=>sdk.setDoc(sdk.doc(db(e,'owner'),ref('one')),{schemaVersion:1},{merge:true}),true)
  await attempt('N8 DELETE',()=>sdk.deleteDoc(sdk.doc(db(e,'one'),ref('one'))),true)
  await attempt('N9 inviter GET private ref',()=>sdk.getDoc(sdk.doc(db(e,'owner'),ref('one'))),true)
  await attempt('N9 inviter LIST private refs',()=>sdk.getDocs(sdk.collection(db(e,'owner'),'users/one/jointPlanRefs')),true)
  await attempt('N10 duplicate UID',()=>invite(e,'slot2','one',Y,'cycle_unique_0001'),true)
  await release('one')
  await attempt('N7 residual ref not parent authority',()=>sdk.getDoc(sdk.doc(db(e,'one'),root)),true)
  await attempt('N7 residual ref not JOIN authority',()=>join(e,X),true)
  await attempt('N11 fifth slot',()=>invite(e,'slot5','one',Y,'cycle_unique_0001','owner',{before:{status:'empty',uid:null,revision:0,occurrence:null,cycle:null,invitedBy:null,binding:null,joinedOccurrence:null,updatedAt:h.TIME}}),true)
  await attempt('N12 stale cycle',()=>invite(e,'slot1','one',Y,'cycle_stale00001'),true)
  await attempt('N13 stale occurrence replay',()=>first(),true)
  await attempt('N13 stale revision',()=>invite(e,'slot1','one',Y,'cycle_unique_0001','owner',{slot:{revision:1}}),true)
  // Independent fully formed batches race; no retry on permission-denied.
  async function race(label,calls){await attempt(label,async()=>{const r=await Promise.allSettled(calls.map(f=>f()));assert.equal(r.filter(x=>x.status==='fulfilled').length,1);const loser=r.find(x=>x.status==='rejected').reason;assert.equal(loser.code,'permission-denied');assert.ok(!/1000 expressions|Service call error/i.test(loser.message));const occupied=[];for(let n=1;n<=4;n++){const s=await read(root+'/slots/slot'+n);if(s.uid)occupied.push([s.uid,'slot'+n])}assert.equal(new Set(occupied.map(x=>x[0])).size,occupied.length);for(const [uid,slotId]of occupied){assert.deepEqual(await read(root+'/inviteeIndex/'+uid),{slotId});assert.ok(await read(ref(uid)))}evidence.push({label:label+' outcomes',outcomes:r.map(x=>x.status)})})}
  await reset();await race('C1 concurrent FIRST NEW',[()=>first(),()=>invite(e,'slot1','one',Y,'cycle_unique_0001')])
  await reset();await race('C2 same UID two slots',[()=>first(),()=>invite(e,'slot2','one',Y,'cycle_unique_0001')])
  await reset();await first();await invite(e,'slot2','two',Y,'cycle_unique_0002');await invite(e,'slot3','three','occurrence000003','cycle_unique_0003')
  await h.seed(e,{'migrationUsers/fifth':{...await read('migrationUsers/four'),manifestId:'fifth'},'friendships/fifth:owner':{participants:['fifth','owner'],senderId:'owner',recipientId:'fifth',status:'accepted',cycleId:'cycle_unique_0005'}})
  await race('C3 last slot two users',[()=>invite(e,'slot4','four','occurrence000007','cycle_unique_0004'),()=>invite(e,'slot4','fifth','occurrence000008','cycle_unique_0005')])
  await reset();await first();await release('one');await race('C4 reentry versus acquisition',[()=>invite(e,'slot1','one',Y,'cycle_unique_0001'),()=>invite(e,'slot1','two','occurrence000009','cycle_unique_0002')]);assert.deepEqual(await read(ref('one')),{schemaVersion:1})
  assert.deepEqual(negativeFailures,[],'Negative classification failures (full evidence retained)')
 }finally{
  t.diagnostic(JSON.stringify({summary:evidence.filter(x=>x.category).map(({label,category})=>({label,category})),negativeFailures}))
  flush();await e.cleanup()
 }
})
