const {test}=require('node:test'),assert=require('node:assert/strict'),sdk=require('firebase/firestore')
const h=require('./helpers.cjs'),{load,fixture}=require('../instance-planning-harness.cjs')
const M='users/alice/careerInstances/ix',S=M+'/sharing/snapshot'
function convert(v){if(Array.isArray(v))return v.map(convert);if(v&&typeof v==='object'){if(Object.keys(v).sort().join()==='nanoseconds,seconds')return new sdk.Timestamp(v.seconds,v.nanoseconds);return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,convert(x)]))}return v}
test('S3-F real services and instance privacy',async t=>{
 const e=await h.initialize(),clients=new Map()
 const db=u=>{if(!clients.has(u))clients.set(u,e.authenticatedContext(u,h.claims(u)).firestore());return clients.get(u)}
 const api=u=>load(sdk,{currentUser:{uid:u}},db(u))
 async function reset(){await e.clearFirestore();await h.seed(e,{...convert(fixture()),'friendships/alice:bob':h.friendship('alice','bob')})}
 async function read(p){let d;await e.withSecurityRulesDisabled(async c=>d=(await sdk.getDoc(sdk.doc(c.firestore(),p))).data());return d}
 const patch=async(p,d)=>h.seed(e,{[p]:{...await read(p),...d}})
 const enable=(i='ix')=>api('alice').setInstancePlanningSharing('alice',i,true,2)
 const shared=(i='ix',c='catalog')=>api('bob').readInstancePlanningSnapshot('bob','alice',i,c)
 async function denied(fn){let err;try{await fn()}catch(x){err=x}assert.ok(err);assert.equal(err.code,'permission-denied');t.diagnostic(JSON.stringify({code:err.code,resource:/1000\s+expressions|service[ -]call error/i.test(err.message),message:err.message}))}
 async function gate(name,fn){let resourceFailure;await t.test(name,async()=>{try{await fn()}catch(x){if(/1000\s+expressions|service[ -]call error/i.test(x.message))resourceFailure=x;throw x}});if(resourceFailure)throw resourceFailure}
 try{
 await gate('real enable compatible read disable',async()=>{await reset();await enable();assert.equal((await shared()).careerInstanceId,'ix');await api('alice').setInstancePlanningSharing('alice','ix',false);await denied(()=>shared())})
 await gate('multicatalog unilateral and selection independent',async()=>{await reset();await enable();await denied(()=>shared('iy','other'));await enable('iy');for(const id of ['ix','iy']){await sdk.updateDoc(sdk.doc(db('alice'),'users/alice'),{activeCareerInstanceId:id,updatedAt:sdk.serverTimestamp()});await sdk.updateDoc(sdk.doc(db('bob'),'users/bob'),{activeCareerInstanceId:id,updatedAt:sdk.serverTimestamp()});assert.ok(await shared());assert.ok(await shared('iy','other'))}})
 await gate('archive X revokes only X restore OFF renewed explicit consent',async()=>{await reset();await enable();await enable('iy');await sdk.updateDoc(sdk.doc(db('alice'),M),{lifecycle:'archived',archivedAt:sdk.serverTimestamp(),updatedAt:sdk.serverTimestamp(),sharing:{enabled:false,consentVersion:2,epoch:2,updatedAt:sdk.serverTimestamp()}});await denied(()=>shared());assert.ok(await shared('iy','other'));await sdk.updateDoc(sdk.doc(db('alice'),M),{lifecycle:'active',archivedAt:null,updatedAt:sdk.serverTimestamp()});await denied(()=>shared());await enable();assert.ok(await shared())})
 for(const [name,p,d] of [
 ['no accepted friendship','friendships/alice:bob',{status:'pending'}],
 ['rejected friendship','friendships/alice:bob',{status:'rejected'}],
 ['no consent',M,{sharing:{enabled:false,consentVersion:2,epoch:2,updatedAt:h.TIME}}],
 ['target archived',M,{lifecycle:'archived',archivedAt:h.TIME}],
 ['reader archived','users/bob/careerInstances/ix',{lifecycle:'archived',archivedAt:h.TIME}],
 ['reader catalog mismatch','users/bob/careerInstances/ix',{catalogId:'other'}],
 ['reader index missing target','users/bob/catalogMemberships/catalog',{careerInstanceId:'missing'}],
 ['target frozen','migrationUsers/alice',{authority:'frozen'}],
 ['reader frozen','migrationUsers/bob',{authority:'frozen'}],
 ['stale epoch',S,{consentEpoch:999}],['stale revision',S,{sourceProgressRevision:999}],['stale schema',S,{schemaVersion:2}]
 ])await gate(name,async()=>{await reset();await enable();await patch(p,d);await denied(()=>shared())})
 await gate('absence of friendship despite plan Activity ref selection profile',async()=>{await reset();await enable();await e.withSecurityRulesDisabled(c=>sdk.deleteDoc(sdk.doc(c.firestore(),'friendships/alice:bob')));await h.seed(e,{'jointPlans/evidence':{ownerId:'alice',memberIds:['alice','bob']},'users/bob/activityInbox/evidence':{actorUid:'alice'},'users/bob/jointPlanRefs/evidence':{schemaVersion:1},'socialProfiles/bob':{careerId:'catalog'}});await denied(()=>shared())})
 await gate('snapshot alone and foreign private reads forbidden',async()=>{await reset();await enable();await patch(M,{sharing:{enabled:false,consentVersion:2,epoch:2,updatedAt:h.TIME}});await denied(()=>shared());for(const p of [M,'migrationUsers/alice',M+'/academic/progress',M+'/planning/projection'])await denied(()=>sdk.getDoc(sdk.doc(db('bob'),p)))})
 await gate('progress invalidates snapshot until explicit refresh',async()=>{await reset();await enable();await sdk.setDoc(sdk.doc(db('alice'),M+'/academic/progress'),{schemaVersion:1,statusMap:{A:'Aprobada'},revision:1,updatedAt:sdk.serverTimestamp()});await denied(()=>shared());await api('alice').refreshInstancePlanningSnapshot('alice','ix');assert.deepEqual((await shared()).snapshot.approvedCodes,['A'])})
 await gate('snapshot catalog incompatible rejected by client decoder',async()=>{await reset();await enable();await patch(S,{catalogVersion:'other:abc'});await assert.rejects(shared(),/INVALID_INSTANCE_SNAPSHOT/)})
 for(const kind of ['enable-disable','refresh-disable'])await gate('concurrent '+kind,async()=>{await reset();await enable();const a=api('alice');const results=await Promise.allSettled([kind==='enable-disable'?enable():a.refreshInstancePlanningSnapshot('alice','ix'),a.setInstancePlanningSharing('alice','ix',false)]);assert.equal(results[1].status,'fulfilled');if(results[0].status==='rejected')assert.match(results[0].reason.message,/SHARING_DISABLED/);const m=await read(M),s=await read(S);if(m.sharing.enabled){assert.equal(s.consentEpoch,m.sharing.epoch);assert.ok(await shared())}else await denied(()=>shared())})
 }finally{await e.cleanup()}
})
