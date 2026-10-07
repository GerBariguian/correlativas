// Isolated update feasibility gate, using complete Rules plus distributed CREATE.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),sdk=require('firebase/firestore'),h=require('./helpers.cjs')
const {invitations}=require('./fixtures/distributed-invitation-updates.cjs')
let source=fs.readFileSync('tests/rules/distributed-versioned-invitations.test.cjs','utf8')
source=source.slice(0,source.indexOf("test('complete CREATE"))
const {input}=new Function('require',source+';return {input}')(require)
const C2='cycle_00000000002'
test('incremental INVITE and renewal feasibility',async t=>{
 const env=await h.initialize(invitations(fs.readFileSync('firestore.rules','utf8')))
 try{
 for(const renewal of [false,true])for(const orientation of ['direct','inverse'])await t.test(`${renewal?'renewal':'invite'} ${orientation}`,async()=>{
 await env.clearFirestore();const x=input(renewal?4:3,orientation),p=x.plan
 p.createdAt=h.TIME;p.updatedAt=h.TIME
 // Existing member (not owner) issues the invitation to the fourth participant.
 p.memberIds=['owner','one'];p.participants.one={bindingState:'resolved',careerInstanceId:'i_one'}
 if(renewal)p.invitedBy.four='one'
 x.entries['jointPlans/p']=p
 x.entries['friendships/'+(orientation==='direct'?'one:four':'four:one')]={...h.friendship('one','four'),cycleId:C2}
 await h.seed(env,x.entries)
 const after={...p,invitationSerial:p.invitationSerial+1,inviteeIds:renewal?p.inviteeIds:[...p.inviteeIds,'four'],
 participants:{...p.participants,four:{bindingState:'unresolved',careerInstanceId:null}},invitedBy:{...p.invitedBy,four:'one'},
 invitationCycles:{...p.invitationCycles,four:C2},invitationOccurrences:{...p.invitationOccurrences,four:p.invitationSerial+1},updatedAt:sdk.serverTimestamp()}
 const db=env.authenticatedContext('one',h.claims('one')).firestore(),b=sdk.writeBatch(db)
 b.set(sdk.doc(db,'jointPlans/p'),after)
 b.set(sdk.doc(db,'users/four/activityInbox/jp_p_'+after.invitationSerial),{schemaVersion:2,type:'JOINT_PLAN_INVITATION',actorUid:'one',createdAt:sdk.serverTimestamp(),readAt:null,target:{kind:'jointPlan',id:'p'},friendshipCycleId:C2,occurrence:after.invitationSerial})
 await h.assertSucceeds(b.commit())
 })
 }finally{await env.cleanup()}
})

