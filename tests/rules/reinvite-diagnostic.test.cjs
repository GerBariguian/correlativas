// DIAGNOSTIC ONLY, full candidate unchanged during real preparation.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {variant}=require('./fixtures/reinvite-diagnostic.cjs')
const {sdk,h,db,inputs,base,read,transition,write,notice}=require('./fixtures/independent-invitations-harness.cjs')
const original=fs.readFileSync('firestore.rules','utf8'),C2='cycle_refriend_0001'
async function prepare(e){
 await e.clearFirestore();await h.seed(e,inputs('inverse'))
 await sdk.setDoc(sdk.doc(db(e,'owner'),'jointPlans/p'),{...base(),invitationRecipient:null})
 await write(e,'owner','one',{...transition(await read(e),'owner','one','cycle_unique_0001'),invitationRecipient:'one'})
 await sdk.updateDoc(sdk.doc(db(e,'owner'),'friendships/one:owner'),{status:'withdrawn'})
 const d=db(e,'one'),b=sdk.writeBatch(d)
 b.set(sdk.doc(d,'friendships/one:owner'),{participants:['one','owner'],senderId:'one',recipientId:'owner',status:'pending',cycleId:C2})
 b.set(sdk.doc(d,'usedFriendshipCycles',C2),{relationshipId:'one:owner',participants:['one','owner']})
 const n={schemaVersion:2,type:'FRIEND_REQUEST',actorUid:'one',createdAt:sdk.serverTimestamp(),readAt:null,target:{kind:'friendship',id:'one:owner'},friendshipCycleId:C2}
 b.set(sdk.doc(d,'users/owner/activityInbox/fr_'+C2),n);await b.commit()
 const a=sdk.writeBatch(db(e,'owner'));a.update(sdk.doc(db(e,'owner'),'friendships/one:owner'),{status:'accepted'})
 a.set(sdk.doc(db(e,'owner'),'users/one/activityInbox/fa_'+C2),{...n,type:'FRIEND_ACCEPTED',actorUid:'owner'});await a.commit()
}
for(const name of (process.env.REINVITE_CASES||'baseline,shape-true,transition-true,activity-true,dispatch-fixed').split(','))test(name,async t=>{
 let e=await h.initialize(variant(original,'baseline'))
 try{
  await prepare(e)
  if(name==='no-history')await e.withSecurityRulesDisabled(async c=>{
   for(const path of ['users/one/activityInbox/jp_p_1','usedFriendshipCycles/cycle_unique_0001','users/owner/activityInbox/fr_'+C2,'users/one/activityInbox/fa_'+C2])await sdk.deleteDoc(sdk.doc(c.firestore(),path))
  })
  if(name==='no-prior-slot')await e.withSecurityRulesDisabled(c=>sdk.updateDoc(sdk.doc(c.firestore(),'jointPlans/p'),{inviteeIds:[],participants:{owner:{careerInstanceId:'i_owner',bindingState:'resolved'}},invitedBy:{},invitationCycles:{},invitationOccurrences:{},invitationRecipient:null}))
  const before=await read(e)
  const old=(await sdk.getDoc(sdk.doc(db(e,'one'),'users/one/activityInbox/jp_p_1'))).data()
  await e.cleanup();e=await h.initialize(variant(original,name))
  const next={...transition(before,'owner','one',C2),invitationRecipient:'one'}
  let error;try{await write(e,'owner','one',next)}catch(x){error=x}
  assert.deepEqual((await sdk.getDoc(sdk.doc(db(e,'one'),'users/one/activityInbox/jp_p_1'))).data(),old)
  if(error){assert.deepEqual(await read(e),before);assert.equal((await sdk.getDoc(sdk.doc(db(e,'one'),'users/one/activityInbox/jp_p_2'))).exists(),false)}
  else {assert.equal((await read(e)).invitationSerial,2);assert.equal((await sdk.getDoc(sdk.doc(db(e,'one'),'users/one/activityInbox/jp_p_2'))).data().friendshipCycleId,C2)}
  t.diagnostic(JSON.stringify({name,pass:!error,expressions:/1000 expressions/.test(error?.message||''),message:error?.message}))
  if(name==='baseline')assert.equal(error,undefined)
  else if(error&&!/1000 expressions/.test(error.message))throw error
 }finally{await e.cleanup()}
})
