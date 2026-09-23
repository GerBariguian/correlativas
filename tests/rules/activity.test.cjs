const { before, after, beforeEach, test } = require('node:test')
const assert = require('node:assert/strict')
const { doc, collection, writeBatch, setDoc, updateDoc, deleteDoc, getDocFromServer, getDocsFromServer, query, orderBy, where, limit, startAfter, serverTimestamp, runTransaction } = require('firebase/firestore')
const {initialize, claims, baseline, seed, friendship, plan, TIME, assertSucceeds:allow, assertFails:deny}=require('./helpers.cjs')
let env
const clients = new Map()
before(async()=>{env=await initialize()},{timeout:30000})
after(async()=>{if(env) await env.cleanup()})
beforeEach(async()=>{clients.clear();await baseline(env)})
const db=(uid='german')=>{if(!clients.has(uid))clients.set(uid,uid?env.authenticatedContext(uid,claims(uid)).firestore():env.unauthenticatedContext().firestore());return clients.get(uid)}
const note=(type,actor,id)=>({schemaVersion:1,type,actorUid:actor,createdAt:serverTimestamp(),target:{kind:type==='JOINT_PLAN_INVITATION'?'jointPlan':'friendship',id},readAt:null})
const path=(uid,id)=>`users/${uid}/activityInbox/${id}`
const request=(client,patch={},extra={},id='german:juan')=>{
 const batch=writeBatch(client)
 batch.set(doc(client,`friendships/${id}`),{...friendship('german','juan','pending'),createdAt:serverTimestamp(),updatedAt:serverTimestamp(),...extra})
 batch.set(doc(client,path('juan','fr_'+id)),{...note('FRIEND_REQUEST_RECEIVED','german',id),...patch})
 return batch.commit()
}
const invitePlan=async(client,invitees,id='p',omit=-1)=>{
 const batch=writeBatch(client)
 batch.set(doc(client,`jointPlans/${id}`),{...plan('german',invitees,['german']),createdAt:serverTimestamp(),updatedAt:serverTimestamp()})
 invitees.forEach((uid,i)=>{if(i!==omit)batch.set(doc(client,path(uid,'jp_'+id)),note('JOINT_PLAN_INVITATION','german',id))})
 return batch.commit()
}
async function friends(reverse=false){await seed(env,Object.fromEntries(['juan','pedro','maria','outsider'].map(uid=>[`friendships/${reverse?uid+':german':'german:'+uid}`,friendship(reverse?uid:'german',reverse?'german':uid)])))}
test('activity friend request and acceptance atomic happy paths; server time and owner-only query',async()=>{
 await allow(request(db()))
 const notice=await allow(getDocFromServer(doc(db('juan'),path('juan','fr_german:juan'))))
 assert.ok(notice.data().createdAt.toMillis()>TIME.toMillis()); assert.equal(notice.data().readAt,null)
 const batch=writeBatch(db('juan'));batch.update(doc(db('juan'),'friendships/german:juan'),{status:'accepted',updatedAt:serverTimestamp()})
 batch.set(doc(db('juan'),path('german','fa_german:juan')),note('FRIEND_REQUEST_ACCEPTED','juan','german:juan'));await allow(batch.commit())
 await allow(getDocFromServer(doc(db(),path('german','fa_german:juan'))))
 for(const uid of ['german','pedro',null]) {await deny(getDocFromServer(doc(db(uid),path('juan','fr_german:juan'))));await deny(getDocsFromServer(collection(db(uid),'users/juan/activityInbox')))}
})
for(const [label,patch] of Object.entries({actor:{actorUid:'pedro'},type:{type:'OTHER'},kind:{target:{kind:'url',id:'german:juan'}},target:{target:{kind:'friendship',id:'german:pedro'}},targetExtra:{target:{kind:'friendship',id:'german:juan',url:'/'}},time:{createdAt:TIME},read:{readAt:TIME},version:{schemaVersion:2},floatVersion:{schemaVersion:1.5},email:{email:'x'},career:{careerId:'x'},name:{name:'x'},url:{url:'/'},payload:{payload:{}},extra:{x:1}})) test(`activity DENY spoof/schema ${label}`,async()=>{await deny(request(db(),patch));await env.withSecurityRulesDisabled(async c=>assert.equal((await getDocFromServer(doc(c.firestore(),'friendships/german:juan'))).exists(),false))})
test('activity DENY missing fields',async()=>{for(const field of ['schemaVersion','type','actorUid','createdAt','target','readAt']) {const client=db(),batch=writeBatch(client),value=note('FRIEND_REQUEST_RECEIVED','german','german:juan');delete value[field];batch.set(doc(client,'friendships/german:juan'),{...friendship('german','juan','pending'),createdAt:serverTimestamp(),updatedAt:serverTimestamp()});batch.set(doc(client,path('juan','fr_german:juan')),value);await deny(batch.commit())}})
test('activity DENY source omission, standalone notice, wrong recipient and duplicate semantic ID',async()=>{
 await deny(setDoc(doc(db(),'friendships/german:juan'),{...friendship('german','juan','pending'),createdAt:serverTimestamp(),updatedAt:serverTimestamp()}))
 await deny(setDoc(doc(db(),path('juan','fr_german:juan')),note('FRIEND_REQUEST_RECEIVED','german','german:juan')))
 for(const [uid,id] of [['pedro','fr_german:juan'],['juan','random']]) {const client=db(),batch=writeBatch(client);batch.set(doc(client,'friendships/german:juan'),{...friendship('german','juan','pending'),createdAt:serverTimestamp(),updatedAt:serverTimestamp()});batch.set(doc(client,path(uid,id)),note('FRIEND_REQUEST_RECEIVED','german','german:juan'));await deny(batch.commit())}
})
test('activity acceptance omission, impersonation, replay and deleted notice cannot be recreated',async()=>{
 await allow(request(db()))
 for(const uid of ['german','pedro','juan']) await deny(updateDoc(doc(db(uid),'friendships/german:juan'),{status:'accepted',updatedAt:serverTimestamp()}))
 const client=db('juan'),batch=writeBatch(client);batch.update(doc(client,'friendships/german:juan'),{status:'accepted',updatedAt:serverTimestamp()});batch.set(doc(client,path('german','fa_german:juan')),note('FRIEND_REQUEST_ACCEPTED','juan','german:juan'));await allow(batch.commit())
 await allow(deleteDoc(doc(db(),path('german','fa_german:juan'))))
 await deny(setDoc(doc(client,path('german','fa_german:juan')),note('FRIEND_REQUEST_ACCEPTED','juan','german:juan')))
 await deny(updateDoc(doc(client,'friendships/german:juan'),{status:'accepted',updatedAt:serverTimestamp()}))
 await deny(updateDoc(doc(client,'friendships/german:juan'),{status:'rejected',updatedAt:serverTimestamp()}))
 await allow(deleteDoc(doc(client,path('juan','fr_german:juan'))));await deny(request(db()))
})
test('activity readAt is recipient-only null to server timestamp, immutable thereafter',async()=>{
 await allow(request(db()));const p=path('juan','fr_german:juan')
 await deny(updateDoc(doc(db(),p),{readAt:serverTimestamp()}))
 await deny(updateDoc(doc(db('juan'),p),{readAt:TIME}))
 for(const patch of [{type:'JOINT_PLAN_INVITATION'},{actorUid:'pedro'},{target:{kind:'friendship',id:'x:y'}},{createdAt:serverTimestamp()},{email:'x'}]) await deny(updateDoc(doc(db('juan'),p),{readAt:serverTimestamp(),...patch}))
 await allow(updateDoc(doc(db('juan'),p),{readAt:serverTimestamp()}))
 await deny(updateDoc(doc(db('juan'),p),{readAt:null}));await deny(updateDoc(doc(db('juan'),p),{readAt:serverTimestamp()}))
})
for(const reverse of [false,true]) test(`activity MAX FANOUT 4 invitations atomic, reverse friendships=${reverse}`,async()=>{await friends(reverse);await allow(invitePlan(db(),['juan','pedro','maria','outsider']));for(const uid of ['juan','pedro','maria','outsider'])assert.equal((await getDocsFromServer(collection(db(uid),`users/${uid}/activityInbox`))).size,1)})
test('activity plan zero, one, over max, omitted fourth notice and nonfriend',async()=>{
 await friends();await deny(invitePlan(db(),[]));await allow(invitePlan(db(),['juan'],'one'));await deny(invitePlan(db(),['juan','pedro','maria','outsider','sixth'],'six'));await deny(invitePlan(db(),['juan','pedro','maria','outsider'],'omit',3));await deny(invitePlan(db(),['stranger'],'stranger'))
})
async function later(client,actor='juan',recipient='maria',extraNotice={}) {
 const batch=writeBatch(client);batch.update(doc(client,'jointPlans/p'),{inviteeIds:['juan','pedro','maria'],invitedBy:{juan:'german',pedro:'german',maria:actor},updatedAt:serverTimestamp()});batch.set(doc(client,path(recipient,'jp_p')),{...note('JOINT_PLAN_INVITATION',actor,'p'),...extraNotice});return batch.commit()
}
async function planSeed(){await seed(env,{'jointPlans/p':plan(),'friendships/juan:maria':friendship('juan','maria')})}
test('activity later member invitation mandatory and no replay',async()=>{
 await planSeed();await deny(updateDoc(doc(db('juan'),'jointPlans/p'),{inviteeIds:['juan','pedro','maria'],invitedBy:{juan:'german',pedro:'german',maria:'juan'},updatedAt:serverTimestamp()}));await allow(later(db('juan')))
 await allow(deleteDoc(doc(db('maria'),path('maria','jp_p'))));await deny(later(db('juan')));await deny(setDoc(doc(db('juan'),path('maria','jp_p')),note('JOINT_PLAN_INVITATION','juan','p')))
})
for(const [label,uid,actor,recipient,patch] of [['outsider','outsider','outsider','maria',{}],['forged','juan','german','maria',{}],['wrong recipient','juan','juan','outsider',{}],['wrong target','juan','juan','maria',{target:{kind:'jointPlan',id:'other'}}]])test(`activity later invitation rejects ${label}`,async()=>{await planSeed();await deny(later(db(uid),actor,recipient,patch))})
test('activity reject/leave requires removal, allows legitimate reinvitation, actor cannot read inbox',async()=>{
 await friends();await allow(invitePlan(db(),['juan']));await deny(getDocFromServer(doc(db(),path('juan','jp_p'))))
 await deny(updateDoc(doc(db('juan'),'jointPlans/p'),{inviteeIds:[],memberIds:['german'],invitedBy:{},updatedAt:serverTimestamp()}))
 const leave=writeBatch(db('juan'));leave.update(doc(db('juan'),'jointPlans/p'),{inviteeIds:[],memberIds:['german'],invitedBy:{},updatedAt:serverTimestamp()});leave.delete(doc(db('juan'),path('juan','jp_p')));await allow(leave.commit())
 const again=writeBatch(db());again.update(doc(db(),'jointPlans/p'),{inviteeIds:['juan'],invitedBy:{juan:'german'},updatedAt:serverTimestamp()});again.set(doc(db(),path('juan','jp_p')),note('JOINT_PLAN_INVITATION','german','p'));await allow(again.commit())
 assert.equal((await getDocFromServer(doc(db('juan'),path('juan','jp_p')))).data().readAt,null)
 await deny(deleteDoc(doc(db('pedro'),path('juan','jp_p'))))
})
test('activity MAX deletion removes four slots atomically with tombstone; missing slots allowed',async()=>{
 await friends();await allow(invitePlan(db(),['juan','pedro','maria','outsider']));await seed(env,{'jointPlans/p':{...plan('german',['juan','pedro','maria','outsider'],['german']),closed:true,deleting:true}})
 const incomplete=writeBatch(db());incomplete.set(doc(db(),'jointPlanTombstones/p'),{deletedAt:serverTimestamp()});incomplete.delete(doc(db(),'jointPlans/p'));await deny(incomplete.commit())
 await allow(deleteDoc(doc(db('juan'),path('juan','jp_p'))))
 const batch=writeBatch(db());batch.set(doc(db(),'jointPlanTombstones/p'),{deletedAt:serverTimestamp()});batch.delete(doc(db(),'jointPlans/p'));for(const uid of ['juan','pedro','maria','outsider'])batch.delete(doc(db(),path(uid,'jp_p')));await allow(batch.commit())
 for(const uid of ['juan','pedro','maria','outsider'])assert.equal((await getDocsFromServer(collection(db(uid),`users/${uid}/activityInbox`))).size,0)
})
test('activity supported owner query shapes: recent, unread, horizon and cursor',async()=>{
 await allow(request(db()));const client=db('juan'),ref=collection(client,'users/juan/activityInbox')
 const recent=await allow(getDocsFromServer(query(ref,orderBy('createdAt','desc'),limit(20))))
 await allow(getDocsFromServer(query(ref,where('readAt','==',null),where('createdAt','>=',TIME),orderBy('createdAt','desc'),limit(51))))
 await allow(getDocsFromServer(query(ref,orderBy('createdAt','desc'),startAfter(recent.docs[0]),limit(20))))
})
test('activity transaction retries use source state and do not duplicate notices',async()=>{
 const client=db();let callbacks=0
 const send=()=>runTransaction(client,async tx=>{callbacks++;const ref=doc(client,'friendships/german:juan');const previous=await tx.get(ref);if(previous.exists())return;tx.set(ref,{...friendship('german','juan','pending'),createdAt:serverTimestamp(),updatedAt:serverTimestamp()});tx.set(doc(client,path('juan','fr_german:juan')),note('FRIEND_REQUEST_RECEIVED','german','german:juan'))})
 const outcomes=await Promise.allSettled([send(),send()]);assert.ok(outcomes.some(r=>r.status==='fulfilled'));for(const r of outcomes.filter(r=>r.status==='rejected'))assert.ok(['permission-denied','aborted'].includes(r.reason.code));await allow(send());assert.ok(callbacks>=3);assert.equal((await getDocsFromServer(collection(db('juan'),'users/juan/activityInbox'))).size,1)
})

