const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {discoveryRefs}=require('./fixtures/discovery-ref.cjs')
let source=fs.readFileSync('tests/rules/slot-prototype.test.cjs','utf8').split("test('C ordered feasibility gates'")[0]
source=source.replace('async function create(e){','async function create(e,options={}){')
source=source.replace('await b.commit()\n}',"if(!options.noRef)b.set(sdk.doc(d,'users','owner','jointPlanRefs',P),{schemaVersion:1,createdAt:sdk.serverTimestamp()});await b.commit()\n}")
source=source.replace(" await b.commit()\n}\nasync function refriend", " if(before.status==='empty'&&!options.noRef)b.set(sdk.doc(d,'users',u,'jointPlanRefs',P),{schemaVersion:1,createdAt:sdk.serverTimestamp(),...options.refData});await b.commit()\n}\nasync function refriend")
const {sdk,h,db,inputs,root,create,invite,refriend,join,P,X,Y}=new Function('require',source+';return {sdk,h,db,inputs,root,create,invite,refriend,join,P,X,Y}')(require)
test('discovery refs ordered resource and security gates',async t=>{
 const rules=discoveryRefs(fs.readFileSync('firestore.rules','utf8')),records=[]
 fs.writeFileSync('.tools/discovery-ref.rules',rules)
 let e=await h.initialize(rules)
 const ref=u=>`users/${u}/jointPlanRefs/${P}`
 const payload=()=>({schemaVersion:1,createdAt:sdk.serverTimestamp()})
 const flush=()=>fs.writeFileSync('.tools/discovery-ref-evidence.json',JSON.stringify(records,null,2)+'\n')
 async function attempt(label,fn,negative=false){let error;try{await fn()}catch(x){error=x}
  const message=error?.message||'',record={label,negative,accepted:!error,code:error?.code||null,expressions:/1000 expressions/.test(message),service:/Service call error/.test(message),message}
  record.category=!error?'PASS':record.expressions?'C':record.service?'B':/evaluation error|Null value error/.test(message)?'D':'A'
  records.push(record);flush();t.diagnostic(JSON.stringify(record))
  if(negative){assert.ok(error,label);assert.equal(error.code,'permission-denied')}else if(error)throw error
 }
 async function read(path){let v;await e.withSecurityRulesDisabled(async c=>{v=(await sdk.getDoc(sdk.doc(c.firestore(),path))).data()});return v}
 async function reset(){await e.clearFirestore();await h.seed(e,inputs('inverse'))}
 async function list(u,actor=u){return sdk.getDocs(sdk.collection(db(e,actor),'users',u,'jointPlanRefs'))}
 try{
  await reset()
  await attempt('CREATE + owner ref',()=>create(e))
  assert.ok(await read(root));for(let n=1;n<=4;n++)assert.ok(await read(`${root}/slots/slot${n}`));assert.ok(await read(ref('owner')))
  for(const [i,u] of ['one','two','three','four'].entries()){
   await attempt('NEW #'+(i+1)+' + recipient ref',()=>invite(e,'slot'+(i+1),u,i===0?X:'discoveryocc000'+(i+1),'cycle_unique_000'+(i+1)))
   assert.ok(await read(ref(u)));assert.ok(await read(`${root}/inviteeIndex/${u}`));assert.ok(await read(`${root}/invitationOccurrences/${i===0?X:'discoveryocc000'+(i+1)}`))
  }
  const one=await read(ref('one'))
  await attempt('owner lists own refs',async()=>assert.equal((await list('owner')).size,1))
  await attempt('recipient lists own refs',async()=>assert.equal((await list('one')).size,1))
  await attempt('owner reads own ref',()=>sdk.getDoc(sdk.doc(db(e,'owner'),ref('owner'))))
  await attempt('recipient reads own ref',()=>sdk.getDoc(sdk.doc(db(e,'one'),ref('one'))))
  await attempt('foreign list',()=>list('one','two'),true)
  await attempt('foreign get',()=>sdk.getDoc(sdk.doc(db(e,'two'),ref('one'))),true)
  await attempt('authorized source read',()=>sdk.getDoc(sdk.doc(db(e,'one'),root)))
  await attempt('REINVITE C2 retains ref',async()=>{await refriend(e);await invite(e,'slot1','one',Y,'cycle_refriend_0001')})
  assert.deepEqual(await read(ref('one')),one)
  await attempt('stale cycle reinvite despite ref',()=>invite(e,'slot1','one','stalediscovery01','cycle_unique_0001'),true)
  await attempt('stale JOIN despite ref',()=>join(e,X),true)
  await attempt('JOIN without ref write',()=>join(e,Y));assert.deepEqual(await read(ref('one')),one)
  const instance=await read('users/one/careerInstances/i_one')
  await h.seed(e,{'users/one/careerInstances/i_one':{...instance,sharing:{enabled:false,consentVersion:2,epoch:1,updatedAt:instance.updatedAt}}})
  for(const state of ['archived','active']){
   const old=await read('users/one/careerInstances/i_one')
   await attempt(state+' without ref write',()=>sdk.updateDoc(sdk.doc(db(e,'one'),'users/one/careerInstances/i_one'),{lifecycle:state,archivedAt:state==='archived'?sdk.serverTimestamp():null,updatedAt:sdk.serverTimestamp(),...(state==='archived'?{sharing:{...old.sharing,epoch:old.sharing.epoch+1,updatedAt:sdk.serverTimestamp()}}:{})}))
   assert.deepEqual(await read(ref('one')),one);assert.equal((await list('one')).size,1)
   assert.equal((await read('users/one/careerInstances/i_one')).sharing.enabled,false)
   const actorRef={slotId:'slot1',instanceId:'i_one',occurrence:Y,slotRevision:2}
   await attempt(state+' source controls subject creation',()=>sdk.setDoc(sdk.doc(db(e,'one'),root,'subjects','LIFECYCLE'),{schemaVersion:31,code:'LIFECYCLE',createdByUid:'one',createdAt:sdk.serverTimestamp(),creatorRef:actorRef}),state==='archived')
  }
  await attempt('read/delete Activity independent',async()=>{const p=`users/one/activityInbox/sp_${P}_${Y}`;await sdk.updateDoc(sdk.doc(db(e,'one'),p),{readAt:sdk.serverTimestamp()});await sdk.deleteDoc(sdk.doc(db(e,'one'),p))})
  assert.deepEqual(await read(ref('one')),one)
  await attempt('release leaves residual ref',async()=>{const d=db(e,'one'),b=sdk.writeBatch(d),old=await read(`${root}/slots/slot1`);b.set(sdk.doc(d,root,'slots','slot1'),{status:'empty',uid:null,revision:old.revision+1,occurrence:null,cycle:null,invitedBy:null,binding:null,joinedOccurrence:null,updatedAt:sdk.serverTimestamp()});b.delete(sdk.doc(d,root,'inviteeIndex','one'));await b.commit()})
  assert.deepEqual(await read(ref('one')),one);assert.equal((await list('one')).size,1)
  await attempt('residual ref not source access',()=>sdk.getDoc(sdk.doc(db(e,'one'),root)),true)
  await attempt('residual ref not JOIN',()=>join(e,Y),true)
  await attempt('residual ref not Subjects read',()=>sdk.getDoc(sdk.doc(db(e,'one'),root,'subjects','LIFECYCLE')),true)
  await attempt('NEW returning UID preserves immutable ref',()=>invite(e,'slot1','one','returnrefoccur01','cycle_refriend_0001','owner',{noRef:true}))
  assert.deepEqual(await read(ref('one')),one)
  await attempt('close no ref fanout',()=>sdk.updateDoc(sdk.doc(db(e,'owner'),root),{closed:true}))
  assert.deepEqual(await read(ref('one')),one)
  await attempt('ref update',()=>sdk.updateDoc(sdk.doc(db(e,'one'),ref('one')),{planId:'arbitrary'}),true)
  await attempt('ref delete',()=>sdk.deleteDoc(sdk.doc(db(e,'one'),ref('one'))),true)
  await attempt('unrelated uid ref',()=>sdk.setDoc(sdk.doc(db(e,'outsider'),ref('outsider')),payload()),true)
  await attempt('foreign uid ref write',()=>sdk.setDoc(sdk.doc(db(e,'one'),ref('outsider')),payload()),true)
  await attempt('ref nonexistent plan',()=>sdk.setDoc(sdk.doc(db(e,'one'),'users/one/jointPlanRefs/missing'),payload()),true)
  await h.seed(e,{'jointPlans/legacy':{ownerId:'one',inviteeIds:[],memberIds:['one']}})
  await attempt('ref legacy',()=>sdk.setDoc(sdk.doc(db(e,'one'),'users/one/jointPlanRefs/legacy'),payload()),true)
  await reset()
  await attempt('plan without owner ref',()=>create(e,{noRef:true}),true);assert.equal(await read(root),undefined);assert.equal(await read(`${root}/slots/slot1`),undefined)
  await attempt('ref without plan',()=>sdk.setDoc(sdk.doc(db(e,'owner'),ref('owner')),payload()),true)
  for(const data of [{...payload(),schemaVersion:99},{...payload(),planId:'spoof'},{...payload(),createdAt:'client-time'}]){
   await attempt('malformed standalone ref '+Object.keys(data).join(','),()=>sdk.setDoc(sdk.doc(db(e,'owner'),ref('owner')),data),true)
  }
  await create(e)
  await attempt('replay CREATE',()=>create(e),true)
  for(const options of [{noRef:true},{noActivity:true},{noSlot:true},{noIndex:true},{noOccurrence:true},{refData:{schemaVersion:99}},{refData:{planId:'spoof'}},{refData:{createdAt:'client-time'}}]){
   await attempt('NEW omission '+Object.keys(options)[0],()=>invite(e,'slot1','one',X,'cycle_unique_0001','owner',options),true)
   assert.equal(await read(ref('one')),undefined);assert.equal(await read(`${root}/inviteeIndex/one`),undefined);assert.equal(await read(`${root}/invitationOccurrences/${X}`),undefined);assert.equal(await read(`users/one/activityInbox/sp_${P}_${X}`),undefined);assert.equal((await read(`${root}/slots/slot1`)).status,'empty')
  }
  await attempt('concurrent equivalent NEW',async()=>{const before=await read(`${root}/slots/slot1`),r=await Promise.allSettled([invite(e,'slot1','one',X,'cycle_unique_0001','owner',{before}),invite(e,'slot1','one',X,'cycle_unique_0001','owner',{before})]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.find(x=>x.status==='rejected').reason.code,'permission-denied');records.push({race:'equivalent NEW',outcomes:r.map(x=>x.status)});flush()})
  await attempt('replay NEW/ref',()=>invite(e,'slot1','one',X,'cycle_unique_0001'),true)
  // Controlled read padding after all valid/resource/security gates. No checks removed.
  for(const kind of ['CREATE','NEW1','NEW4']){
   let boundary=false
   for(let n=0;n<=11;n++){
    await e.cleanup();e=await h.initialize(rules);await reset()
    if(kind!=='CREATE')await create(e)
    if(kind==='NEW4')for(const [i,u] of ['one','two','three'].entries())await invite(e,'slot'+(i+1),u,'paddingoccur000'+i,'cycle_unique_000'+(i+1))
    const docs={};for(let i=0;i<n;i++)docs['discoveryPadding/p'+i]={ok:true};await h.seed(e,docs)
    const checks=Array.from({length:n},(_,i)=>`get(/databases/$(database)/documents/discoveryPadding/p${i}).data.ok == true`).join(' && ')
    const needle=kind==='CREATE'?'&& discoveryRef(request.auth.uid,planId)':'&& discoveryRef(u,planId)'
    assert.equal(rules.split(needle).length,2)
    const padded=n?rules.replace(needle,()=>`&& ${checks} ${needle}`):rules
    await e.cleanup();e=await h.initialize(padded)
    let error;try{if(kind==='CREATE')await create(e);else await invite(e,kind==='NEW4'?'slot4':'slot1','four','paddingtarget001','cycle_unique_0004')}catch(x){error=x}
    const message=error?.message||''
    records.push({padding:kind,additional:n,accepted:!error,code:error?.code||null,expressions:/1000 expressions/.test(message),service:/Service call error/.test(message),message});flush()
    if(n===0&&error)throw error
    if(error){assert.equal(error.code,'permission-denied');boundary=true;break}
   }
   assert.ok(boundary,'bounded padding did not find boundary; report as incomplete')
  }
 }finally{flush();await e.cleanup()}
})
