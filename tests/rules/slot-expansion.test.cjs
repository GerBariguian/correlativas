const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {expanded}=require('./fixtures/slot-expansion.cjs')
const source=fs.readFileSync('tests/rules/slot-prototype.test.cjs','utf8').split("test('C ordered feasibility gates'")[0]
const {sdk,h,db,inputs,P,X,Y,root,empty,get,create,invite,refriend,rejected}=new Function('require',source+';return {sdk,h,db,inputs,P,X,Y,root,empty,get,create,invite,refriend,rejected}')(require)
const rules=expanded(fs.readFileSync('firestore.rules','utf8'))
async function release(e,u,s='slot1',before,part){
 const d=db(e,u),b=sdk.writeBatch(d);before=before||await get(e,`${root}/slots/${s}`,u)
 if(part!=='index')b.set(sdk.doc(d,root,'slots',s),{...empty(),revision:before.revision+1})
 if(part!=='slot')b.delete(sdk.doc(d,root,'inviteeIndex',u))
 return b.commit()
}
function join(e,u,o,s='slot1'){return sdk.updateDoc(sdk.doc(db(e,u),root,'slots',s),{status:'member',binding:'i_'+u,joinedOccurrence:o,updatedAt:sdk.serverTimestamp()})}
async function snapshot(e){let value;await e.withSecurityRulesDisabled(async c=>{value={};for(const name of ['slots','inviteeIndex','invitationOccurrences']){value[name]=(await sdk.getDocs(sdk.collection(c.firestore(),root,name))).docs.map(d=>[d.id,d.data()])}});return value}
test('C expansion: release/reassignment ordered gates',async t=>{
 fs.writeFileSync('.tools/slot-expansion.rules',rules)
 const e=await h.initialize(rules)
 const reset=async()=>{await e.clearFirestore();await h.seed(e,inputs('inverse'));await create(e);await invite(e,'slot1','one',X,'cycle_unique_0001')}
 try{
  await reset()
  const history=await get(e,`${root}/invitationOccurrences/${X}`,'one'),notice=await get(e,`users/one/activityInbox/sp_${P}_${X}`,'one')
  for(const part of ['slot','index']){
   const before=await snapshot(e)
   await rejected(t,'partial release '+part,()=>release(e,'one','slot1',null,part))
   assert.deepEqual(await snapshot(e),before)
  }
  await release(e,'one');assert.equal((await get(e,`${root}/slots/slot1`)).revision,2)
  assert.equal(await get(e,`${root}/inviteeIndex/one`),undefined)
  await invite(e,'slot1','two',Y,'cycle_unique_0002')
  await rejected(t,'stale JOIN A after B',()=>join(e,'one',X))
  await join(e,'two',Y)
  await release(e,'two')
  await invite(e,'slot1','three','occurrence000003','cycle_unique_0003')
  await join(e,'three','occurrence000003')
  assert.equal((await get(e,`${root}/slots/slot1`)).revision,5)
  assert.deepEqual(await get(e,`${root}/invitationOccurrences/${X}`,'one'),history)
  assert.deepEqual(await get(e,`users/one/activityInbox/sp_${P}_${X}`,'one'),notice)
  t.diagnostic('A -> release -> B -> JOIN -> release -> C -> JOIN PASS; immutable history preserved')
  // Each contender uses an explicitly captured state. No retry of rejected writes.
  for(const race of ['join','reinvite','acquire','duplicate','last-slot']){
   await reset()
   if(race==='reinvite')await refriend(e)
   if(race==='last-slot')await release(e,'one')
   const before=await get(e,`${root}/slots/slot1`)
   const a=race==='last-slot'?()=>invite(e,'slot1','two',Y,'cycle_unique_0002','owner',{before}):()=>release(e,'one','slot1',before)
   const b={join:()=>join(e,'one',X),reinvite:()=>invite(e,'slot1','one',Y,'cycle_refriend_0001','owner',{before}),acquire:()=>invite(e,'slot1','two',Y,'cycle_unique_0002','owner',{before}),duplicate:()=>release(e,'one','slot1',before),'last-slot':()=>invite(e,'slot1','three','occurrence000003','cycle_unique_0003','owner',{before})}[race]
   const results=await Promise.allSettled([a(),b()])
   assert.ok(results.some(x=>x.status==='fulfilled'))
   for(const x of results.filter(x=>x.status==='rejected')){assert.equal(x.reason.code,'permission-denied');assert.doesNotMatch(x.reason.message,/1000 expressions|Service call error/)}
   if(['duplicate','last-slot','reinvite','acquire'].includes(race))assert.equal(results.filter(x=>x.status==='fulfilled').length,1)
   const state=await snapshot(e),slot=state.slots.find(([id])=>id==='slot1')[1]
   assert.equal(state.inviteeIndex.length,slot.status==='empty'?0:1)
   if(slot.status!=='empty')assert.equal(state.inviteeIndex[0][0],slot.uid)
   t.diagnostic(JSON.stringify({race,outcomes:results.map(x=>x.status),occupant:slot.uid}))
  }
  await reset();const stale=await get(e,`${root}/slots/slot1`)
  await release(e,'one');await invite(e,'slot1','two',Y,'cycle_unique_0002')
  await rejected(t,'stale restore A',()=>invite(e,'slot1','one','occurrence000004','cycle_unique_0001','owner',{before:stale}))
  // Valid-path feasibility gate: first failure is a STOP, never an expected denial.
  await e.clearFirestore();await h.seed(e,inputs('inverse'));await create(e)
  for(const [i,u] of ['one','two','three','four'].entries()){
   const o='subjectocc00000'+(i+1),s='slot'+(i+1)
   await invite(e,s,u,o,'cycle_unique_000'+(i+1));await join(e,u,o,s)
  }
  async function save(n){const d=db(e,'owner'),b=sdk.writeBatch(d),code='SUB'+n
   b.set(sdk.doc(d,root,'subjects',code),{code,proposedParticipantIds:['owner','one','two','three','four'].slice(0,n),addedByUid:'owner',createdAt:sdk.serverTimestamp(),updatedAt:sdk.serverTimestamp()})
   b.set(sdk.doc(d,root,'subjectChecks',code),{revision:1,actorUid:'owner',updatedAt:sdk.serverTimestamp()})
   return b.commit()
  }
  await rejected(t,'one subject participant is invalid',()=>save(1))
  for(let n=2;n<=5;n++){
   try{await save(n);t.diagnostic(`subject+check ${n} participants PASS`)}
   catch(error){t.diagnostic(JSON.stringify({STOP:'valid subject+check failed',participants:n,code:error.code,expressions:/1000 expressions/.test(error.message),access:/Service call error/.test(error.message),message:error.message}));throw error}
  }
 }finally{await e.cleanup()}
})
test('C expansion: independent valid subject cardinality gate',async t=>{
 const e=await h.initialize(rules)
 try{
  await e.clearFirestore();await h.seed(e,inputs('inverse'));await create(e)
  for(const [i,u] of ['one','two','three','four'].entries()){
   const o='subjectocc00000'+(i+1),s='slot'+(i+1)
   await invite(e,s,u,o,'cycle_unique_000'+(i+1));await join(e,u,o,s)
  }
  for(let n=2;n<=5;n++){
   const d=db(e,'owner'),b=sdk.writeBatch(d),code='VALID'+n
   b.set(sdk.doc(d,root,'subjects',code),{code,proposedParticipantIds:['owner','one','two','three','four'].slice(0,n),addedByUid:'owner',createdAt:sdk.serverTimestamp(),updatedAt:sdk.serverTimestamp()})
   b.set(sdk.doc(d,root,'subjectChecks',code),{revision:1,actorUid:'owner',updatedAt:sdk.serverTimestamp()})
   try{await b.commit();t.diagnostic(`VALID ${n} participants PASS`)}
   catch(error){
    await e.withSecurityRulesDisabled(async c=>{for(const name of ['subjects','subjectChecks'])assert.equal((await sdk.getDoc(sdk.doc(c.firestore(),root,name,code))).exists(),false)})
    t.diagnostic(JSON.stringify({STOP:'valid subject+check failed',participants:n,expressions:/1000 expressions/.test(error.message),access:/Service call error/.test(error.message),message:error.message}));throw error
   }
  }
 }finally{await e.cleanup()}
})
