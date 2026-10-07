// Ordered feasibility gates. A valid-path failure stops this test immediately.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {slots}=require('./fixtures/slot-prototype.cjs')
const {sdk,h,db,inputs}=require('./fixtures/independent-invitations-harness.cjs')
const P='plan000000000001',X='occurrence000001',Y='occurrence000002',C2='cycle_refriend_0001'
const root=`jointPlans/${P}`
const r=slots(fs.readFileSync('firestore.rules','utf8'))
const empty=()=>({status:'empty',uid:null,revision:0,occurrence:null,cycle:null,invitedBy:null,binding:null,joinedOccurrence:null,updatedAt:sdk.serverTimestamp()})
async function get(e,path,u='owner'){return (await sdk.getDoc(sdk.doc(db(e,u),path))).data()}
async function create(e){const d=db(e,'owner'),b=sdk.writeBatch(d)
 b.set(sdk.doc(d,root),{schemaVersion:30,ownerId:'owner',ownerInstanceId:'i_owner',catalogId:'catalog',closed:false,deleting:false,createdAt:sdk.serverTimestamp()})
 for(let n=1;n<=4;n++)b.set(sdk.doc(d,root,'slots','slot'+n),empty())
 await b.commit()
}
async function invite(e,s,u,o,c,actor='owner',options={}){
 const d=db(e,actor),before=options.before||await get(e,`${root}/slots/${s}`,actor),b=sdk.writeBatch(d)
 if(!options.noSlot)b.set(sdk.doc(d,root,'slots',s),{...before,status:'pending',uid:u,revision:before.revision+1,occurrence:o,cycle:c,invitedBy:actor,updatedAt:sdk.serverTimestamp(),...options.slot})
 if(before.status==='empty'&&!options.noIndex)b.set(sdk.doc(d,root,'inviteeIndex',u),{slotId:s,...options.index})
 if(!options.noOccurrence)b.set(sdk.doc(d,root,'invitationOccurrences',o),{slotId:s,uid:u,invitedBy:actor,cycle:c,revision:before.revision+1,createdAt:sdk.serverTimestamp(),...options.occurrence})
 if(!options.noActivity)b.set(sdk.doc(d,'users',options.recipient||u,'activityInbox',options.activityId||`sp_${P}_${o}`),{schemaVersion:30,type:'SLOT_INVITATION',planId:P,occurrence:o,actorUid:actor,cycle:c,createdAt:sdk.serverTimestamp(),readAt:null,...options.activity})
 await b.commit()
}
async function refriend(e){
 await sdk.updateDoc(sdk.doc(db(e,'owner'),'friendships/one:owner'),{status:'withdrawn'})
 const d=db(e,'one'),b=sdk.writeBatch(d)
 b.set(sdk.doc(d,'friendships/one:owner'),{participants:['one','owner'],senderId:'one',recipientId:'owner',status:'pending',cycleId:C2})
 b.set(sdk.doc(d,'usedFriendshipCycles',C2),{relationshipId:'one:owner',participants:['one','owner']})
 const n={schemaVersion:2,type:'FRIEND_REQUEST',actorUid:'one',createdAt:sdk.serverTimestamp(),readAt:null,target:{kind:'friendship',id:'one:owner'},friendshipCycleId:C2}
 b.set(sdk.doc(d,'users/owner/activityInbox/fr_'+C2),n);await b.commit()
 const a=sdk.writeBatch(db(e,'owner'));a.update(sdk.doc(db(e,'owner'),'friendships/one:owner'),{status:'accepted'})
 a.set(sdk.doc(db(e,'owner'),'users/one/activityInbox/fa_'+C2),{...n,type:'FRIEND_ACCEPTED',actorUid:'owner'});await a.commit()
}
async function memberRefriend(e){
 const id='one:two',c='cycle_membernew01'
 await sdk.updateDoc(sdk.doc(db(e,'one'),'friendships',id),{status:'withdrawn'})
 const d=db(e,'two'),b=sdk.writeBatch(d),n={schemaVersion:2,type:'FRIEND_REQUEST',actorUid:'two',createdAt:sdk.serverTimestamp(),readAt:null,target:{kind:'friendship',id},friendshipCycleId:c}
 b.set(sdk.doc(d,'friendships',id),{participants:['one','two'],senderId:'two',recipientId:'one',status:'pending',cycleId:c})
 b.set(sdk.doc(d,'usedFriendshipCycles',c),{relationshipId:id,participants:['one','two']})
 b.set(sdk.doc(d,'users/one/activityInbox/fr_'+c),n);await b.commit()
 const a=sdk.writeBatch(db(e,'one'));a.update(sdk.doc(db(e,'one'),'friendships',id),{status:'accepted'})
 a.set(sdk.doc(db(e,'one'),'users/two/activityInbox/fa_'+c),{...n,type:'FRIEND_ACCEPTED',actorUid:'one'});await a.commit();return c
}
async function join(e,o){return sdk.updateDoc(sdk.doc(db(e,'one'),root,'slots','slot1'),{status:'member',binding:'i_one',joinedOccurrence:o,updatedAt:sdk.serverTimestamp()})}
async function rejected(t,label,fn){let error;try{await fn()}catch(x){error=x};assert.ok(error,label);assert.equal(error.code,'permission-denied');const exhausted=/1000 expressions/.test(error.message),access=/Service call error|maximum.*calls/i.test(error.message);t.diagnostic(JSON.stringify({negative:label,exhausted,access,evaluationError:/evaluation error/.test(error.message)}));assert.equal(exhausted,false,label);assert.equal(access,false,label)}
test('C ordered feasibility gates',async t=>{
 fs.writeFileSync('.tools/slot-prototype.rules',r)
 const e=await h.initialize(r)
 async function gate(n,fn){try{await fn();t.diagnostic(`GATE ${n} PASS`)}catch(error){t.diagnostic(JSON.stringify({gate:n,code:error.code,expressions:/1000 expressions/.test(error.message),message:error.message}));throw error}}
 try{
  await e.clearFirestore();await h.seed(e,inputs('inverse'))
  await gate(1,()=>create(e))
  await gate(2,()=>invite(e,'slot1','one',X,'cycle_unique_0001'))
  const old=await get(e,`${root}/invitationOccurrences/${X}`,'one'),oldActivity=await get(e,`users/one/activityInbox/sp_${P}_${X}`,'one')
  await gate(3,()=>refriend(e))
  await gate(4,()=>invite(e,'slot1','one',Y,C2))
  assert.deepEqual(await get(e,`${root}/invitationOccurrences/${X}`,'one'),old)
  assert.deepEqual(await get(e,`users/one/activityInbox/sp_${P}_${X}`,'one'),oldActivity)
  assert.equal((await get(e,`${root}/slots/slot1`)).occurrence,Y)
  assert.equal((await get(e,`${root}/inviteeIndex/one`)).slotId,'slot1')
  await gate(5,async()=>{
   await h.assertFails(join(e,X))
   await sdk.updateDoc(sdk.doc(db(e,'owner'),'friendships/one:owner'),{status:'withdrawn'})
   await h.assertFails(join(e,Y))
   // Independent reproduction of the successful current JOIN; no admin resurrection.
   await e.clearFirestore();await h.seed(e,inputs('inverse'));await create(e)
   await invite(e,'slot1','one',X,'cycle_unique_0001');await refriend(e);await invite(e,'slot1','one',Y,C2)
   await join(e,Y);assert.equal((await get(e,`${root}/slots/slot1`)).status,'member')
  })
  await gate(6,async()=>{
   const attacks={noActivity:{noActivity:true},noOccurrence:{noOccurrence:true},activityOnly:{noSlot:true,noIndex:true,noOccurrence:true},wrongRecipient:{recipient:'two'},wrongActor:{activity:{actorUid:'two'}},wrongCycle:{activity:{cycle:'wrongcycle000001'}},wrongOccurrence:{activity:{occurrence:'wrongocc00000001'}}}
   for(const [label,options] of Object.entries(attacks)){
    await e.clearFirestore();await h.seed(e,inputs('inverse'));await create(e)
    await rejected(t,label,()=>invite(e,'slot1','one',X,'cycle_unique_0001','owner',options))
    assert.equal((await get(e,`${root}/slots/slot1`)).status,'empty')
   }
   await e.clearFirestore();await h.seed(e,inputs('inverse'));await create(e);await invite(e,'slot1','one',X,'cycle_unique_0001');await refriend(e)
   await rejected(t,'renewal missing Activity',()=>invite(e,'slot1','one',Y,C2,'owner',{noActivity:true}))
   await rejected(t,'renewal reuses Activity X',()=>invite(e,'slot1','one',Y,C2,'owner',{activityId:`sp_${P}_${X}`}))
   await invite(e,'slot1','one',Y,C2)
   await rejected(t,'mutate X',()=>sdk.updateDoc(sdk.doc(db(e,'owner'),root,'invitationOccurrences',X),{cycle:C2}))
   await rejected(t,'delete X',()=>sdk.deleteDoc(sdk.doc(db(e,'owner'),root,'invitationOccurrences',X)))
   await rejected(t,'restore X pointer',()=>sdk.updateDoc(sdk.doc(db(e,'owner'),root,'slots','slot1'),{occurrence:X,updatedAt:sdk.serverTimestamp()}))
  })
  await gate(7,async()=>{
   for(const orientation of ['direct','inverse','mixed']){
    await e.clearFirestore();await h.seed(e,inputs(orientation));await create(e)
    for(const [i,u] of ['one','two','three','four'].entries())await invite(e,'slot'+(i+1),u,'newoccurrence000'+(i+1),'cycle_unique_000'+(i+1))
    for(const [i,u] of ['one','two','three','four'].entries()){assert.equal((await get(e,`${root}/slots/slot${i+1}`)).uid,u);assert.equal((await get(e,`${root}/inviteeIndex/${u}`)).slotId,'slot'+(i+1))}
   }
  })
  await gate(8,()=>rejected(t,'fifth physical slot',()=>invite(e,'slot5','five','newoccurrence005','cycle_unique_0005','owner',{before:empty()})))
  await gate(9,async()=>{
   for(const [a,b] of [['slot1','slot2'],['slot2','slot4']]){
    await e.clearFirestore();await h.seed(e,inputs());await create(e);await invite(e,a,'one',X,'cycle_unique_0001')
    await rejected(t,`duplicate UID ${a}/${b}`,()=>invite(e,b,'one',Y,'cycle_unique_0001'))
    assert.equal((await get(e,`${root}/inviteeIndex/one`)).slotId,a);assert.equal((await get(e,`${root}/slots/${b}`)).status,'empty')
   }
  })
  await gate(10,async()=>{
   const entries=inputs();entries['migrationUsers/five']={...entries['migrationUsers/four'],manifestId:'five'}
   entries['users/five/careerInstances/i_five']={...entries['users/four/careerInstances/i_four']}
   entries['friendships/owner:five']={participants:['five','owner'],senderId:'owner',recipientId:'five',status:'accepted',cycleId:'cycle_unique_0005'}
   for(let round=0;round<4;round++){
    await e.clearFirestore();await h.seed(e,entries);await create(e)
    for(const [i,u] of ['one','two','three'].entries())await invite(e,'slot'+(i+1),u,'raceoccurrence00'+(i+1),'cycle_unique_000'+(i+1))
    const before=await get(e,`${root}/slots/slot4`)
    const results=await Promise.allSettled(['four','five'].map((u,i)=>invite(e,'slot4',u,'racewinner00000'+(i+1),'cycle_unique_000'+(i+4),'owner',{before})))
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1)
    for(const result of results.filter(x=>x.status==='rejected')){assert.equal(result.reason.code,'permission-denied');assert.equal(/1000 expressions|Service call error/i.test(result.reason.message),false)}
    const winner=(await get(e,`${root}/slots/slot4`)).uid,loser=winner==='four'?'five':'four'
    assert.equal((await get(e,`${root}/inviteeIndex/${winner}`)).slotId,'slot4')
    assert.equal(await get(e,`${root}/inviteeIndex/${loser}`),undefined)
    await e.withSecurityRulesDisabled(async c=>{assert.equal((await sdk.getDocs(sdk.collection(c.firestore(),'users',loser,'activityInbox'))).size,0);assert.equal((await sdk.getDoc(sdk.doc(c.firestore(),root,'invitationOccurrences',loser==='four'?'racewinner000001':'racewinner000002'))).exists(),false)})
   }
   // Same UID races for two distinct physical slots.
   await e.clearFirestore();await h.seed(e,inputs());await create(e)
   const results=await Promise.allSettled(['slot1','slot2'].map((s,i)=>invite(e,s,'one','duplicateocc000'+(i+1),'cycle_unique_0001','owner',{before:empty()})))
   assert.equal(results.filter(x=>x.status==='fulfilled').length,1)
   for(const result of results.filter(x=>x.status==='rejected')){assert.equal(result.reason.code,'permission-denied');assert.equal(/1000 expressions|Service call error/i.test(result.reason.message),false)}
   const index=await get(e,`${root}/inviteeIndex/one`);assert.equal((await get(e,`${root}/slots/${index.slotId}`)).uid,'one')
   assert.equal((await get(e,`${root}/slots/${index.slotId==='slot1'?'slot2':'slot1'}`)).status,'empty')
   assert.equal((await sdk.getDocs(sdk.collection(db(e,'one'),'users/one/activityInbox'))).size,1)
  })
  await gate(11,async()=>{
   await e.clearFirestore();const entries=inputs('inverse');delete entries['friendships/two:owner']
   entries['friendships/one:two']={participants:['one','two'],senderId:'two',recipientId:'one',status:'accepted',cycleId:'cycle_memberold01'}
   entries['usedFriendshipCycles/cycle_memberold01']={relationshipId:'one:two',participants:['one','two']}
   await h.seed(e,entries);await create(e);await invite(e,'slot1','one',X,'cycle_unique_0001');await join(e,X)
   await invite(e,'slot2','two','memberoldocc0001','cycle_memberold01','one')
   const c=await memberRefriend(e)
   await invite(e,'slot2','two','membernewocc0001',c,'one')
   const s=await get(e,`${root}/slots/slot2`);assert.equal(s.invitedBy,'one');assert.equal(s.occurrence,'membernewocc0001')
  })
  await gate('negative-corpus',async()=>{
   const attacks={spoofUid:{slot:{uid:'two'}},spoofInviter:{slot:{invitedBy:'two'}},wrongCycle:{slot:{cycle:'wrongcycle000001'},occurrence:{cycle:'wrongcycle000001'},activity:{cycle:'wrongcycle000001'}},occurrenceOtherUid:{occurrence:{uid:'two'}},occurrenceOtherPlan:{activity:{planId:'otherplan0000001'}},indexMismatch:{index:{slotId:'slot2'}},noIndex:{noIndex:true},noSlot:{noSlot:true},wrongPointer:{slot:{occurrence:'wrongpointer0001'}}}
   for(const [label,options] of Object.entries(attacks)){
    await e.clearFirestore();await h.seed(e,inputs('inverse'));await create(e)
    await rejected(t,label,()=>invite(e,'slot1','one',X,'cycle_unique_0001','owner',options))
    assert.equal((await get(e,`${root}/slots/slot1`)).status,'empty')
   }
   for(const [label,path,patch] of [
    ['wrong friendship','friendships/one:owner',{status:'pending'}],
    ['withdrawn friendship','friendships/one:owner',{status:'withdrawn'}],
    ['frozen actor','migrationUsers/owner',{authority:'frozen'}],
    ['frozen recipient','migrationUsers/one',{authority:'frozen'}],
    ['archived actor','users/owner/careerInstances/i_owner',{lifecycle:'archived'}],
    ['wrong catalog','users/owner/careerInstances/i_owner',{catalogId:'other'}],
    ['closed plan',root,{closed:true}]]){
    await e.clearFirestore();await h.seed(e,inputs('inverse'));await create(e)
    await e.withSecurityRulesDisabled(c=>sdk.updateDoc(sdk.doc(c.firestore(),path),patch))
    await rejected(t,label,()=>invite(e,'slot1','one',X,'cycle_unique_0001'))
   }
   await e.clearFirestore();await h.seed(e,inputs('inverse'));await create(e);await invite(e,'slot1','one',X,'cycle_unique_0001');await refriend(e)
   await rejected(t,'stale C1 reinvite',()=>invite(e,'slot1','one',Y,'cycle_unique_0001'))
   await invite(e,'slot1','one',Y,C2)
   await rejected(t,'JOIN stale X',()=>join(e,X))
   await rejected(t,'JOIN wrong catalog binding',()=>sdk.updateDoc(sdk.doc(db(e,'one'),root,'slots','slot1'),{status:'member',binding:'i_owner',joinedOccurrence:Y,updatedAt:sdk.serverTimestamp()}))
   await sdk.updateDoc(sdk.doc(db(e,'one'),'friendships/one:owner'),{status:'withdrawn'})
   await rejected(t,'JOIN withdrawn C2',()=>join(e,Y))
  })
 }finally{await e.cleanup()}
})
