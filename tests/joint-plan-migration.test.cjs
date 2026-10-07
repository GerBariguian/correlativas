const {test}=require('node:test'),assert=require('node:assert/strict')
const {planMigrator}=require('../scripts/multicareer-joint-plan-migration.cjs')
const {jointPlanEmulator}=require('../scripts/joint-plan-emulator.cjs')
const {S,T,fixture,memory}=require('./joint-plan-migration-harness.cjs')
const setup=d=>{const a=memory(d);return {a,m:planMigrator(a,{catalogIds:['catalog']})}}
test('S4 preserves exact legacy name; absence remains absent; invalid name blocks',async()=>{
 for(const name of [undefined,'  Historia válida  ']){
  const d=fixture();if(name===undefined)delete d[`jointPlans/${S}`].name;else d[`jointPlans/${S}`].name=name
  const {a,m}=setup(d);assert.equal((await m.run(S,T)).state,'active')
  assert.equal(a.docs[`jointPlans/${T}`].name,name)
  const before=structuredClone(a.docs);await m.run(S,T);assert.deepEqual(a.docs,before)
 }
 const d=fixture();d[`jointPlans/${S}`].name='\n';const {m}=setup(d)
 assert.equal((await m.run(S,T)).state,'blocked')
})
test('S4 construct/publish/rerun; source history and pending retained without fabricated cycle',async()=>{
 const {a,m}=setup();const source=structuredClone(a.docs[`jointPlans/${S}`])
 assert.equal((await m.step(S,T,'FREEZE')).state,'frozen')
 assert.equal((await m.step(S,T,'CONSTRUCT')).state,'staged')
 assert.equal(a.docs[`jointPlanLegacyControls/${S}`].state,'frozen')
 assert.equal(a.docs[`jointPlans/${T}/slots/slot1`].cycle,null)
 assert.equal(a.docs[`jointPlans/${T}/slots/slot1`].importId,undefined)
 assert.equal(a.docs[`users/carol/jointPlanRefs/${T}`],undefined)
 assert.equal((await m.step(S,T,'PUBLISH')).state,'active')
 assert.equal(a.docs[`jointPlanLegacyControls/${S}`].state,'retired')
 assert.deepEqual(a.docs[`jointPlans/${S}`],source)
 const before=structuredClone(a.docs);await m.run(S,T);assert.deepEqual(a.docs,before)
 assert.ok(!Object.keys(a.docs).some(p=>p.startsWith('friendships/')||p.includes('/invitationOccurrences/')))
})
test('S4 resume persisted staged control with a new migrator; no overwrite after reuse/delete',async()=>{
 const {a,m}=setup();await m.step(S,T,'FREEZE');await m.step(S,T,'CONSTRUCT')
 const resumed=planMigrator(a,{catalogIds:['catalog']});await resumed.run(S,T)
 a.docs[`jointPlans/${T}/slots/slot1`].uid='carol';a.docs[`jointPlans/${T}`].deleting=true
 const before=structuredClone(a.docs);await resumed.run(S,T);assert.deepEqual(a.docs,before)
})
for(const [name,change,code]of [
 ['unknown',d=>d[`jointPlans/${S}`].careerId='unknown','CATALOG_UNAVAILABLE'],
 ['capacity',d=>d[`jointPlans/${S}`].inviteeIds.push('d','e','f'),'OVERCAPACITY'],
 ['corrupt',d=>d[`jointPlans/${S}`].memberIds.push('outsider'),'CORRUPT_SOURCE'],
 ['unresolved',d=>delete d['users/bob/careerInstances/i_bob'],'UNRESOLVED_BINDING:bob'],
 ['missing index',d=>delete d['users/alice/catalogMemberships/catalog'],'UNRESOLVED_BINDING:alice'],
 ['invalid authority',d=>d['migrationUsers/bob'].authority='frozen','UNRESOLVED_CONTROL:bob'],
])test('S4 blocks '+name,async()=>{const d=fixture();change(d);const {a,m}=setup(d);const r=await m.run(S,T);assert.equal(r.state,'blocked');assert.ok(r.errors.includes(code));assert.equal(a.docs[`jointPlans/${T}`],undefined)})
for(const field of ['closed','deleting'])test('S4 '+field+' history only',async()=>{const d=fixture();d[`jointPlans/${S}`].closed=true;d[`jointPlans/${S}`][field]=true;const {a,m}=setup(d);assert.equal((await m.run(S,T)).state,'history-only');assert.equal(a.docs[`jointPlans/${T}`],undefined)})
test('S4 staged mismatch and binding changes block publication',async()=>{
 for(const mutate of [d=>d[`jointPlans/${T}/slots/slot1`].binding='other',d=>d['users/bob/catalogMemberships/catalog'].careerInstanceId='missing']){
  const {a,m}=setup();await m.step(S,T,'FREEZE');await m.step(S,T,'CONSTRUCT');mutate(a.docs)
  assert.equal((await m.step(S,T,'PUBLISH')).state,'blocked');assert.equal(a.docs[`jointPlanControls/${T}`].state,'staged')
 }
})
test('S4 mapping conflict/source drift/tombstone fail closed',async()=>{
 const {a,m}=setup();await m.step(S,T,'FREEZE')
 await assert.rejects(m.step(S,'differentPlan001','FREEZE'),/MAPPING_CONFLICT/)
 a.docs[`jointPlans/${S}`].name='changed';await assert.rejects(m.step(S,T,'CONSTRUCT'),/FROZEN_SOURCE_CHANGED/)
 const other=setup();other.a.docs[`jointPlanTombstones/${T}`]={deletedAt:{seconds:1,nanoseconds:0}};await assert.rejects(other.m.run(S,T),/TOMBSTONED/)
})
test('S4 transport refuses production and credentials without any I/O',()=>{
 for(const args of [{},{host:'firestore.googleapis.com',projectId:'real'},
  {host:'127.0.0.1:8088',projectId:'demo-correlativas-rules',environment:{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8088',FIREBASE_TOKEN:'x'}}])assert.throws(()=>jointPlanEmulator(args),/UNSAFE/)
})

test('S4 v2 keeps explicit bindings; mismatched v2 binding blocks',async()=>{
 const d=fixture(),p=d[`jointPlans/${S}`];p.schemaVersion=2;p.catalogId=p.careerId;delete p.careerId
 p.participants=Object.fromEntries(p.memberIds.map(uid=>[uid,{bindingState:'resolved',careerInstanceId:'i_'+uid}]))
 const good=setup(d);assert.equal((await good.m.run(S,T)).state,'active')
 p.participants.bob.careerInstanceId='different';const bad=setup(d)
 assert.equal((await bad.m.run(S,T)).state,'blocked');assert.equal(bad.a.docs[`jointPlans/${T}`],undefined)
})

test('S4 archived binding remains historical; migration never restores it',async()=>{
 const d=fixture();d['users/bob/careerInstances/i_bob'].lifecycle='archived'
 const {a,m}=setup(d);assert.equal((await m.run(S,T)).state,'active')
 assert.deepEqual(a.docs['users/bob/careerInstances/i_bob'],d['users/bob/careerInstances/i_bob'])
})
