// Full-composition feasibility gate. STOP on any valid-path failure.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {optimized}=require('./fixtures/invitation-renewal.cjs')
const {sdk,h,db,inputs,base,read,transition,write,notice}=require('./fixtures/independent-invitations-harness.cjs')
const r=optimized(fs.readFileSync('firestore.rules','utf8'))
const {joinPatch}=require('./fixtures/independent-invitations-harness.cjs')
async function createBase(e){return sdk.setDoc(sdk.doc(db(e,'owner'),'jointPlans/p'),{...base(),invitationRecipient:null})}
async function activateOptimized(e,actor,uid){
 const d=db(e,actor)
 return sdk.runTransaction(d,async tx=>{
  const p=(await tx.get(sdk.doc(d,'jointPlans/p'))).data()
  const a=await tx.get(sdk.doc(d,'friendships',actor+':'+uid)),b=await tx.get(sdk.doc(d,'friendships',uid+':'+actor))
  const f=a.exists()&&!b.exists()?a.data():b.exists()&&!a.exists()?b.data():null
  if(!f||f.status!=='accepted')throw Error('friendship unavailable')
  const next=transition(p,actor,uid,f.cycleId);if(!next)return 'already-sent'
  next.invitationRecipient=uid
  tx.set(sdk.doc(d,'jointPlans/p'),next)
  tx.set(sdk.doc(d,'users',uid,'activityInbox',`jp_p_${next.invitationSerial}`),notice('p',uid,next))
  return 'sent'
 },{maxAttempts:5})
}
test('full composition: equivalent fourth activation at positions 1–4',async t=>{
 const e=await h.initialize(r)
 try{for(let position=0;position<4;position++){
  await e.clearFirestore();const entries=inputs()
  let p={...base(),invitationRecipient:null,createdAt:h.TIME,updatedAt:h.TIME}
  // Positional control: identical valid prior state for each permutation.
  for(const [i,uid] of ['one','two','three'].entries()){
   p={...transition(p,'owner',uid,'cycle_unique_000'+(i+1)),invitationRecipient:uid,updatedAt:h.TIME}
   entries[`users/${uid}/activityInbox/jp_p_${i+1}`]={...notice('p',uid,p),createdAt:h.TIME}
  }
  entries['jointPlans/p']=p;await h.seed(e,entries)
  const before=await read(e)
  const next={...transition(before,'owner','four','cycle_unique_0004'),invitationRecipient:'four'}
  next.inviteeIds=['one','two','three'];next.inviteeIds.splice(position,0,'four')
  let error;try{await write(e,'owner','four',next)}catch(x){error=x}
  t.diagnostic(JSON.stringify({position:position+1,pass:!error,expressions:/1000 expressions/.test(error?.message||''),message:error?.message}))
  if(error){assert.deepEqual(await read(e),before);assert.equal((await sdk.getDoc(sdk.doc(db(e,'four'),'users/four/activityInbox/jp_p_4'))).exists(),false);throw error}
  const after=await read(e);assert.equal(after.invitationSerial,4);assert.equal(after.inviteeIds.length,4)
  assert.equal((await sdk.getDoc(sdk.doc(db(e,'four'),'users/four/activityInbox/jp_p_4'))).data().occurrence,4)
 }}finally{await e.cleanup()}
})
test('member inviter direct/inverse with owner friendship absent',async t=>{
 const e=await h.initialize(r)
 try{for(const inverse of [false,true]){
  await e.clearFirestore();await h.seed(e,inputs());await createBase(e);await activateOptimized(e,'owner','one')
  await sdk.updateDoc(sdk.doc(db(e,'one'),'jointPlans/p'),joinPatch(await read(e),'one'))
  await e.withSecurityRulesDisabled(async c=>{
   await sdk.deleteDoc(sdk.doc(c.firestore(),'friendships/owner:two'))
   await sdk.setDoc(sdk.doc(c.firestore(),inverse?'friendships/two:one':'friendships/one:two'),{participants:['one','two'],senderId:'one',recipientId:'two',status:'accepted',cycleId:'cycle_member_00001'})
  })
  try{await activateOptimized(e,'one','two')}catch(error){t.diagnostic(error.message);throw error}
  const p=await read(e);assert.equal(p.invitedBy.two,'one');assert.equal(p.invitationCycles.two,'cycle_member_00001')
  t.diagnostic('member inviter '+(inverse?'inverse':'direct')+' PASS')
 }}finally{await e.cleanup()}
})
test('reinvite preserves history; stale JOIN rejects; current JOIN succeeds',async t=>{
 const e=await h.initialize(r)
 try{
  await e.clearFirestore();await h.seed(e,inputs('inverse'));await createBase(e);await activateOptimized(e,'owner','one')
  const old=await read(e),activity=await sdk.getDoc(sdk.doc(db(e,'one'),'users/one/activityInbox/jp_p_1'))
  await sdk.updateDoc(sdk.doc(db(e,'owner'),'friendships/one:owner'),{status:'withdrawn'})
  await h.assertFails(sdk.updateDoc(sdk.doc(db(e,'one'),'jointPlans/p'),joinPatch(old,'one')))
  // Existing canonical request/accept protocol, exact versioned friend notices.
  const c='cycle_refriend_0001',d=db(e,'one'),b=sdk.writeBatch(d)
  b.set(sdk.doc(d,'friendships/one:owner'),{participants:['one','owner'],senderId:'one',recipientId:'owner',status:'pending',cycleId:c})
  b.set(sdk.doc(d,'usedFriendshipCycles',c),{relationshipId:'one:owner',participants:['one','owner']})
  const n={schemaVersion:2,type:'FRIEND_REQUEST',actorUid:'one',createdAt:sdk.serverTimestamp(),readAt:null,target:{kind:'friendship',id:'one:owner'},friendshipCycleId:c}
  b.set(sdk.doc(d,'users/owner/activityInbox/fr_'+c),n);await b.commit()
  const a=sdk.writeBatch(db(e,'owner'));a.update(sdk.doc(db(e,'owner'),'friendships/one:owner'),{status:'accepted'})
  a.set(sdk.doc(db(e,'owner'),'users/one/activityInbox/fa_'+c),{...n,type:'FRIEND_ACCEPTED',actorUid:'owner'});await a.commit()
  await h.assertFails(sdk.updateDoc(sdk.doc(db(e,'one'),'jointPlans/p'),joinPatch(old,'one')))
  try{await activateOptimized(e,'owner','one')}catch(error){t.diagnostic(error.message);throw error}
  const p=await read(e);assert.equal(p.invitationSerial,2);assert.equal(p.invitationCycles.one,c)
  assert.deepEqual((await sdk.getDoc(sdk.doc(db(e,'one'),'users/one/activityInbox/jp_p_1'))).data(),activity.data())
  await h.assertFails(sdk.updateDoc(sdk.doc(db(e,'one'),'jointPlans/p'),joinPatch(p,'one',1)))
  await sdk.updateDoc(sdk.doc(db(e,'one'),'jointPlans/p'),joinPatch(p,'one'))
 }finally{await e.cleanup()}
})
test('equivalence negatives: original dispatch and optimized dispatch',async t=>{
 const cases=['spoof-selector','invitedBy','friendship','withdrawn','stale-cycle','wrong-cycle','occurrence','reuse','serial','duplicate','two-mutations','hidden-binding','catalog','instance','archived','frozen','closed','capacity','activity-type','missing','recipient','actor','activity-occurrence','activity-cycle','replay','cross-plan','source-missing','remove-existing','historical-cycle']
 const {independent}=require('./fixtures/independent-invitations.cjs')
 for(const mode of ['old','optimized']){
  const e=await h.initialize(mode==='old'?independent(fs.readFileSync('firestore.rules','utf8')):r)
  try{for(const kind of cases)await t.test(mode+': '+kind,async t=>{
   await e.clearFirestore();await h.seed(e,inputs())
   if(mode==='old')await sdk.setDoc(sdk.doc(db(e,'owner'),'jointPlans/p'),base());else await createBase(e)
   let p=await read(e),first=transition(p,'owner','one','cycle_unique_0001')
   if(mode==='optimized')first.invitationRecipient='one'
   await write(e,'owner','one',first);p=await read(e)
   const next=transition(p,'owner','two','cycle_unique_0002'),options={}
   if(mode==='optimized')next.invitationRecipient='two'
   if(kind==='spoof-selector'){if(mode==='optimized')next.invitationRecipient='one';else next.invitationOccurrences.one=2}
   if(kind==='invitedBy')next.invitedBy.two='one'
   if(kind==='wrong-cycle'||kind==='stale-cycle')next.invitationCycles.two='cycle_incorrect_000'
   if(kind==='occurrence')next.invitationOccurrences.two=3
   if(kind==='reuse')next.invitationOccurrences.two=1
   if(kind==='serial')next.invitationSerial=3
   if(kind==='duplicate'){Object.assign(next,p,{updatedAt:sdk.serverTimestamp()});options.recipient='one';options.item='jp_p_1';options.notice=notice('p','one',next)}
   if(kind==='two-mutations')next.invitationOccurrences.one=2
   if(kind==='hidden-binding')next.participants.one={careerInstanceId:'i_one',bindingState:'resolved'}
   if(kind==='catalog')next.catalogId='other'
   if(kind==='instance')next.participants.owner.careerInstanceId='i_two'
   if(kind==='capacity'){for(const uid of ['three','four','five']){next.inviteeIds.push(uid);next.participants[uid]={careerInstanceId:null,bindingState:'unresolved'};next.invitedBy[uid]='owner';next.invitationCycles[uid]='cycle_unique_0003';next.invitationOccurrences[uid]=2}}
   if(kind==='remove-existing')next.inviteeIds=['two']
   if(kind==='historical-cycle')next.invitationCycles.one='cycle_incorrect_000'
   const mutations={friendship:['friendships/owner:two',{status:'pending'}],withdrawn:['friendships/owner:two',{status:'withdrawn'}],archived:['users/owner/careerInstances/i_owner',{lifecycle:'archived'}],frozen:['migrationUsers/owner',{authority:'frozen'}],closed:['jointPlans/p',{closed:true}]}
   if(mutations[kind])await e.withSecurityRulesDisabled(c=>sdk.updateDoc(sdk.doc(c.firestore(),mutations[kind][0]),mutations[kind][1]))
   if(kind.startsWith('activity-')||kind==='actor'){options.notice=notice('p','two',next);if(kind==='activity-type')options.notice.type='FRIEND_REQUEST';if(kind==='actor')options.notice.actorUid='one';if(kind==='activity-occurrence')options.notice.occurrence=3;if(kind==='activity-cycle')options.notice.friendshipCycleId='cycle_incorrect_000'}
   if(kind==='missing')options.noNotice=true
   if(kind==='source-missing')options.noSource=true
   if(kind==='recipient')options.recipient='three'
   if(kind==='cross-plan'){options.notice=notice('other','two',next)}
   if(kind==='replay'){options.noSource=true;options.recipient='one';options.item='jp_p_1';options.notice=notice('p','one',p)}
   const before=await read(e);let error;try{await write(e,'owner','two',next,'p',options)}catch(x){error=x}
   assert.ok(error,'attack must reject');assert.equal(error.code,'permission-denied');assert.deepEqual(await read(e),before)
   t.diagnostic(JSON.stringify({kind,expressions:/1000 expressions/.test(error.message)}))
  })}finally{await e.cleanup()}
 }
})
test('full composition real CREATE then independent 0→4 and fifth-member JOIN',async t=>{
 const e=await h.initialize(r)
 try{for(const o of ['direct','inverse','mixed']){
  await e.clearFirestore();await h.seed(e,inputs(o));await createBase(e)
  for(const uid of ['one','two','three','four']){
   try{assert.equal(await activateOptimized(e,'owner',uid),'sent')}catch(error){t.diagnostic(JSON.stringify({o,uid,message:error.message}));throw error}
  }
  let p=await read(e);assert.equal(p.invitationSerial,4)
  for(const uid of ['one','two','three','four']){
   assert.equal((await sdk.getDocs(sdk.collection(db(e,uid),'users',uid,'activityInbox'))).size,1)
   const {joinPatch}=require('./fixtures/independent-invitations-harness.cjs')
   await sdk.updateDoc(sdk.doc(db(e,uid),'jointPlans/p'),joinPatch(p,uid));p=await read(e)
  }
  assert.equal(p.memberIds.length,5);t.diagnostic(o+' CREATE + four activations + four JOIN PASS')
 }}finally{await e.cleanup()}
})

