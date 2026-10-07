// Gates stop at first unexpected valid-path denial. No global assignment batch.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {memberEdges}=require('./fixtures/member-edge.cjs')
const source=fs.readFileSync('tests/rules/slot-prototype.test.cjs','utf8').split("test('C ordered feasibility gates'")[0]
const {sdk,h,db,inputs,root,create,invite}=new Function('require',source+';return {sdk,h,db,inputs,root,create,invite}')(require)
test('member edge: ordered lifecycle, identity, privacy and concurrency gates',async t=>{
 const rules=memberEdges(fs.readFileSync('firestore.rules','utf8'));fs.writeFileSync('.tools/member-edge.rules',rules)
 let e=await h.initialize(rules);const records=[]
 const refs={owner:{slotId:'owner',instanceId:'i_owner',occurrence:'owner',slotRevision:0}}
 async function gate(label,operation){let error;try{await operation()}catch(x){error=x}
  const record={label,pass:!error,code:error?.code||null,expressions:/1000 expressions/.test(error?.message||''),service:/Service call error/.test(error?.message||''),message:error?.message||''}
  records.push(record);fs.writeFileSync('.tools/member-edge-evidence.json',JSON.stringify(records,null,2)+'\n');t.diagnostic(JSON.stringify(record));if(error)throw error
 }
 async function base(code,actor='owner'){await sdk.setDoc(sdk.doc(db(e,actor),root,'subjects',code),{schemaVersion:31,code,createdByUid:actor,createdAt:sdk.serverTimestamp(),creatorRef:refs[actor]})}
 async function assign(code,u,actor='owner',options={}){
  await sdk.setDoc(sdk.doc(db(e,actor),root,'subjects',code,'memberEdges',options.id||u+':'+refs[u]?.occurrence),{schemaVersion:31,uid:u,targetRef:refs[u],state:'assigned',revision:1,createdByUid:actor,createdAt:sdk.serverTimestamp(),updatedByUid:actor,updatedAt:sdk.serverTimestamp(),actorRef:refs[actor],...options.data})
 }
 async function adminRead(path){let d;await e.withSecurityRulesDisabled(async c=>{d=(await sdk.getDoc(sdk.doc(c.firestore(),path))).data()});return d}
 const edgePath=(code,u,ref=refs[u])=>`${root}/subjects/${code}/memberEdges/${u}:${ref.occurrence}`
 async function transition(code,u,state,actor='owner',before,ref=refs[u]){
  const path=edgePath(code,u,ref);before=before||await adminRead(path)
  return sdk.setDoc(sdk.doc(db(e,actor),path),{...before,state,revision:before.revision+1,updatedByUid:actor,updatedAt:sdk.serverTimestamp(),actorRef:refs[actor]})
 }
 async function denied(label,fn){let error;try{await fn()}catch(x){error=x};assert.ok(error,label);assert.equal(error.code,'permission-denied')
  const record={negative:label,expressions:/1000 expressions/.test(error.message),service:/Service call error/.test(error.message),evaluation:/evaluation error|Null value error/.test(error.message),message:error.message}
  record.category=record.expressions?'C':record.service?'B':record.evaluation?'D-evaluation':'A'
  records.push(record);t.diagnostic(JSON.stringify(record));fs.writeFileSync('.tools/member-edge-evidence.json',JSON.stringify(records,null,2)+'\n')
 }
 async function lifecycle(u,state){const old=await adminRead(`users/${u}/careerInstances/i_${u}`)
  return sdk.updateDoc(sdk.doc(db(e,u),'users',u,'careerInstances','i_'+u),{lifecycle:state,archivedAt:state==='archived'?sdk.serverTimestamp():null,updatedAt:sdk.serverTimestamp(),...(state==='archived'&&old.sharing?{sharing:{...old.sharing,enabled:false,epoch:old.sharing.epoch+1,updatedAt:sdk.serverTimestamp()}}:{})})}
 async function release(u){const d=db(e,u),b=sdk.writeBatch(d),r=refs[u],old=await adminRead(`${root}/slots/${r.slotId}`)
  b.set(sdk.doc(d,root,'slots',r.slotId),{status:'empty',uid:null,revision:old.revision+1,occurrence:null,cycle:null,invitedBy:null,binding:null,joinedOccurrence:null,updatedAt:sdk.serverTimestamp()})
  b.delete(sdk.doc(d,root,'inviteeIndex',u));await b.commit()
 }
 async function joinCurrent(u,s,o){await sdk.updateDoc(sdk.doc(db(e,u),root,'slots',s),{status:'member',binding:'i_'+u,joinedOccurrence:o,updatedAt:sdk.serverTimestamp()});const v=await adminRead(`${root}/slots/${s}`);refs[u]={slotId:s,instanceId:'i_'+u,occurrence:o,slotRevision:v.revision}}
 async function count(code){let n;await e.withSecurityRulesDisabled(async c=>{n=(await sdk.getDocs(sdk.collection(c.firestore(),root,'subjects',code,'memberEdges'))).size});return n}
 try{
  await e.clearFirestore();await h.seed(e,inputs('inverse'));await create(e)
  for(const [i,u] of ['one','two','three','four'].entries()){
   const s='slot'+(i+1),o='edgeoccupancy00'+(i+1)
   await invite(e,s,u,o,'cycle_unique_000'+(i+1))
   await sdk.updateDoc(sdk.doc(db(e,u),root,'slots',s),{status:'member',binding:'i_'+u,joinedOccurrence:o,updatedAt:sdk.serverTimestamp()})
   refs[u]={slotId:s,instanceId:'i_'+u,occurrence:o,slotRevision:1}
  }
  await gate('subject base empty',()=>base('A'));assert.equal(await count('A'),0)
  for(const [i,u] of ['one','two','owner','three','four'].entries()){
   await gate('assignment #'+(i+1)+' owner -> '+u,()=>assign('A',u));assert.equal(await count('A'),i+1)
  }
  await gate('second base',()=>base('B'))
  await gate('non-owner one -> two',()=>assign('B','two','one'))
  await gate('non-owner creates empty base',()=>base('C','one'))
  // Strict identity/replay checks; each denied single write leaves the edge set intact.
  const aBefore=await adminRead(edgePath('A','one'))
  await denied('duplicate/replay',()=>assign('A','one'))
  await denied('alternate edge id',()=>assign('A','one','owner',{id:'alternate'}))
  assert.deepEqual(await adminRead(edgePath('A','one')),aBefore);assert.equal(await count('A'),5)
  await denied('base duplicate',()=>base('A','one'))
  for(const [label,options] of [
   ['wrong slot',{data:{targetRef:{...refs.one,slotId:'slot2'}}}],
   ['invalid slot',{data:{targetRef:{...refs.one,slotId:'slot5'}}}],
   ['old occurrence',{data:{targetRef:{...refs.one,occurrence:'oldoccupancy0001'}},id:'one:oldoccupancy0001'}],
   ['wrong binding',{data:{targetRef:{...refs.one,instanceId:'i_two'}}}],
   ['wrong instance',{data:{targetRef:{...refs.one,instanceId:'missing'}}}],
   ['wrong revision',{data:{targetRef:{...refs.one,slotRevision:0}}}],
   ['wrong UID',{data:{uid:'outsider'}}],
   ['spoof actor',{data:{updatedByUid:'two'}}],
  ]){await denied(label,()=>assign('C','one','owner',options));assert.equal(await count('C'),0)}
  await denied('unknown UID/sixth member',()=>assign('C','outsider','owner',{id:'outsider:edgeoccupancy001',data:{targetRef:refs.one}}))
  await denied('unauthorized actor',()=>assign('C','one','outsider',{data:{actorRef:refs.one}}))
  await denied('missing base',()=>assign('MISSING','one'))
  const instance=await adminRead('users/one/careerInstances/i_one')
  await h.seed(e,{'users/one/careerInstances/i_one':{...instance,catalogId:'wrong'}})
  await denied('wrong catalog',()=>assign('C','one'));await h.seed(e,{'users/one/careerInstances/i_one':instance})
  await h.seed(e,{'users/one/careerInstances/i_one':{...instance,sharing:{enabled:true,consentVersion:2,epoch:1,updatedAt:instance.updatedAt}}})
  const originalSlot=await adminRead(`${root}/slots/slot1`)
  await gate('archive target through lifecycle Rules',()=>lifecycle('one','archived'))
  assert.deepEqual(await adminRead(`${root}/slots/slot1`),originalSlot);assert.deepEqual(await adminRead(edgePath('A','one')),aBefore)
  await denied('archived target',()=>assign('C','one'))
  await gate('other member continues',()=>assign('C','two'))
  const off=(await adminRead('users/one/careerInstances/i_one')).sharing;assert.equal(off.enabled,false)
  await gate('restore same instance',()=>lifecycle('one','active'))
  assert.deepEqual((await adminRead('users/one/careerInstances/i_one')).sharing,off)
  await gate('restored target assign',()=>assign('C','one'))
  await gate('unassign local',()=>transition('C','one','unassigned'))
  const inactive=await adminRead(edgePath('C','one'))
  await gate('reactivate current edge',()=>transition('C','one','assigned'))
  await denied('stale unassign revision',()=>transition('C','one','unassigned','owner',inactive))
  const current=await adminRead(edgePath('C','one'))
  await denied('wrong unassign actor',()=>sdk.setDoc(sdk.doc(db(e,'outsider'),edgePath('C','one')),{...current,state:'unassigned',revision:current.revision+1,updatedByUid:'outsider',updatedAt:sdk.serverTimestamp(),actorRef:refs.one}))
  await denied('wrong unassign occupancy',()=>sdk.setDoc(sdk.doc(db(e,'owner'),edgePath('C','one')),{...current,state:'unassigned',revision:current.revision+1,updatedAt:sdk.serverTimestamp(),targetRef:{...refs.one,occurrence:'wrongoccupancy01'}}))
  await denied('old client missing revision',()=>sdk.setDoc(sdk.doc(db(e,'owner'),root,'subjects','C','memberEdges','three:'+refs.three.occurrence),{uid:'three',state:'assigned'}))
  await denied('base schema mutation',()=>sdk.updateDoc(sdk.doc(db(e,'owner'),root,'subjects','C'),{schemaVersion:1}))
  await denied('unauthorized base creation',()=>sdk.setDoc(sdk.doc(db(e,'outsider'),root,'subjects','FORGED'),{schemaVersion:31,code:'FORGED',createdByUid:'outsider',createdAt:sdk.serverTimestamp(),creatorRef:refs.one}))
  const control=await adminRead('migrationUsers/one')
  await h.seed(e,{'migrationUsers/one':{...control,authority:'frozen',phase:'copying'}})
  await denied('frozen target',()=>assign('B','one'))
  await denied('frozen actor',()=>assign('B','three','one'))
  await h.seed(e,{'migrationUsers/one':control});await gate('authority restored',()=>assign('B','one'))
  // A1 -> five/B1 -> A2. History is never rewritten by occupancy changes.
  const a1={...refs.one},history=await adminRead(edgePath('A','one',a1)),initial=inputs('inverse')
  await base('STALE')
  await h.seed(e,{'migrationUsers/five':{...initial['migrationUsers/four'],manifestId:'five'},'users/five/careerInstances/i_five':{...initial['users/four/careerInstances/i_four']},'friendships/five:owner':{participants:['five','owner'],senderId:'owner',recipientId:'five',status:'accepted',cycleId:'cycle_unique_0005'}})
  await gate('release A1',()=>release('one'))
  await invite(e,'slot1','five','newoccupancy0005','cycle_unique_0005')
  await denied('pending invitee cannot read edges',()=>sdk.getDocs(sdk.collection(db(e,'five'),root,'subjects','A','memberEdges')))
  await joinCurrent('five','slot1','newoccupancy0005')
  await denied('old occupant A1 on absent edge',()=>assign('STALE','one'))
  await gate('new occupant B1',()=>assign('A','five'))
  await release('five');await invite(e,'slot1','one','returnoccupancy1','cycle_unique_0001');await joinCurrent('one','slot1','returnoccupancy1')
  await denied('A1 cannot revive after A2 on absent edge',()=>assign('STALE','one','owner',{id:'one:'+a1.occurrence,data:{targetRef:a1}}))
  await gate('A2 needs new edge',()=>assign('A','one'))
  assert.deepEqual(await adminRead(edgePath('A','one',a1)),history)
  await gate('unassign historical A1 only',()=>transition('A','one','unassigned','owner',history,a1))
  await denied('replay historical unassign',()=>transition('A','one','unassigned','owner',history,a1))
  await denied('reactivate historical A1',()=>transition('A','one','assigned','owner',undefined,a1))
  assert.equal((await adminRead(edgePath('A','one'))).state,'assigned')
  // References from another plan are never resolved outside the current parent.
  await h.seed(e,{'jointPlans/other/slots/slot1':{...(await adminRead(`${root}/slots/slot1`)),occurrence:'otheroccupancy01',joinedOccurrence:'otheroccupancy01'}})
  await denied('other plan occupancy',()=>assign('STALE','one','owner',{id:'one:otheroccupancy01',data:{targetRef:{...refs.one,occurrence:'otheroccupancy01'}}}))
  await denied('other plan slot path',()=>assign('STALE','one','owner',{data:{targetRef:{...refs.one,slotId:'other/slots/slot1'}}}))
  // Read model is plan-scoped; joining never grants private academic reads.
  await gate('member lists subject edges',()=>sdk.getDocs(sdk.collection(db(e,'two'),root,'subjects','A','memberEdges')))
  await denied('outsider reads edges',()=>sdk.getDocs(sdk.collection(db(e,'outsider'),root,'subjects','A','memberEdges')))
  await denied('anonymous reads base',()=>sdk.getDoc(sdk.doc(e.unauthenticatedContext().firestore(),root,'subjects','A')))
  await denied('membership not private progress',()=>sdk.getDoc(sdk.doc(db(e,'two'),'users/one/careerInstances/i_one/academic/progress')))
  await denied('membership not other career',()=>sdk.getDoc(sdk.doc(db(e,'two'),'users/one/careerInstances/i_one')))
  await denied('membership not academic sharing',()=>sdk.getDoc(sdk.doc(db(e,'two'),'users/one/careerInstances/i_one/sharing/snapshot')))
  await denied('membership not legacy statusMap',()=>sdk.getDoc(sdk.doc(db(e,'two'),'users/one/careers/catalog')))
  await denied('released user cannot read edges',()=>sdk.getDocs(sdk.collection(db(e,'five'),root,'subjects','A','memberEdges')))
  // Two independent actors compete for one canonical identity.
  await base('RACE');const race=await Promise.allSettled([assign('RACE','three'),assign('RACE','three','two')])
  assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(await count('RACE'),1)
  for(const x of race.filter(x=>x.status==='rejected'))assert.equal(x.reason.code,'permission-denied')
  records.push({race:'duplicate',outcomes:race.map(x=>x.status)})
  const latest=await adminRead(edgePath('RACE','three'))
  await transition('RACE','three','unassigned')
  const emptyEdge=await adminRead(edgePath('RACE','three'))
  const r2=await Promise.allSettled([transition('RACE','three','assigned','owner',emptyEdge),transition('RACE','three','unassigned','two',latest)])
  assert.equal(r2.filter(x=>x.status==='fulfilled').length,1);assert.equal((await adminRead(edgePath('RACE','three'))).state,'assigned')
  records.push({race:'reactivate vs stale unassign',outcomes:r2.map(x=>x.status)})
  await base('DISTINCT');await gate('independent targets both commit',()=>Promise.all([assign('DISTINCT','three'),assign('DISTINCT','four','two')]))
  assert.equal(await count('DISTINCT'),2)
  const bases=await Promise.allSettled([base('BASE_RACE'),base('BASE_RACE','two')]);assert.equal(bases.filter(x=>x.status==='fulfilled').length,1)
  records.push({race:'base creation',outcomes:bases.map(x=>x.status)})
  await base('RELEASE_RACE');const oldFour={...refs.four}
  const releaseRace=await Promise.allSettled([release('four'),assign('RELEASE_RACE','four')])
  assert.equal(releaseRace[0].status,'fulfilled');if(releaseRace[1].status==='rejected')assert.equal(releaseRace[1].reason.code,'permission-denied')
  await base('POST_RELEASE');await denied('assignment after concurrent release',()=>assign('POST_RELEASE','four'))
  await invite(e,'slot4','five','raceoccupancy005','cycle_unique_0005');await joinCurrent('five','slot4','raceoccupancy005')
  await gate('replacement after release race',()=>assign('POST_RELEASE','five'))
  await denied('stale slot after replacement',()=>assign('POST_RELEASE','four','owner',{data:{targetRef:oldFour}}))
  records.push({race:'release vs assignment',outcomes:releaseRace.map(x=>x.status)})
  await base('ARCHIVE_RACE');const archiveRace=await Promise.allSettled([lifecycle('three','archived'),assign('ARCHIVE_RACE','three')])
  assert.equal(archiveRace[0].status,'fulfilled');if(archiveRace[1].status==='rejected')assert.equal(archiveRace[1].reason.code,'permission-denied')
  await denied('post-race archive freshness',()=>assign('POST_RELEASE','three'))
  records.push({race:'archive vs assignment',outcomes:archiveRace.map(x=>x.status)})
  const closedHistory=await adminRead(edgePath('A','two'))
  await gate('owner closes parent without fanout',()=>sdk.updateDoc(sdk.doc(db(e,'owner'),root),{closed:true}))
  await denied('closed assign',()=>assign('B','four'))
  await denied('closed unassign',()=>transition('A','two','unassigned'))
  assert.deepEqual(await adminRead(edgePath('A','two')),closedHistory)
  // Only after all contractual gates pass: identical extra reads on the edge path.
  // Fresh setup is necessary to compare the same actor/target as edge #1 and #5.
  for(const scenario of ['first-owner','fifth-owner','non-owner']){
   let rejected=false
   for(let n=0;n<=6;n++){
    await e.cleanup();e=await h.initialize(rules);await e.clearFirestore();await h.seed(e,inputs('inverse'));await create(e)
    for(const [i,u] of ['one','two','three','four'].entries()){
     const s='slot'+(i+1),o='edgeoccupancy00'+(i+1);await invite(e,s,u,o,'cycle_unique_000'+(i+1));await joinCurrent(u,s,o)
    }
    await base('PAD')
    if(scenario!=='first-owner')for(const u of ['owner','one','two','three'])await assign('PAD',u)
    const pads={};for(let i=0;i<n;i++)pads['memberEdgePadding/p'+i]={ok:true};await h.seed(e,pads)
    const checks=Array.from({length:n},(_,i)=>`get(/databases/$(database)/documents/memberEdgePadding/p${i}).data.ok == true`).join(' && ')
    const needle='return openPlan(p) && base.schemaVersion'
    assert.equal(rules.split(needle).length,2)
    const padded=n?rules.replace(needle,()=>`return ${checks} && openPlan(p) && base.schemaVersion`):rules
    await e.cleanup();e=await h.initialize(padded)
    let error;try{await assign('PAD','four',scenario==='non-owner'?'one':'owner')}catch(x){error=x}
    records.push({padding:scenario,additional:n,pass:!error,code:error?.code||null,expressions:/1000 expressions/.test(error?.message||''),service:/Service call error/.test(error?.message||''),message:error?.message||''})
    fs.writeFileSync('.tools/member-edge-evidence.json',JSON.stringify(records,null,2)+'\n')
    if(n===0&&error)throw error
    if(error){assert.equal(error.code,'permission-denied');rejected=true;break}
   }
   assert.equal(rejected,true,'bounded padding must find its first rejection; otherwise report incomplete')
  }
  fs.writeFileSync('.tools/member-edge-evidence.json',JSON.stringify(records,null,2)+'\n')
 }finally{await e.cleanup()}
})