function service(client,uid) {
 const fs=require('node:fs'),sdk=require('firebase/firestore')
 const source=['src/socialMaintenance.js','src/activityLogic.js','src/jointPlanLogic.js','src/services/friends.js','src/services/jointPlans.js'].map(file=>fs.readFileSync(file,'utf8').replace(/import[\s\S]*?from ['"][^'"]+['"]\s*/g,'').replace(/export /g,'')).join('\n')
 // Same JS realm as the real SDK: VM objects are rejected as custom prototypes.
 return new Function('sdk','db','auth', 'const {'+Object.keys(sdk).join(',')+'}=sdk;\n'+source+'\nreturn {sendFriendRequest,respondToFriendRequest,createJointPlan,updatePlanMembership,inviteJointParticipant,closeJointPlan,deleteJointPlan}') (sdk,client,{currentUser:{uid,emailVerified:true}})
}
test('activity real services: request, accept and retry do not read foreign inbox',async()=>{
 await allow(service(db(),'german').sendFriendRequest('german','juan'))
 await allow(service(db('juan'),'juan').respondToFriendRequest('juan','german:juan','accepted'))
 assert.equal((await getDocFromServer(doc(db(),path('german','fa_german:juan')))).data().type,'FRIEND_REQUEST_ACCEPTED')
 await assert.rejects(service(db('juan'),'juan').respondToFriendRequest('juan','german:juan','accepted'))
})
test('activity real services: maximum plan, member exit, reinvite and final deletion',async()=>{
 await friends(true);const owner=service(db(),'german'),guest=service(db('juan'),'juan')
 const id=await allow(owner.createJointPlan('german','test-career',['juan','pedro','maria','outsider'],'Plan'))
 await allow(guest.updatePlanMembership('juan',id,true))
 await allow(guest.updatePlanMembership('juan',id,false))
 assert.equal((await getDocFromServer(doc(db('juan'),path('juan','jp_'+id)))).exists(),false)
 await allow(owner.inviteJointParticipant('german',id,'juan'))
 await allow(owner.closeJointPlan('german',id));await allow(owner.deleteJointPlan('german',id))
 for(const uid of ['juan','pedro','maria','outsider'])assert.equal((await getDocFromServer(doc(db(uid),path(uid,'jp_'+id)))).exists(),false)
})
test('activity exact one notice: valid notice plus second ID makes whole source fail',async()=>{
 const client=db(),batch=writeBatch(client)
 batch.set(doc(client,'friendships/german:juan'),{...friendship('german','juan','pending'),createdAt:serverTimestamp(),updatedAt:serverTimestamp()})
 for(const id of ['fr_german:juan','duplicate'])batch.set(doc(client,path('juan',id)),note('FRIEND_REQUEST_RECEIVED','german','german:juan'))
 await deny(batch.commit())
 await friends();const other=writeBatch(client)
 other.set(doc(client,'jointPlans/p'),{...plan('german',['juan'],['german']),createdAt:serverTimestamp(),updatedAt:serverTimestamp()})
 for(const id of ['jp_p','duplicate'])other.set(doc(client,path('juan',id)),note('JOINT_PLAN_INVITATION','german','p'))
 await deny(other.commit())
})
test('activity sender/third party cannot accept even with apparently correct notice',async()=>{
 await allow(request(db()))
 for(const uid of ['german','pedro']) {const client=db(uid),batch=writeBatch(client);batch.update(doc(client,'friendships/german:juan'),{status:'accepted',updatedAt:serverTimestamp()});batch.set(doc(client,path('german','fa_german:juan')),note('FRIEND_REQUEST_ACCEPTED',uid,'german:juan'));await deny(batch.commit())}
})
test('activity cannot notify an existing invitee or member via timestamp-only plan update',async()=>{
 await planSeed()
 for(const uid of ['juan','pedro']) {const client=db(),batch=writeBatch(client);batch.update(doc(client,'jointPlans/p'),{updatedAt:serverTimestamp()});batch.set(doc(client,path(uid,'jp_p')),note('JOINT_PLAN_INVITATION','german','p'));await deny(batch.commit())}
})

