const {test}=require('node:test'),assert=require('node:assert/strict'),sdk=require('firebase/firestore')
const h=require('./helpers.cjs'),{S,T,fixture,values}=require('../joint-plan-migration-harness.cjs')
const {planMigrator}=require('../../scripts/multicareer-joint-plan-migration.cjs')
const {jointPlanEmulator}=require('../../scripts/joint-plan-emulator.cjs')
const {load}=require('../joint-c-invite-harness.cjs')
const resource=/1000\s+expressions|service[ -]call|resource[ -]exhaust|maximum.*calls/i
test('S4 product protected migration and publication',async t=>{
 const e=await h.initialize(),evidence=[];let fatal=null
 const db=u=>e.authenticatedContext(u,h.claims(u)).firestore()
 const api=u=>load(sdk,{currentUser:{uid:u}},db(u))
 const migrator=()=>planMigrator(jointPlanEmulator({host:'127.0.0.1:8088',projectId:'demo-correlativas-rules'}),{catalogIds:['catalog']})
 async function read(p){let d;await e.withSecurityRulesDisabled(async c=>{d=(await sdk.getDocFromServer(sdk.doc(c.firestore(),p))).data()});return d}
 async function reset(){await e.clearFirestore();await h.seed(e,values(fixture(),sdk))}
 async function valid(name,fn){try{const v=await fn();evidence.push({name,status:'PASS'});return v}catch(x){fatal={name,message:x.message,resource:resource.test(x.message)};throw x}}
 async function deny(name,fn){let x;try{await fn()}catch(err){x=err}assert.ok(x,'unexpected ALLOW '+name);assert.equal(x.code,'permission-denied');evidence.push({name,status:resource.test(x.message)?'RESOURCE BLOCKED':'LOGICAL DENY',message:x.message})}
 async function run(name,fn){if(fatal)return;await t.test(name,async()=>{await reset();await fn()})}
 try{
  await run('legacy name preserved through publication; rename survives migration rerun',async()=>{
   await h.seed(e,{['jointPlans/'+S]:{...await read('jointPlans/'+S),name:'  Historia  '}})
   assert.equal((await valid('named migration',()=>migrator().run(S,T))).state,'active')
   assert.equal((await read('jointPlans/'+T)).name,'  Historia  ')
   await valid('imported RENAME',()=>api('alice').renameJointCPlan('alice',T,'Actual'))
   await valid('rerun after rename',()=>migrator().run(S,T))
   assert.equal((await read('jointPlans/'+T)).name,'Actual')
   assert.equal((await read('jointPlans/'+S)).name,'  Historia  ')
  })
  await run('freeze/staging/publication, persistent resume and imported membership',async()=>{
   const m=migrator();assert.equal((await valid('freeze',()=>m.step(S,T,'FREEZE'))).state,'frozen')
   assert.equal((await valid('construct',()=>m.step(S,T,'CONSTRUCT'))).state,'staged')
   await deny('staged read',()=>api('alice').readJointCPlan('alice',T))
   await deny('client publish',()=>sdk.updateDoc(sdk.doc(db('alice'),'jointPlanControls',T),{state:'active'}))
   const source=await read('jointPlans/'+S)
   assert.equal((await valid('publish resumed',()=>migrator().step(S,T,'PUBLISH'))).state,'active')
   assert.equal((await read('jointPlanLegacyControls/'+S)).state,'retired')
   const plan=await valid('imported owner read',()=>api('alice').readJointCPlan('alice',T));assert.equal(plan.plan.origin,'migrated')
   const member=await valid('imported member read',()=>api('bob').readJointCSlot('bob',T,'slot1'))
   assert.equal(member.slot.cycle,null);assert.equal(member.slot.invitedBy,null);assert.match(member.slot.occurrence,/^import_/)
   assert.equal(member.slot.importId,undefined);assert.equal(await read('friendships/alice:bob'),undefined)
   assert.equal(await read(`jointPlans/${T}/invitationOccurrences/${member.slot.occurrence}`),undefined)
   assert.equal(await read(`users/carol/jointPlanRefs/${T}`),undefined)
   await deny('pending legacy direct JOIN',()=>sdk.updateDoc(sdk.doc(db('carol'),`jointPlans/${T}/slots/slot2`),{status:'member',uid:'carol',binding:'i_carol',joinedOccurrence:'invented00000001'}))
   const own={slotId:'slot1',instanceId:'i_bob',occurrence:member.slot.occurrence,slotRevision:1}
   await valid('imported subject',()=>api('bob').ensureJointCSubjectBase('bob',T,'A',own))
   // db() creates a context per call; batch and refs must share this exact client.
   const releaseDb=db('bob'),batch=sdk.writeBatch(releaseDb)
   batch.update(sdk.doc(releaseDb,`jointPlans/${T}/slots/slot1`),{status:'empty',uid:null,revision:2,occurrence:null,cycle:null,invitedBy:null,binding:null,joinedOccurrence:null,updatedAt:sdk.serverTimestamp()})
   batch.delete(sdk.doc(releaseDb,`jointPlans/${T}/inviteeIndex/bob`));await valid('imported RELEASE',()=>batch.commit())
   const released=await read(`jointPlans/${T}/slots/slot1`);await valid('rerun after RELEASE',()=>migrator().run(S,T))
   assert.deepEqual(await read(`jointPlans/${T}/slots/slot1`),released);assert.deepEqual(await read('jointPlans/'+S),source)
   await deny('stale imported member',()=>sdk.updateDoc(sdk.doc(db('bob'),`jointPlans/${T}/slots/slot1`),{status:'member',uid:'bob',binding:'i_bob',occurrence:own.occurrence,joinedOccurrence:own.occurrence}))
  })
  await run('legacy mutation allowed before freeze, denied afterwards independently of user authority',async()=>{
   const d=fixture();for(const u of ['alice','bob'])d[`migrationUsers/${u}`]={...d[`migrationUsers/${u}`],authority:'legacy',phase:'pending'}
   await h.seed(e,values(d,sdk))
   const rename=()=>sdk.updateDoc(sdk.doc(db('alice'),'jointPlans',S),{name:'Before freeze',updatedAt:sdk.serverTimestamp()})
   await valid('legacy rename before',rename);await valid('freeze',()=>migrator().step(S,T,'FREEZE'))
   await deny('legacy rename after',rename)
   await deny('legacy JOIN after freeze',()=>sdk.updateDoc(sdk.doc(db('carol'),'jointPlans',S),{memberIds:['alice','bob','carol'],updatedAt:sdk.serverTimestamp()}))
   assert.ok((await sdk.getDocFromServer(sdk.doc(db('alice'),'jointPlans',S))).exists())
  })
  for(const [name,mutate]of [
   ['unresolved',d=>delete d['users/bob/careerInstances/i_bob']],
   ['unknown',d=>d['jointPlans/'+S].careerId='unknown'],
   ['overcapacity',d=>d['jointPlans/'+S].inviteeIds.push('d','e','f')],
   ['corrupt',d=>d['jointPlans/'+S].memberIds.push('nobody')],
  ])await run(name+' blocks without fabrication',async()=>{const d=fixture();mutate(d);await e.clearFirestore();await h.seed(e,values(d,sdk));const r=await migrator().run(S,T);assert.equal(r.state,'blocked');assert.equal(await read('jointPlans/'+T),undefined)})
  await run('publication rejects actual missing binding and target tampering',async()=>{
   const m=migrator();await m.step(S,T,'FREEZE');await m.step(S,T,'CONSTRUCT')
   await e.withSecurityRulesDisabled(c=>sdk.deleteDoc(sdk.doc(c.firestore(),'users/bob/careerInstances/i_bob')))
   assert.equal((await m.step(S,T,'PUBLISH')).state,'blocked');assert.equal((await read('jointPlanControls/'+T)).state,'staged')
   await h.seed(e,values({'users/bob/careerInstances/i_bob':fixture()['users/bob/careerInstances/i_bob']},sdk))
   await h.seed(e,{[`jointPlans/${T}/inviteeIndex/bob`]:{slotId:'slot4'}})
   assert.equal((await m.step(S,T,'PUBLISH')).state,'blocked')
  })
  await run('controls private and history-only source never publishes',async()=>{
   const d=fixture();d['jointPlans/'+S].closed=true;await h.seed(e,values(d,sdk))
   assert.equal((await migrator().run(S,T)).state,'history-only');assert.equal(await read('jointPlans/'+T),undefined)
   for(const p of ['jointPlanControls/'+T,'jointPlanLegacyControls/'+S]){
    await deny('control GET',()=>sdk.getDoc(sdk.doc(db('alice'),p)))
    await deny('control UPDATE',()=>sdk.updateDoc(sdk.doc(db('alice'),p),{state:'active'}))
   }
  })
  await run('delete published C never reactivates source or rebuilds target on rerun',async()=>{
   assert.equal((await valid('publish',()=>migrator().run(S,T))).state,'active')
   await valid('delete migrated C',()=>api('alice').deleteJointCPlan('alice',T))
   const terminal=await read('jointPlans/'+T)
   await valid('migration rerun after terminal',()=>migrator().run(S,T))
   assert.deepEqual(await read('jointPlans/'+T),terminal)
   assert.equal((await read('jointPlanLegacyControls/'+S)).state,'retired')
   assert.ok(await read('jointPlanTombstones/'+T))
   await deny('source after C delete',()=>sdk.updateDoc(sdk.doc(db('alice'),'jointPlans',S),{closed:false,updatedAt:sdk.serverTimestamp()}))
   await deny('deleted imported plan',()=>api('bob').readJointCPlan('bob',T))
  })
 }finally{t.diagnostic(JSON.stringify({evidence,validPathFailure:fatal}));await e.cleanup()}
})
