const {test}=require('node:test'),assert=require('node:assert/strict'),sdk=require('firebase/firestore')
const h=require('./helpers.cjs'),{load,legacy}=require('../legacy-friendship-upgrade-harness.cjs')
const {load:plans,fixture,P,X}=require('../joint-c-invite-harness.cjs')
const {values}=require('../joint-plan-migration-harness.cjs')
const C='upgradeCycle00000001',D='upgradeCycle00000002',R='friendships/alice:bob',I='friendships/bob:alice'
const resource=/1000\s+expressions|service[ -]call|resource[ -]exhaust|maximum.*calls/i
test('explicit accepted legacy upgrade real services and Rules',async t=>{
 const e=await h.initialize(),clients=new Map(),evidence=[];let validPathFailure=null
 const db=u=>{if(!clients.has(u))clients.set(u,e.authenticatedContext(u,h.claims(u)).firestore());return clients.get(u)}
 const api=u=>load(sdk,db(u),{currentUser:{uid:u,emailVerified:true}})
 async function read(p){let d;await e.withSecurityRulesDisabled(async c=>{d=(await sdk.getDocFromServer(sdk.doc(c.firestore(),p))).data()});return d}
 async function list(p){let rows;await e.withSecurityRulesDisabled(async c=>{rows=(await sdk.getDocs(sdk.collection(c.firestore(),p))).docs.map(d=>({id:d.id,...d.data()}))});return rows}
 async function reset(inverse){await e.clearFirestore();await h.seed(e,values({[inverse?I:R]:legacy(inverse)},sdk))}
 async function valid(name,fn){try{const v=await fn();evidence.push({name,status:'PASS'});return v}catch(x){validPathFailure={name,message:x.message,resource:resource.test(x.message)};throw x}}
 async function denied(name,fn){let x;try{await fn()}catch(err){x=err}assert.ok(x,'unexpected ALLOW '+name);assert.equal(x.code,'permission-denied');evidence.push({name,status:resource.test(x.message)?'RESOURCE BLOCKED':'LOGICAL DENY'})}
 async function run(name,inverse,fn){if(validPathFailure)return;await t.test(name,async()=>{await reset(inverse);await fn()})}
 function batch(inverse,{uid='alice',cycle=C,mutate=()=>{},cert=true,remove=true}={}){
  const f={participants:['alice','bob'],senderId:'bob',recipientId:'alice',status:'accepted',cycleId:cycle}
  const reservation={relationshipId:'alice:bob',participants:['alice','bob']},b=sdk.writeBatch(db(uid))
  mutate(f,reservation,b,db(uid));b.set(sdk.doc(db(uid),R),f)
  if(cert)b.set(sdk.doc(db(uid),'usedFriendshipCycles',cycle),reservation)
  if(inverse&&remove)b.delete(sdk.doc(db(uid),I))
  return b.commit()
 }
 async function unchanged(source){assert.deepEqual(await read(source),values(legacy(source===I),sdk));assert.equal((await list('usedFriendshipCycles')).length,0);if(source===I)assert.equal(await read(R),undefined)}
 try{
  for(const inverse of [false,true]){
   const prefix=inverse?'inverse':'canonical'
   await run(prefix+' real upgrade, immutable history boundary, no Activity, existing C invitation',inverse,async()=>{
    const result=await valid(prefix+' upgrade',()=>api('alice').upgradeAcceptedLegacyFriendship('alice','bob'))
    const f=await read(R);assert.equal(api('alice').decodeFriendshipCycle('alice:bob',f).status,'accepted')
    assert.deepEqual(f.participants,['alice','bob']);assert.equal(f.senderId,'bob');assert.equal(f.recipientId,'alice');assert.equal(await read(I),undefined)
    assert.deepEqual(await read('usedFriendshipCycles/'+result.cycleId),{relationshipId:'alice:bob',participants:['alice','bob']})
    for(const u of ['alice','bob'])assert.equal((await list(`users/${u}/activityInbox`)).length,0)
    await assert.rejects(api('alice').upgradeAcceptedLegacyFriendship('alice','bob'))
    assert.equal((await list('usedFriendshipCycles')).length,1)
    // Only unrelated academic prerequisites are administrative setup; preserve upgraded friendship.
    const academic=fixture();for(const p of Object.keys(academic))if(p.startsWith('friendships/'))delete academic[p]
    await h.seed(e,values(academic,sdk))
    await valid(prefix+' existing C NEW',()=>plans(sdk,{currentUser:{uid:'alice'}},db('alice')).inviteJointCParticipant('alice',P,'slot1','bob',X,result.cycleId,0))
   })
   await run(prefix+' concurrent upgrades one winning reservation',inverse,async()=>{
    const results=await Promise.allSettled([api('alice').upgradeAcceptedLegacyFriendship('alice','bob'),api('bob').upgradeAcceptedLegacyFriendship('bob','alice')])
    if(results.every(r=>r.status==='rejected'))await valid(prefix+' concurrent upgrade',async()=>{throw results[0].reason})
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
    const winner=results.find(r=>r.status==='fulfilled').value,f=await read(R)
    assert.equal(f.cycleId,winner.cycleId);assert.equal(await read(I),undefined)
    assert.deepEqual((await list('usedFriendshipCycles')).map(d=>d.id),[winner.cycleId])
    assert.equal((await list('friendships')).length,1)
    for(const u of ['alice','bob'])assert.equal((await list(`users/${u}/activityInbox`)).length,0)
   })
   for(const state of ['pending','rejected','withdrawn'])await run(prefix+' rejects '+state,inverse,async()=>{
    const source=inverse?I:R;await h.seed(e,values({[source]:{...legacy(inverse),status:state}},sdk))
    await denied(state,()=>batch(inverse));assert.equal((await read(source)).status,state);assert.equal((await list('usedFriendshipCycles')).length,0)
   })
   for(const [name,options]of [
    ['stranger',{uid:'eve'}],['missing reservation',{cert:false}],
    ['participant mutation',{mutate:f=>{f.participants=['alice','eve'];f.senderId='eve'}}],
    ['sender spoof',{mutate:f=>{f.senderId='alice';f.recipientId='bob'}}],
    ['reservation relationship spoof',{mutate:(_,r)=>{r.relationshipId='alice:eve'}}],
    ['reservation pair spoof',{mutate:(_,r)=>{r.participants=['alice','eve']}}],
    ['invalid cycle',{cycle:'short'}],
    ['extra field',{mutate:f=>{f.updatedAt=sdk.serverTimestamp()}}],
    ['career privilege',{mutate:(_,__,b,d)=>b.set(sdk.doc(d,'users/bob/careerInstances/fake'),{catalogId:'catalog',lifecycle:'active'})}],
    ['sharing privilege',{mutate:(_,__,b,d)=>b.set(sdk.doc(d,'planningSharing/bob'),{enabled:true})}],
    ['plan privilege',{mutate:(_,__,b,d)=>b.set(sdk.doc(d,'jointPlans/fake'),{ownerId:'alice',memberIds:['alice','bob']})}],
    ['fabricated acceptance Activity',{mutate:(_,__,b,d)=>b.set(sdk.doc(d,'users/bob/activityInbox/fa_'+C),api('alice').newFriendshipCycleActivity('FRIEND_ACCEPTED','alice','alice:bob',C,sdk.serverTimestamp()))}],
    ['fabricated request Activity',{mutate:(_,__,b,d)=>b.set(sdk.doc(d,'users/bob/activityInbox/fr_'+C),api('alice').newFriendshipCycleActivity('FRIEND_REQUEST','alice','alice:bob',C,sdk.serverTimestamp()))}],
   ])await run(prefix+' '+name,inverse,async()=>{await denied(name,()=>batch(inverse,options));await unchanged(inverse?I:R)})
   await run(prefix+' duplicate orientations untouched',inverse,async()=>{
    await h.seed(e,values({[inverse?R:I]:legacy(!inverse)},sdk));await denied('both orientations',()=>batch(inverse))
    assert.deepEqual(await read(R),values(legacy(),sdk));assert.deepEqual(await read(I),values(legacy(true),sdk));assert.equal((await list('usedFriendshipCycles')).length,0)
   })
   await run(prefix+' reservation collision atomic',inverse,async()=>{
    await h.seed(e,{['usedFriendshipCycles/'+C]:{relationshipId:'alice:bob',participants:['alice','bob']}})
    await denied('collision',()=>batch(inverse));assert.deepEqual(await read(inverse?I:R),values(legacy(inverse),sdk));if(inverse)assert.equal(await read(R),undefined)
   })
  }
  await run('inverse deletion cannot stand alone or be omitted',true,async()=>{
   await denied('standalone inverse delete',()=>sdk.deleteDoc(sdk.doc(db('alice'),I)));await unchanged(I)
   await denied('omitted inverse delete',()=>batch(true,{remove:false}));await unchanged(I)
  })
  await run('standalone reservation denied',false,async()=>{
   await denied('standalone reservation',()=>sdk.setDoc(sdk.doc(db('alice'),'usedFriendshipCycles',C),{relationshipId:'alice:bob',participants:['alice','bob']}));await unchanged(R)
  })
  await run('no downgrade, reverse relocation or repeated upgrade of versioned relation',false,async()=>{
   await valid('upgrade',()=>api('alice').upgradeAcceptedLegacyFriendship('alice','bob'));const before=await read(R)
   await denied('re-upgrade',()=>batch(false,{cycle:D}));assert.deepEqual(await read(R),before)
   await denied('downgrade',()=>sdk.setDoc(sdk.doc(db('alice'),R),values(legacy(),sdk)))
   const b=sdk.writeBatch(db('alice'));b.delete(sdk.doc(db('alice'),R));b.set(sdk.doc(db('alice'),I),values(legacy(true),sdk));await denied('move back',()=>b.commit())
   assert.deepEqual(await read(R),before);assert.equal(await read(I),undefined)
  })
 }finally{t.diagnostic(JSON.stringify({evidence,validPathFailure,negativeResourceDebt:evidence.filter(x=>x.status==='RESOURCE BLOCKED')}));await e.cleanup()}
})