test('activity actual transaction callback retry after a read conflict preserves one notice',async()=>{
 const client=db();let callbacks=0
 await allow(runTransaction(client,async tx=>{
  callbacks++
  await tx.get(doc(client,'users/german'))
  const ref=doc(client,'friendships/german:juan');const before=await tx.get(ref)
  if(before.exists())return
  if(callbacks===1)await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'users/german'),{retryProbe:true}))
  tx.set(ref,{...friendship('german','juan','pending'),createdAt:serverTimestamp(),updatedAt:serverTimestamp()})
  tx.set(doc(client,path('juan','fr_german:juan')),note('FRIEND_REQUEST_RECEIVED','german','german:juan'))
 }))
 assert.ok(callbacks>=2,'SDK must actually rerun the transaction callback')
 assert.equal((await getDocsFromServer(collection(db('juan'),'users/juan/activityInbox'))).size,1)
})

test('activity later invitation reaches the maximum and rejects a sixth person',async()=>{
 await seed(env,{'jointPlans/p':plan('german',['juan','pedro','maria'],['german','juan']),'friendships/juan:outsider':friendship('juan','outsider')})
 const client=db('juan'),batch=writeBatch(client)
 batch.update(doc(client,'jointPlans/p'),{inviteeIds:['juan','pedro','maria','outsider'],invitedBy:{juan:'german',pedro:'german',maria:'german',outsider:'juan'},updatedAt:serverTimestamp()})
 batch.set(doc(client,path('outsider','jp_p')),note('JOINT_PLAN_INVITATION','juan','p'));await allow(batch.commit())
 const sixth=writeBatch(client);sixth.update(doc(client,'jointPlans/p'),{inviteeIds:['juan','pedro','maria','outsider','sixth'],invitedBy:{juan:'german',pedro:'german',maria:'german',outsider:'juan',sixth:'juan'},updatedAt:serverTimestamp()});sixth.set(doc(client,path('sixth','jp_p')),note('JOINT_PLAN_INVITATION','juan','p'));await deny(sixth.commit())
})

