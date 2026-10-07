const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {integrated}=require('./fixtures/integrated-plan.cjs')
let source=fs.readFileSync('tests/rules/discovery-ref.test.cjs','utf8').split("test('discovery refs ordered")[0]
const {sdk,h,db,inputs,invite,P,X,root}=new Function('require',source+';return {sdk,h,db,inputs,invite,P,X,root}')(require)
const LEG='jointPlans/legacySource',CTL=`prototypePlanControls/${P}`,IMP='import_importedmember01'
const records=[]
const flush=()=>fs.writeFileSync('docs/joint-plan-integrated-prototype-evidence.json',JSON.stringify({experimental:true,records},null,2)+'\n')
test('integrated protected construction, cutover and deletion',async t=>{
 const rules=integrated(fs.readFileSync('firestore.rules','utf8'));fs.writeFileSync('.tools/integrated-plan.rules',rules)
 const e=await h.initialize(rules)
 async function attempt(label,fn,negative=false){let error;try{await fn()}catch(x){error=x}
  const message=error?.message||'',category=!error?'PASS':/1000 expressions/.test(message)?'C':/Service call error|maximum.*calls/i.test(message)?'B':/evaluation error|Null value error/.test(message)?'D':error.code==='permission-denied'?'A':'D'
  records.push({label,negative,accepted:!error,category,code:error?.code||null,message});flush();t.diagnostic(JSON.stringify(records.at(-1)))
  if(negative){assert.ok(error,label);assert.equal(error.code,'permission-denied');assert.ok(!['B','C'].includes(category),label+' must not exhaust resources')}else if(error)throw error
 }
 const admin=async fn=>{let result;await e.withSecurityRulesDisabled(async c=>{result=await fn(c.firestore())});return result}
 const read=path=>admin(async d=>(await sdk.getDoc(sdk.doc(d,path))).data())
 const ref=u=>`users/${u}/jointPlanRefs/${P}`
 const empty=()=>({status:'empty',uid:null,revision:0,occurrence:null,cycle:null,invitedBy:null,binding:null,joinedOccurrence:null,updatedAt:h.TIME})
 const parent={schemaVersion:30,ownerId:'owner',ownerInstanceId:'i_owner',catalogId:'catalog',closed:false,deleting:false,createdAt:h.TIME}
 const legacy={ownerId:'owner',careerId:'catalog',memberIds:['owner','one'],inviteeIds:['one','two'],closed:false,deleting:false}
 const imported={...empty(),status:'member',uid:'one',revision:1,binding:'i_one',occurrence:IMP,joinedOccurrence:IMP}
 const ar={slotId:'slot1',instanceId:'i_one',occurrence:IMP,slotRevision:1}
 const base=(code='S')=>({schemaVersion:31,code,createdByUid:'one',createdAt:sdk.serverTimestamp(),creatorRef:ar})
 const edge=()=>({schemaVersion:31,uid:'one',targetRef:ar,state:'assigned',revision:1,createdByUid:'one',createdAt:sdk.serverTimestamp(),updatedByUid:'one',updatedAt:sdk.serverTimestamp(),actorRef:ar})
 const set=(u,path,data)=>sdk.setDoc(sdk.doc(db(e,u),path),data)
 // Protected administrative fixture constructor; no client credential/permission bypass exposed.
 async function construct(){await admin(async d=>sdk.runTransaction(d,async tx=>{
   const control=await tx.get(sdk.doc(d,CTL));if(control.exists()){assert.equal(control.data().source,LEG);assert.equal(control.data().generation,1);assert.deepEqual(control.data().imports,{one:{occupancy:IMP,slot:'slot1',binding:'i_one'}});return}
   const src=(await tx.get(sdk.doc(d,LEG))).data();assert.deepEqual(src,legacy)
   for(const u of src.memberIds){
    const instance=(await tx.get(sdk.doc(d,`users/${u}/careerInstances/i_${u}`))).data()
    const index=(await tx.get(sdk.doc(d,`users/${u}/catalogMemberships/catalog`))).data()
    const authority=(await tx.get(sdk.doc(d,`migrationUsers/${u}`))).data()
    assert.equal(instance?.catalogId,'catalog');assert.equal(index?.careerInstanceId,'i_'+u)
    assert.equal(authority?.authority,'instances');assert.equal(authority?.phase,'complete')
   }
   tx.set(sdk.doc(d,CTL),{state:'staged',source:LEG,generation:1,unresolved:[],imports:{one:{occupancy:IMP,slot:'slot1',binding:'i_one'}}})
   tx.set(sdk.doc(d,'prototypeLegacyControls/legacySource'),{state:'frozen',target:P})
   tx.set(sdk.doc(d,root),parent)
   for(let n=1;n<=4;n++)tx.set(sdk.doc(d,root,'slots','slot'+n),n===1?imported:empty())
   tx.set(sdk.doc(d,root,'inviteeIndex','one'),{slotId:'slot1'})
   for(const u of ['owner','one'])tx.set(sdk.doc(d,ref(u)),{schemaVersion:1,createdAt:h.TIME})
 }))}
 async function publish(){return admin(async d=>sdk.runTransaction(d,async tx=>{
   const get=async path=>(await tx.get(sdk.doc(d,path))).data()
   const c=await get(CTL),p=await get(root),l=await get(LEG),lc=await get('prototypeLegacyControls/legacySource')
   assert.equal(c.state,'staged');assert.equal(lc.state,'frozen');assert.deepEqual(l,legacy);assert.deepEqual(p,parent);assert.deepEqual(c.unresolved,[])
   for(const u of l.memberIds){const i=await get(`users/${u}/careerInstances/i_${u}`),a=await get(`migrationUsers/${u}`),ix=await get(`users/${u}/catalogMemberships/catalog`)
    assert.equal(i.catalogId,p.catalogId);assert.ok(['active','archived'].includes(i.lifecycle));assert.equal(a.authority,'instances');assert.equal(a.phase,'complete');assert.equal(ix.careerInstanceId,'i_'+u);assert.ok(await get(ref(u)))
   }
   for(let n=1;n<=4;n++)assert.deepEqual(await get(`${root}/slots/slot${n}`),n===1?imported:empty())
   assert.deepEqual(await get(`${root}/inviteeIndex/one`),{slotId:'slot1'})
   assert.equal(await get(`jointPlanTombstones/${P}`),undefined)
   tx.update(sdk.doc(d,CTL),{state:'active'});tx.update(sdk.doc(d,'prototypeLegacyControls/legacySource'),{state:'retired'})
 }))}
 const ownerBase=code=>({...base(code),createdByUid:'owner',creatorRef:{slotId:'owner',instanceId:'i_owner',occurrence:'owner',slotRevision:0}})
 const remove=(u,extra=false)=>{const d=db(e,u),b=sdk.writeBatch(d);b.update(sdk.doc(d,root),{closed:true,deleting:true});b.set(sdk.doc(d,'jointPlanTombstones',P),{deletedAt:sdk.serverTimestamp()});if(extra)b.set(sdk.doc(d,root,'subjects','EXTRA'),ownerBase('EXTRA'));return b.commit()}
 const oldJoin=()=>sdk.updateDoc(sdk.doc(db(e,'two'),LEG),{memberIds:['owner','one','two'],updatedAt:sdk.serverTimestamp()})
 try{
  await e.clearFirestore();const data=inputs('inverse');delete data['friendships/one:owner'];delete data['usedFriendshipCycles/cycle_unique_0001'];await h.seed(e,{...data,[LEG]:legacy})
  await h.seed(e,{'prototypeLegacyControls/legacySource':{state:'open'},'users/two':{...data['users/two'],activeCareerId:'catalog'}})
  await attempt('legacy JOIN before freeze control',oldJoin)
  await h.seed(e,{[LEG]:legacy}) // Independent frozen inventory, not client rollback.
  await h.seed(e,{'users/owner/catalogMemberships/catalog':{schemaVersion:1,careerInstanceId:'wrong'}})
  await assert.rejects(construct);assert.equal(await read(root),undefined);records.push({label:'invalid owner binding blocks construction before writes',category:'PASS',layer:'administrative validator'});flush()
  await h.seed(e,{'users/owner/catalogMemberships/catalog':data['users/owner/catalogMemberships/catalog']})
  await attempt('protected construction',construct)
  await attempt('same legacy JOIN after freeze',oldJoin,true)
  const before=await read(root);await attempt('rerun same generation',construct);assert.deepEqual(await read(root),before);assert.equal(await read(`${root}/invitationOccurrences/${IMP}`),undefined)
  await attempt('staged member source read',()=>sdk.getDoc(sdk.doc(db(e,'one'),root)),true)
  await attempt('staged subject write',()=>set('one',`${root}/subjects/S`,base()),true)
  await attempt('staged NEW direct batch',()=>invite(e,'slot2','two',X,'cycle_unique_0002','owner',{before:empty()}),true)
  await attempt('staged JOIN direct write',()=>sdk.updateDoc(sdk.doc(db(e,'two'),root,'slots','slot2'),{status:'member',binding:'i_two',joinedOccurrence:X,updatedAt:sdk.serverTimestamp()}),true)
  await attempt('staged edge direct write',()=>set('one',`${root}/subjects/S/memberEdges/one:${IMP}`,edge()),true)
  await attempt('client publication',()=>sdk.updateDoc(sdk.doc(db(e,'owner'),CTL),{state:'active'}),true)
  const staged=await read(CTL)
  await h.seed(e,{[CTL]:{...staged,unresolved:['three']}})
  await assert.rejects(publish);records.push({label:'unresolved publication blocked by protected validator',category:'PASS',layer:'administrative validator'});flush();assert.equal((await read(CTL)).state,'staged')
  await h.seed(e,{[CTL]:staged})
  const goodBinding=await read('users/one/careerInstances/i_one')
  await admin(d=>sdk.deleteDoc(sdk.doc(d,'users/one/careerInstances/i_one')))
  await assert.rejects(publish);assert.equal((await read(CTL)).state,'staged');records.push({label:'actual joined member missing binding blocks publication',category:'PASS',layer:'administrative validator'});flush()
  await h.seed(e,{'users/one/careerInstances/i_one':goodBinding})
  await attempt('protected publication',publish)
  await attempt('imported member source access without friendship',()=>sdk.getDoc(sdk.doc(db(e,'one'),root)))
  await attempt('imported member subject',()=>set('one',`${root}/subjects/S`,base()))
  await attempt('imported member edge',()=>set('one',`${root}/subjects/S/memberEdges/one:${IMP}`,edge()))
  await attempt('legacy pending direct JOIN',()=>sdk.updateDoc(sdk.doc(db(e,'two'),root,'slots','slot2'),{status:'member',binding:'i_two',joinedOccurrence:X,updatedAt:sdk.serverTimestamp()}),true)
  for(const patch of [{memberIds:['owner','one','two']},{inviteeIds:['one','two','three']},{schemaVersion:30}])await attempt('old client source mutation '+Object.keys(patch)[0],()=>sdk.updateDoc(sdk.doc(db(e,'two'),LEG),patch),true)
  await attempt('genuine C NEW after cutover',()=>invite(e,'slot2','two',X,'cycle_unique_0002'))
  const staleTwo=await read(`${root}/slots/slot2`)
  await attempt('owner subject control without delete',()=>set('owner',`${root}/subjects/CONTROL`,ownerBase('CONTROL')))
  await attempt('parent deletion half',()=>sdk.updateDoc(sdk.doc(db(e,'owner'),root),{closed:true,deleting:true}),true)
  await attempt('tombstone deletion half',()=>set('owner',`jointPlanTombstones/${P}`,{deletedAt:sdk.serverTimestamp()}),true)
  await attempt('non-owner delete',()=>remove('one'),true)
  await attempt('delete + subject combined',()=>remove('owner',true),true);assert.equal((await read(root)).deleting,false);assert.equal(await read(`jointPlanTombstones/${P}`),undefined)
  await attempt('owner terminal + tombstone',()=>remove('owner'))
  for(const [label,fn] of [
   ['NEW direct batch',()=>invite(e,'slot3','three','newoccurrence0003','cycle_unique_0003','owner',{before:empty()})],
   ['REINVITE direct batch',()=>invite(e,'slot2','two','newoccurrence0004','cycle_unique_0002','owner',{before:staleTwo})],
   ['JOIN',()=>sdk.updateDoc(sdk.doc(db(e,'two'),root,'slots','slot2'),{status:'member',binding:'i_two',joinedOccurrence:X,updatedAt:sdk.serverTimestamp()})],
   ['subject',()=>set('one',`${root}/subjects/T`,base('T'))],
   ['edge',()=>sdk.updateDoc(sdk.doc(db(e,'one'),`${root}/subjects/S/memberEdges/one:${IMP}`),{state:'unassigned',revision:2,updatedAt:sdk.serverTimestamp()})],
   ['residual ref source',()=>sdk.getDoc(sdk.doc(db(e,'two'),root))],
   ['resurrection',()=>set('owner',root,parent)],
   ['legacy resurrection',()=>sdk.updateDoc(sdk.doc(db(e,'owner'),LEG),{closed:false})]
  ])await attempt('deleted '+label,fn,true)
  for(const path of [`${root}/slots/slot2`,`${root}/invitationOccurrences/${X}`,`${root}/subjects/S`,`${root}/subjects/S/memberEdges/one:${IMP}`,ref('two'),`users/two/activityInbox/sp_${P}_${X}`])assert.ok(await read(path))
  for(const path of [`${root}/slots/slot2`,`${root}/invitationOccurrences/${X}`,`${root}/subjects/S`,`${root}/subjects/S/memberEdges/one:${IMP}`])await attempt('residual child read '+path,()=>sdk.getDoc(sdk.doc(db(e,'two'),path)),true)
  await attempt('private residual ref still readable but not authority',()=>sdk.getDoc(sdk.doc(db(e,'two'),ref('two'))))
  await attempt('same legacy JOIN after destination deletion',oldJoin,true)
  await admin(d=>sdk.deleteDoc(sdk.doc(d,root)))
  await attempt('missing parent retained tombstone rejects recreation',()=>set('owner',root,{...parent,createdAt:sdk.serverTimestamp()}),true)
  await attempt('missing parent residual child not authority',()=>set('one',`${root}/subjects/ABSENT`,base('ABSENT')),true)
  records.push({label:'residual documents retained',category:'PASS'});flush()
  // Separate fixture: imported membership must not poison a legitimately reused slot.
  await e.clearFirestore();await h.seed(e,{...data,[LEG]:legacy});await construct();await publish()
  await set('one',`${root}/subjects/S`,base());await set('one',`${root}/subjects/S/memberEdges/one:${IMP}`,edge())
  await attempt('imported member RELEASE',async()=>{
   const d=db(e,'one'),b=sdk.writeBatch(d)
   b.set(sdk.doc(d,root,'slots','slot1'),{...imported,...empty(),revision:2,updatedAt:sdk.serverTimestamp()})
   b.delete(sdk.doc(d,root,'inviteeIndex','one'));await b.commit()
  })
  records.push({label:'released imported slot state',layer:'observation',state:await read(`${root}/slots/slot1`)});flush()
  const released=await read(`${root}/slots/slot1`);assert.deepEqual(Object.keys(released).sort(),Object.keys(empty()).sort());assert.equal(released.occurrence,null);assert.equal(released.joinedOccurrence,null)
  await attempt('import occupancy token cannot become invitation ID',()=>invite(e,'slot1','two',IMP,'cycle_unique_0002'),true)
  await attempt('NEW into released imported slot',()=>invite(e,'slot1','two',X,'cycle_unique_0002'))
  await attempt('genuine JOIN into reused slot',()=>sdk.updateDoc(sdk.doc(db(e,'two'),root,'slots','slot1'),{status:'member',binding:'i_two',joinedOccurrence:X,updatedAt:sdk.serverTimestamp()}))
  await attempt('new occupant subject with current genuine occurrence',()=>set('two',`${root}/subjects/REUSED`,{schemaVersion:31,code:'REUSED',createdByUid:'two',createdAt:sdk.serverTimestamp(),creatorRef:{slotId:'slot1',instanceId:'i_two',occurrence:X,slotRevision:3}}))
  const br={slotId:'slot1',instanceId:'i_two',occurrence:X,slotRevision:3}
  await attempt('new occupant member edge',()=>set('two',`${root}/subjects/REUSED/memberEdges/two:${X}`,{...edge(),uid:'two',actorRef:br,targetRef:br,createdByUid:'two',updatedByUid:'two'}))
  await attempt('current B cannot authorize historical A target',()=>set('two',`${root}/subjects/REUSED/memberEdges/one:${IMP}`,{...edge(),actorRef:br,createdByUid:'two',updatedByUid:'two'}),true)
  assert.equal((await read(`${root}/subjects/S/memberEdges/one:${IMP}`)).targetRef.occurrence,IMP)
  for(const [label,fn] of [
   ['JOIN',()=>sdk.updateDoc(sdk.doc(db(e,'one'),root,'slots','slot1'),{status:'member',binding:'i_one',joinedOccurrence:IMP,updatedAt:sdk.serverTimestamp()})],
   ['subject',()=>set('one',`${root}/subjects/STALE`,base('STALE'))],
   ['edge',()=>set('one',`${root}/subjects/REUSED/memberEdges/one:${IMP}`,edge())]
  ])await attempt('stale imported A '+label,fn,true)
  const current=await read(`${root}/slots/slot1`),checkpoint=await read(CTL)
  await attempt('rerun after reuse preserves B and historical provenance',async()=>{await construct();assert.deepEqual(await read(`${root}/slots/slot1`),current);assert.deepEqual(await read(CTL),checkpoint);assert.equal(current.importId,undefined);assert.equal(checkpoint.imports.one.occupancy,IMP)})
  // Composition adds the publication read. Exercise remaining slot positions and
  // non-owner NEW/Subject/edge baseline; no margin is inferred from passing.
  for(const [s,u,o,c] of [['slot2','three','integratedocc0002','cycle_unique_0003'],['slot3','four','integratedocc0003','cycle_unique_0004']])await attempt('resource baseline NEW '+s,()=>invite(e,s,u,o,c))
  await h.seed(e,{'friendships/one:two':{participants:['one','two'],senderId:'two',recipientId:'one',status:'accepted',cycleId:'currentcycle0012'},'usedFriendshipCycles/currentcycle0012':{relationshipId:'one:two',participants:['one','two']}})
  await attempt('resource baseline non-owner NEW slot4',()=>invite(e,'slot4','one','integratedocc0004','currentcycle0012','two',{noRef:true}))
  await h.seed(e,{'friendships/three:owner':{participants:['owner','three'],senderId:'owner',recipientId:'three',status:'accepted',cycleId:'currentcycle0003'},'usedFriendshipCycles/currentcycle0003':{relationshipId:'three:owner',participants:['owner','three']}})
  await attempt('resource baseline genuine REINVITE',()=>invite(e,'slot2','three','integratedrenew03','currentcycle0003'))
  await attempt('resource baseline genuine JOIN',()=>sdk.updateDoc(sdk.doc(db(e,'three'),root,'slots','slot2'),{status:'member',binding:'i_three',joinedOccurrence:'integratedrenew03',updatedAt:sdk.serverTimestamp()}))
 }finally{await e.cleanup()}
})