async function updateFixture(env,{renewal=false,orientation='direct'}={}){
 const x=input(renewal?4:3,orientation),p=x.plan;p.createdAt=h.TIME;p.updatedAt=h.TIME
 p.memberIds=['owner','one'];p.participants.one={bindingState:'resolved',careerInstanceId:'i_one'}
 if(renewal)p.invitedBy.four='one'
 x.entries['jointPlans/p']=p
 x.entries['friendships/'+(orientation==='direct'?'one:four':'four:one')]={...h.friendship('one','four'),cycleId:C2}
 const serial=p.invitationSerial+1
 const after={...p,invitationSerial:serial,inviteeIds:renewal?p.inviteeIds:[...p.inviteeIds,'four'],participants:{...p.participants,four:{bindingState:'unresolved',careerInstanceId:null}},invitedBy:{...p.invitedBy,four:'one'},invitationCycles:{...p.invitationCycles,four:C2},invitationOccurrences:{...p.invitationOccurrences,four:serial},updatedAt:sdk.serverTimestamp()}
 const notice={schemaVersion:2,type:'JOINT_PLAN_INVITATION',actorUid:'one',createdAt:sdk.serverTimestamp(),readAt:null,target:{kind:'jointPlan',id:'p'},friendshipCycleId:C2,occurrence:serial}
 return {entries:x.entries,p,after,notice,path:'users/four/activityInbox/jp_p_'+serial}
}
async function updateWrite(env,x,{noNotice=false,noParent=false}={}){
 const db=env.authenticatedContext('one',h.claims('one')).firestore(),b=sdk.writeBatch(db)
 if(!noParent)b.set(sdk.doc(db,'jointPlans/p'),x.after)
 if(!noNotice)b.set(sdk.doc(db,x.path),x.notice)
 return b.commit()
}
test('INVITE/renewal negative corpus and no partial writes',async t=>{
 const env=await h.initialize(invitations(fs.readFileSync('firestore.rules','utf8')))
 const cases={
  'missing notice':x=>{x.options={noNotice:true}},'standalone notice':x=>{x.options={noParent:true}},
  'wrong actor':x=>{x.notice.actorUid='owner'},'wrong recipient':x=>{x.path=x.path.replace('/four/','/two/')},
  'old cycle notice':x=>{x.notice.friendshipCycleId='cycle_00000000001'},
  'missing inviter friendship although owner friendship exists':x=>{delete x.entries['friendships/one:four']},
  'withdrawn inviter friendship':x=>{x.entries['friendships/one:four'].status='withdrawn'},
  'closed plan':x=>{x.p.closed=true;x.after.closed=true},
  'archived inviter':x=>{x.entries['users/one/careerInstances/i_one'].lifecycle='archived'},
  'frozen inviter':x=>{x.entries['migrationUsers/one'].authority='frozen'},
  'wrong catalog':x=>{x.after.catalogId='wrong'},
  'serial reset':x=>{x.after.invitationSerial=1},'serial skip':x=>{x.after.invitationSerial+=1},
  'old occurrence':x=>{x.after.invitationOccurrences.four=1;x.notice.occurrence=1;x.path='users/four/activityInbox/jp_p_1'},
  'another slot changed':x=>{x.after.invitationCycles.two=C2},
  'historical overwrite':x=>{x.entries[x.path]={...x.notice,createdAt:h.TIME}},
  'invalid binding':x=>{x.after.participants.four={bindingState:'resolved',careerInstanceId:'i_four'}},
 }
 try{for(const [name,mutate]of Object.entries(cases))await t.test(name,async t=>{
 await env.clearFirestore();const x=await updateFixture(env);mutate(x);await h.seed(env,x.entries)
 let error;try{await updateWrite(env,x,x.options)}catch(e){error=e}
 assert.equal(error?.code,'permission-denied');t.diagnostic(JSON.stringify({name,expressions:/1000 expressions/.test(error.message)}))
 await env.withSecurityRulesDisabled(async c=>{
 assert.deepEqual((await sdk.getDocFromServer(sdk.doc(c.firestore(),'jointPlans/p'))).data(),x.p)
 assert.equal((await sdk.getDocFromServer(sdk.doc(c.firestore(),x.path))).exists(),Object.hasOwn(x.entries,x.path))
 })
 })}finally{await env.cleanup()}
})
test('two tabs invite/renewal: one serial and one new notice; historical readAt preserved',async t=>{
 const env=await h.initialize(invitations(fs.readFileSync('firestore.rules','utf8')))
 try{for(const renewal of [false,true])await t.test(String(renewal),async()=>{
 await env.clearFirestore();const x=await updateFixture(env,{renewal})
 const oldPath='users/four/activityInbox/jp_p_1';x.entries[oldPath]={...x.notice,occurrence:1,friendshipCycleId:'cycle_00000000001',createdAt:h.TIME,readAt:h.TIME}
 await h.seed(env,x.entries)
 const r=await Promise.allSettled([updateWrite(env,x),updateWrite(env,x)])
 assert.equal(r.filter(v=>v.status==='fulfilled').length,1)
 await env.withSecurityRulesDisabled(async c=>{
 const p=(await sdk.getDocFromServer(sdk.doc(c.firestore(),'jointPlans/p'))).data();assert.equal(p.invitationSerial,x.after.invitationSerial)
 assert.deepEqual((await sdk.getDocFromServer(sdk.doc(c.firestore(),oldPath))).data(),x.entries[oldPath])
 assert.equal((await sdk.getDocs(sdk.collection(c.firestore(),'users/four/activityInbox'))).size,2)
 })
 const recipient=env.authenticatedContext('four',h.claims('four')).firestore(),ref=sdk.doc(recipient,x.path)
 await h.assertSucceeds(sdk.updateDoc(ref,{readAt:sdk.serverTimestamp()}))
 await h.assertFails(sdk.updateDoc(ref,{readAt:null}))
 await h.assertFails(sdk.updateDoc(ref,{friendshipCycleId:'cycle_00000000001'}))
 await h.assertFails(sdk.getDocFromServer(sdk.doc(env.authenticatedContext('one',h.claims('one')).firestore(),x.path)))
 })}finally{await env.cleanup()}
})

