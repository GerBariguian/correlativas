const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),sdk=require('firebase/firestore'),h=require('./helpers.cjs')
const {activation}=require('./fixtures/joint-activation-feasibility.cjs')
let source=fs.readFileSync('tests/rules/distributed-versioned-invitations.test.cjs','utf8');source=source.slice(0,source.indexOf("test('complete CREATE"));const {input}=new Function('require',source+';return {input}')(require)
const G='attempt_opaque_00000001'
const client=(e,u)=>e.authenticatedContext(u,h.claims(u)).firestore()
async function prepare(env,count=1,orientation='direct',seal=true){
 const x=input(count,orientation);x.plan.generationId=G;x.plan.activationState='activated'
 x.plan.inviteeIds.forEach((u,i)=>{const path=x.entries['friendships/owner:'+u]?'friendships/owner:'+u:'friendships/'+u+':owner',cycle='cycle_unique_000'+(i+1);x.entries[path].cycleId=cycle;x.plan.invitationCycles[u]=cycle;x.entries['usedFriendshipCycles/'+cycle]={relationshipId:path.slice(12),participants:x.entries[path].participants}})
 await h.seed(env,x.entries);const db=client(env,'owner'),ref=sdk.doc(db,'jointPlanPreparations',G)
 await sdk.setDoc(ref,{ownerId:'owner',state:'draft',plan:{}})
 if(seal)await sdk.updateDoc(ref,{state:'prepared',plan:x.plan})
 return {plan:seal?(await sdk.getDocFromServer(ref)).data().plan:x.plan,entries:x.entries}
}
function notice(plan,uid){const occurrence=plan.invitationOccurrences[uid];return {schemaVersion:2,type:'JOINT_PLAN_INVITATION',actorUid:'owner',createdAt:sdk.serverTimestamp(),readAt:null,target:{kind:'jointPlan',id:G},friendshipCycleId:plan.invitationCycles[uid],occurrence}}
async function activate(env,plan){const db=client(env,'owner'),b=sdk.writeBatch(db);b.set(sdk.doc(db,'jointPlans',G),{...plan,createdAt:sdk.serverTimestamp(),updatedAt:sdk.serverTimestamp()});for(const uid of plan.inviteeIds)b.set(sdk.doc(db,'users',uid,'activityInbox','jp_'+G+'_'+plan.invitationOccurrences[uid]),notice(plan,uid));return b.commit()}
const rules=activation(fs.readFileSync('firestore.rules','utf8'));fs.writeFileSync('.tools/activation-C.rules',rules)
test('C preparation has no operational authority',async t=>{
 const env=await h.initialize(rules)
 try{for(const seal of [false,true])await t.test(seal?'complete prepared':'partial draft',async()=>{
 await env.clearFirestore();const x=await prepare(env,1,'direct',seal),owner=client(env,'owner'),invitee=client(env,'one')
 await h.assertFails(sdk.updateDoc(sdk.doc(invitee,'jointPlans',G),{memberIds:['owner','one'],updatedAt:sdk.serverTimestamp()}))
 await h.assertFails(sdk.setDoc(sdk.doc(owner,'users/one/activityInbox','jp_'+G+'_1'),notice(x.plan,'one')))
 await h.assertFails(sdk.setDoc(sdk.doc(owner,'jointPlans',G,'subjects','A'),h.subject('A','owner')))
 await h.assertFails(sdk.updateDoc(sdk.doc(owner,'jointPlans',G),{memberIds:['owner','one']}))
 await h.assertFails(sdk.getDocFromServer(sdk.doc(invitee,'jointPlans',G)))
 await h.assertFails(sdk.getDocFromServer(sdk.doc(invitee,'jointPlanPreparations',G)))
 await h.assertFails(sdk.getDocs(sdk.collection(owner,'jointPlanPreparations')))
 await h.assertFails(sdk.setDoc(sdk.doc(invitee,'planningSharing/owner'),{enabled:true,sharedCareerId:'catalog',updatedAt:sdk.serverTimestamp()}))
 await h.assertFails(sdk.getDocFromServer(sdk.doc(invitee,'users/owner/careerInstances/i_owner/progress/current')))
 await env.withSecurityRulesDisabled(async c=>{assert.equal((await sdk.getDocFromServer(sdk.doc(c.firestore(),'jointPlans',G))).exists(),false);assert.equal((await sdk.getDocs(sdk.collection(c.firestore(),'users/one/activityInbox'))).size,0)})
 })}finally{await env.cleanup()}
})
test('C activation rejects current-state invalidation and mixed generation',async t=>{
 const env=await h.initialize(rules)
 try{for(const kind of ['withdraw','refriend','archive','frozen','wrong-catalog','cancel','generation','draft'])await t.test(kind,async()=>{
 await env.clearFirestore();const x=await prepare(env,1,'direct',kind!=='draft')
 // Emulator admin mutates authoritative state to isolate the activation predicate, not a lifecycle-service test.
 if(kind==='withdraw'||kind==='refriend')await h.seed(env,{'friendships/owner:one':{...x.entries['friendships/owner:one'],status:kind==='withdraw'?'withdrawn':'accepted',cycleId:kind==='refriend'?'cycle_new_00000001':x.plan.invitationCycles.one}})
 if(kind==='archive'||kind==='wrong-catalog')await h.seed(env,{'users/owner/careerInstances/i_owner':{...x.entries['users/owner/careerInstances/i_owner'],...(kind==='archive'?{lifecycle:'archived'}:{catalogId:'different'})}})
 if(kind==='frozen')await h.seed(env,{'migrationUsers/owner':{...x.entries['migrationUsers/owner'],authority:'frozen'}})
 if(kind==='cancel'){await sdk.updateDoc(sdk.doc(client(env,'owner'),'jointPlanPreparations',G),{state:'cancelled'});await h.assertFails(sdk.updateDoc(sdk.doc(client(env,'owner'),'jointPlanPreparations',G),{state:'prepared'}))}
 if(kind==='generation')x.plan.generationId='attempt_opaque_00000002'
 await h.assertFails(activate(env,x.plan))
 await env.withSecurityRulesDisabled(async c=>{assert.equal((await sdk.getDocFromServer(sdk.doc(c.firestore(),'jointPlans',G))).exists(),false);assert.equal((await sdk.getDocs(sdk.collection(c.firestore(),'users/one/activityInbox'))).size,0)})
 })}finally{await env.cleanup()}
})
test('C activation complete composition 1-4: STOP at first valid limit failure',async t=>{
 const env=await h.initialize(rules);let stop=false
 try{outer:for(const count of [1,2,3,4])for(const orientation of ['direct','inverse','mixed']){
 await t.test(count+' '+orientation,async t=>{
 await env.clearFirestore();const x=await prepare(env,count,orientation)
 let error;try{await activate(env,x.plan)}catch(e){error=e;stop=true}
 t.diagnostic(JSON.stringify({count,orientation,allowed:!error,code:error?.code,expressions:/1000 expressions/.test(error?.message||''),serviceCall:/Service call error/.test(error?.message||'')}))
 if(error)await env.withSecurityRulesDisabled(async c=>{assert.equal((await sdk.getDocFromServer(sdk.doc(c.firestore(),'jointPlans',G))).exists(),false);for(const u of x.plan.inviteeIds)assert.equal((await sdk.getDocs(sdk.collection(c.firestore(),'users',u,'activityInbox'))).size,0);assert.equal((await sdk.getDocFromServer(sdk.doc(c.firestore(),'jointPlanPreparations',G))).data().state,'prepared')})
 assert.equal(error,undefined)
 });if(stop){t.diagnostic('STOP C: no remaining matrix, concurrency, recovery, historical navigation or legacy work');break outer}
 }}finally{await env.cleanup()}
})
