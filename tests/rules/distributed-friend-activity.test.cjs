const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),sdk=require('firebase/firestore'),h=require('./helpers.cjs')
const {invitations}=require('./fixtures/distributed-invitation-updates.cjs'),{friendActivity}=require('./fixtures/distributed-friend-activity.cjs')
const rules=()=>friendActivity(invitations(fs.readFileSync('firestore.rules','utf8')))
const clients=new WeakMap(); const db=(env,u)=>{if(!clients.has(env))clients.set(env,new Map());const m=clients.get(env);if(!m.has(u))m.set(u,env.authenticatedContext(u,h.claims(u)).firestore());return m.get(u)}
const cycle=i=>'cycle_0000000000'+i
const relation=i=>({participants:['a','b'],senderId:'a',recipientId:'b',status:'pending',cycleId:cycle(i)})
const notice=(i,accepted=false)=>({schemaVersion:2,type:accepted?'FRIEND_ACCEPTED':'FRIEND_REQUEST',actorUid:accepted?'b':'a',createdAt:sdk.serverTimestamp(),readAt:null,target:{kind:'friendship',id:'a:b'},friendshipCycleId:cycle(i)})
async function request(env,i,omit=''){
 const b=sdk.writeBatch(db(env,'a'))
 if(omit!=='source')b.set(sdk.doc(db(env,'a'),'friendships/a:b'),relation(i))
 if(omit!=='certificate')b.set(sdk.doc(db(env,'a'),'usedFriendshipCycles',cycle(i)),{relationshipId:'a:b',participants:['a','b']})
 if(omit!=='notice')b.set(sdk.doc(db(env,'a'),'users/b/activityInbox/fr_'+cycle(i)),notice(i))
 return b.commit()
}
async function accept(env,i,omit=false){const b=sdk.writeBatch(db(env,'b'));b.update(sdk.doc(db(env,'b'),'friendships/a:b'),{status:'accepted'});if(!omit)b.set(sdk.doc(db(env,'b'),'users/a/activityInbox/fa_'+cycle(i)),notice(i,true));return b.commit()}
test('canonical friend Activity lifecycle C1 C2 with immutable history',async()=>{
 const env=await h.initialize(rules());try{
 await env.clearFirestore();await h.assertSucceeds(request(env,1));await h.assertSucceeds(accept(env,1))
 await h.assertSucceeds(sdk.updateDoc(sdk.doc(db(env,'b'),'users/b/activityInbox/fr_'+cycle(1)),{readAt:sdk.serverTimestamp()}))
 await h.assertSucceeds(sdk.updateDoc(sdk.doc(db(env,'a'),'friendships/a:b'),{status:'withdrawn'}))
 await h.assertFails(request(env,1));await h.assertSucceeds(request(env,2));await h.assertSucceeds(accept(env,2))
 assert.equal((await sdk.getDocs(sdk.collection(db(env,'a'),'users/a/activityInbox'))).size,2)
 assert.equal((await sdk.getDocs(sdk.collection(db(env,'b'),'users/b/activityInbox'))).size,2)
 assert.ok((await sdk.getDocFromServer(sdk.doc(db(env,'b'),'users/b/activityInbox/fr_'+cycle(1)))).data().readAt)
 await h.assertFails(sdk.getDocFromServer(sdk.doc(db(env,'a'),'users/b/activityInbox/fr_'+cycle(1))))
 await h.assertFails(sdk.setDoc(sdk.doc(db(env,'a'),'users/b/activityInbox/fr_'+cycle(2)),notice(2)))
 }finally{await env.cleanup()}
})
test('friend source/certificate/Activity indivisibility',async t=>{
 const env=await h.initialize(rules());try{
 for(const omit of ['source','certificate','notice'])await t.test(omit,async()=>{await env.clearFirestore();await h.assertFails(request(env,1,omit));await env.withSecurityRulesDisabled(async c=>{for(const path of ['friendships/a:b','usedFriendshipCycles/'+cycle(1),'users/b/activityInbox/fr_'+cycle(1)])assert.equal((await sdk.getDocFromServer(sdk.doc(c.firestore(),path))).exists(),false)})})
 await t.test('accept without notice leaves pending',async()=>{await env.clearFirestore();await request(env,1);await h.assertFails(accept(env,1,true));assert.equal((await sdk.getDocFromServer(sdk.doc(db(env,'a'),'friendships/a:b'))).data().status,'pending')})
 }finally{await env.cleanup()}
})

test('friend Activity spoof/standalone/replay negatives',async t=>{
 const env=await h.initialize(rules())
 try{for(const kind of ['actor','recipient','cycle','target','readAt','timestamp','extra','source-only','standalone'])await t.test(kind,async()=>{
 await env.clearFirestore();const n=notice(1);let path='users/b/activityInbox/fr_'+cycle(1)
 if(kind==='actor')n.actorUid='b';if(kind==='recipient')path='users/a/activityInbox/fr_'+cycle(1)
 if(kind==='cycle')n.friendshipCycleId=cycle(2);if(kind==='target')n.target.id='a:c'
 if(kind==='readAt')n.readAt=h.TIME;if(kind==='timestamp')n.createdAt=h.TIME;if(kind==='extra')n.extra=true
 const b=sdk.writeBatch(db(env,'a'))
 if(kind!=='standalone'){b.set(sdk.doc(db(env,'a'),'friendships/a:b'),relation(1));b.set(sdk.doc(db(env,'a'),'usedFriendshipCycles',cycle(1)),{relationshipId:'a:b',participants:['a','b']})}
 if(kind!=='source-only')b.set(sdk.doc(db(env,'a'),path),n)
 await h.assertFails(b.commit())
 await env.withSecurityRulesDisabled(async c=>{assert.equal((await sdk.getDocFromServer(sdk.doc(c.firestore(),'friendships/a:b'))).exists(),false);assert.equal((await sdk.getDocFromServer(sdk.doc(c.firestore(),path))).exists(),false)})
 })}finally{await env.cleanup()}
})