test('JOIN fifth member remains bound to current inviter cycle',async t=>{
 const env=await h.initialize(invitations(fs.readFileSync('firestore.rules','utf8')))
 try{for(const orientation of ['direct','inverse'])for(const stale of [false,true])await t.test(orientation+' stale='+stale,async()=>{
 await env.clearFirestore();const x=input(4,orientation),p=x.plan;p.createdAt=h.TIME;p.updatedAt=h.TIME;p.memberIds=['owner','one','two','three'];for(const u of p.memberIds)p.participants[u]={bindingState:'resolved',careerInstanceId:'i_'+u};p.invitedBy.four='one';p.invitationCycles.four=stale?'cycle_00000000001':C2
 x.entries['jointPlans/p']=p;x.entries['friendships/'+(orientation==='direct'?'one:four':'four:one')]={...h.friendship('one','four'),cycleId:C2};await h.seed(env,x.entries)
 const db=env.authenticatedContext('four',h.claims('four')).firestore(),promise=sdk.updateDoc(sdk.doc(db,'jointPlans/p'),{memberIds:[...p.memberIds,'four'],participants:{...p.participants,four:{bindingState:'resolved',careerInstanceId:'i_four'}},updatedAt:sdk.serverTimestamp()})
 if(stale)await h.assertFails(promise);else await h.assertSucceeds(promise)
 })}finally{await env.cleanup()}
})
test('INVITE races with canonical withdrawal and close: stale invitations cannot JOIN',async t=>{
 const {friendActivity}=require('./fixtures/distributed-friend-activity.cjs')
 const env=await h.initialize(friendActivity(invitations(fs.readFileSync('firestore.rules','utf8'))))
 try{for(const operation of ['withdraw','close'])for(let i=0;i<4;i++)await t.test(operation+i,async()=>{
 await env.clearFirestore();const x=await updateFixture(env,{orientation:'inverse'});x.entries['friendships/four:one']={participants:['four','one'],senderId:'one',recipientId:'four',status:'accepted',cycleId:C2};await h.seed(env,x.entries)
 const actor=env.authenticatedContext(operation==='close'?'owner':'one',h.claims(operation==='close'?'owner':'one')).firestore()
 const other=operation==='close'?sdk.updateDoc(sdk.doc(actor,'jointPlans/p'),{closed:true,updatedAt:sdk.serverTimestamp()}):sdk.updateDoc(sdk.doc(actor,'friendships/four:one'),{status:'withdrawn'})
 const r=await Promise.allSettled([updateWrite(env,x),other]);assert.equal(r[1].status,'fulfilled')
 for(const v of r)if(v.status==='rejected')assert.equal(v.reason.code,'permission-denied')
 let saved;await env.withSecurityRulesDisabled(async c=>{saved=(await sdk.getDocFromServer(sdk.doc(c.firestore(),'jointPlans/p'))).data();assert.equal((await sdk.getDocFromServer(sdk.doc(c.firestore(),x.path))).exists(),r[0].status==='fulfilled')})
 const recipient=env.authenticatedContext('four',h.claims('four')).firestore()
 await h.assertFails(sdk.updateDoc(sdk.doc(recipient,'jointPlans/p'),{memberIds:[...saved.memberIds,'four'],participants:{...saved.participants,four:{bindingState:'resolved',careerInstanceId:'i_four'}},updatedAt:sdk.serverTimestamp()}))
 })}finally{await env.cleanup()}
})

test('two different invitees race for the fourth slot: no lost update',async()=>{
 const env=await h.initialize(invitations(fs.readFileSync('firestore.rules','utf8')))
 try{
 await env.clearFirestore();const x=await updateFixture(env),y=await updateFixture(env)
 for(const [key,value]of Object.entries(x.entries))if(key.includes('four'))x.entries[key.replaceAll('four','five')]=structuredClone(value)
 x.entries['friendships/one:five']={...h.friendship('one','five'),cycleId:C2}
 y.after.inviteeIds=y.after.inviteeIds.map(u=>u==='four'?'five':u)
 for(const key of ['participants','invitedBy','invitationCycles','invitationOccurrences']){y.after[key].five=y.after[key].four;delete y.after[key].four}
 y.path=y.path.replace('/four/','/five/');await h.seed(env,x.entries)
 const r=await Promise.allSettled([updateWrite(env,x),updateWrite(env,y)])
 assert.equal(r.filter(v=>v.status==='fulfilled').length,1)
 await env.withSecurityRulesDisabled(async c=>{
 const p=(await sdk.getDocFromServer(sdk.doc(c.firestore(),'jointPlans/p'))).data();assert.equal(p.inviteeIds.length,4);assert.equal(p.invitationSerial,4)
 const notices=await Promise.all([x.path,y.path].map(path=>sdk.getDocFromServer(sdk.doc(c.firestore(),path))))
 assert.equal(notices.filter(s=>s.exists()).length,1)
 })
 }finally{await env.cleanup()}
})

test('complete isolated composition retains CREATE E 1-4 in all orientations',async t=>{
 const {friendActivity}=require('./fixtures/distributed-friend-activity.cjs')
 const env=await h.initialize(friendActivity(invitations(fs.readFileSync('firestore.rules','utf8'))))
 try{for(const count of [1,2,3,4])for(const orientation of ['direct','inverse','mixed'])await t.test(count+' '+orientation,async()=>{
 await env.clearFirestore();const x=input(count,orientation);await h.seed(env,x.entries)
 const db=env.authenticatedContext('owner',h.claims('owner')).firestore(),b=sdk.writeBatch(db);b.set(sdk.doc(db,'jointPlans/p'),x.plan)
 for(const uid of x.plan.inviteeIds){const occurrence=x.plan.invitationOccurrences[uid];b.set(sdk.doc(db,'users',uid,'activityInbox','jp_p_'+occurrence),{schemaVersion:2,type:'JOINT_PLAN_INVITATION',actorUid:'owner',createdAt:sdk.serverTimestamp(),readAt:null,target:{kind:'jointPlan',id:'p'},friendshipCycleId:x.plan.invitationCycles[uid],occurrence})}
 await h.assertSucceeds(b.commit())
 })}finally{await env.cleanup()}
})
