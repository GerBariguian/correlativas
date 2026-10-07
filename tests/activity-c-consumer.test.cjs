const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const code=fs.readFileSync('src/jointCProductLogic.js','utf8').replace(/export /g,'')
const {resolveVersionedActivity}=new Function(code+';return {resolveVersionedActivity}')()
function setup(){
 const p={catalogId:'different-catalog',closed:false,deleting:false},o={uid:'me',slotId:'slot1',cycle:'C1',invitedBy:'friend',revision:2},s={uid:'me',status:'pending',occurrence:'X',cycle:'C1',invitedBy:'friend',revision:2}
 const f={status:'accepted',cycleId:'C1',senderId:'friend',recipientId:'me'}
 const api={readJointCPlan:async()=>({plan:p}),readJointCInvitationOccurrence:async()=>({occurrence:o}),readJointCSlot:async()=>({slot:s}),readFriendship:async()=>f}
 const item={schemaVersion:3,planId:'p',occurrence:'X',cycle:'C1',actorUid:'friend'}
 return {p,o,s,f,api,item,resolve:i=>resolveVersionedActivity('me',i||item,api,()=>{})}
}
test('S7 current exact occurrence resolves a different catalog without selection mutation',async()=>{const h=setup();assert.deepEqual(await h.resolve(),{destination:'joint',planId:'p',occurrenceId:'X',catalogId:'different-catalog',model:'C'})})
test('S7 session change cancels target resolution instead of returning previous target',async()=>{
 const h=setup();let live=true;h.api.readJointCPlan=async()=>{live=false;return {plan:h.p}}
 await assert.rejects(resolveVersionedActivity('me',h.item,h.api,()=>{if(!live)throw Error('SESSION_CHANGED')}),/SESSION_CHANGED/)
})
for(const [name,change]of [
 ['replaced',h=>h.s.occurrence='Y'],['released',h=>h.s.status='empty'],['withdrawn',h=>h.f.status='withdrawn'],['cycle changed',h=>h.f.cycleId='C2'],
 ['closed',h=>h.p.closed=true],['deleted',h=>h.p.deleting=true],['missing',h=>h.api.readJointCPlan=async()=>null],
 ['denied',h=>h.api.readJointCPlan=async()=>{throw Error('permission-denied')}],['forged actor',h=>h.item.actorUid='outsider'],['stale revision',h=>h.s.revision=3]
])test('S7 generic unavailable '+name,async()=>{const h=setup();change(h);assert.deepEqual(await h.resolve(),{notice:'Esta actividad ya no está disponible.'})})
for(const type of ['FRIEND_REQUEST','FRIEND_ACCEPTED'])test('S7 current and stale friendship '+type,async()=>{
 const h=setup();h.f.status=type==='FRIEND_REQUEST'?'pending':'accepted';h.f.senderId=type==='FRIEND_REQUEST'?'friend':'me';h.f.recipientId=type==='FRIEND_REQUEST'?'me':'friend'
 const item={schemaVersion:2,type,actorUid:'friend',target:{kind:'friendship',id:'friend:me'},friendshipCycleId:'C1'}
 assert.equal((await h.resolve(item)).destination,'friends');h.f.cycleId='C2';assert.equal((await h.resolve(item)).destination,undefined)
})
test('S7 legacy Activity never becomes versioned after technical upgrade',async()=>{const h=setup();assert.equal((await h.resolve({schemaVersion:1,type:'FRIEND_REQUEST_ACCEPTED',actorUid:'friend',target:{kind:'friendship',id:'friend:me'}})).destination,undefined)})
test('S7 no private reads or active-career mutation; actor fallback retained',()=>{
 const s=fs.readFileSync('src/services/jointCProduct.js','utf8');assert.ok(!s.includes('activeCareerInstanceId'));assert.ok(!s.includes('careerInstances'));assert.ok(!s.includes('sharing'))
 const p=new Function(fs.readFileSync('src/activityPresentation.js','utf8').replace(/export /g,'')+';return {activityCopy}')()
 assert.equal(p.activityCopy({type:'SLOT_INVITATION'},null),'Alguien te invitó a un Plan conjunto')
})