function inboxRepository(uid='juan',sdk=require('firebase/firestore')) {
 const {loadRepository}=require('../activity-harness.cjs')
 return loadRepository(sdk,db(uid),{currentUser:{uid,emailVerified:true}}).activityRepository(uid)
}
test('activity repository real listener applies owner queries, limits, normalization and cleanup',async()=>{
 const sdk=require('firebase/firestore'),time=sdk.Timestamp.now(),rows={}
 for(let i=0;i<55;i++){const id=`p${String(i).padStart(2,'0')}`;rows[path('juan','jp_'+id)]={schemaVersion:1,type:'JOINT_PLAN_INVITATION',actorUid:'german',createdAt:time,target:{kind:'jointPlan',id},readAt:null}}
 await seed(env,rows)
 const repo=inboxRepository()
 for(const [mode,size] of [['recent',30],['unread',51]]) {
   let stop
   const value=await new Promise((resolve,reject)=>{stop=repo.subscribe(mode,v=>{if(v.status==='ready')resolve(v)},reject)})
   stop();assert.equal(value.items.length,size);assert.equal(value.atLimit,true);assert.equal(value.items[0].itemId,'jp_p00')
 }
})
test('activity repository real read is concurrent/idempotent and rejects old reinvitation identity',async()=>{
 await request(db());const repo=inboxRepository(),sdk=require('firebase/firestore')
 const snap=await getDocFromServer(doc(db('juan'),path('juan','fr_german:juan')))
 const time=snap.data().createdAt,key=JSON.stringify(['fr_german:juan',time.seconds,time.nanoseconds])
 const results=await Promise.all([repo.markRead('fr_german:juan',key),inboxRepository().markRead('fr_german:juan',key)])
 assert.deepEqual(results.sort(),['alreadyRead','marked'])
 const read=(await getDocFromServer(snap.ref)).data().readAt
 assert.equal(await repo.markRead('fr_german:juan',key),'alreadyRead')
 assert.equal((await getDocFromServer(snap.ref)).data().readAt.isEqual(read),true)
 await deleteDoc(snap.ref);assert.equal(await repo.markRead('fr_german:juan',key),'missing')
 await seed(env,{[path('juan','jp_p')]:{schemaVersion:1,type:'JOINT_PLAN_INVITATION',actorUid:'german',createdAt:sdk.Timestamp.now(),target:{kind:'jointPlan',id:'p'},readAt:null}})
 assert.equal(await repo.markRead('jp_p','["jp_p",0,0]'),'stale')
 assert.equal((await getDocFromServer(doc(db('juan'),path('juan','jp_p')))).data().readAt,null)
})
for(const replacement of ['remove','reinvite'])test(`activity repository actual transaction retry handles ${replacement} before commit`,async()=>{
 const sdk=require('firebase/firestore'),initial=new sdk.Timestamp(100,0),slot=path('juan','jp_p')
 const value={schemaVersion:1,type:'JOINT_PLAN_INVITATION',actorUid:'german',createdAt:initial,target:{kind:'jointPlan',id:'p'},readAt:null}
 await seed(env,{[slot]:value});let attempts=0
 const wrapped={...sdk,runTransaction:(client,callback)=>sdk.runTransaction(client,async tx=>callback({
   get:async ref=>{const snap=await tx.get(ref);if(++attempts===1)await env.withSecurityRulesDisabled(async c=>{
     if(replacement==='remove')await sdk.deleteDoc(sdk.doc(c.firestore(),slot))
     else await sdk.setDoc(sdk.doc(c.firestore(),slot),{...value,createdAt:new sdk.Timestamp(101,0)})
   });return snap},update:(...args)=>tx.update(...args),
 }))}
 const result=await inboxRepository('juan',wrapped).markRead('jp_p','["jp_p",100,0]')
 assert.equal(result,replacement==='remove'?'missing':'stale');assert.ok(attempts>=2)
 if(replacement==='reinvite')assert.equal((await getDocFromServer(doc(db('juan'),slot))).data().readAt,null)
})
