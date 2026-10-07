// Real product Rules. Admin establishes fixtures only, never proves a client grant.
const {test}=require('node:test'),assert=require('node:assert/strict'),sdk=require('firebase/firestore')
const h=require('./helpers.cjs'),{load,fixture,P,X,Y,C,root,time}=require('../joint-c-invite-harness.cjs')
const owner={slotId:'owner',instanceId:'ia',occurrence:'owner',slotRevision:0}
const member={slotId:'slot1',instanceId:'i_bob',occurrence:X,slotRevision:1}
const B=root+'/subjects/A',E=B+'/memberEdges/bob:'+X
const resource=/1000\s+expressions|service[ -]call error|resource[ -]exhaust|maximum[^\n]*calls/i
function values(v){if(Array.isArray(v))return v.map(values);if(v&&typeof v==='object'){if(Object.keys(v).sort().join(',')==='nanoseconds,seconds')return new sdk.Timestamp(v.seconds,v.nanoseconds);return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,values(x)]))}return v}
test('S3-C product member edge gates',async t=>{
 const env=await h.initialize(),clients=new Map()
 const db=u=>{if(!clients.has(u))clients.set(u,env.authenticatedContext(u,h.claims(u)).firestore());return clients.get(u)}
 const api=u=>load(sdk,{currentUser:{uid:u}},db(u))
 const base=()=>api('alice').ensureJointCSubjectBase('alice',P,'A',owner)
 const assign=(u='bob',r=member)=>api('alice').createJointCMemberEdge('alice',P,'A',owner,u,r)
 async function read(p){let d;await env.withSecurityRulesDisabled(async c=>d=(await sdk.getDoc(sdk.doc(c.firestore(),p))).data());return d}
 async function patch(p,d){await h.seed(env,{[p]:{...await read(p),...d}})}
 async function reset(withBase=true){await env.clearFirestore();const f=fixture();f[root+'/slots/slot1']={status:'member',uid:'bob',binding:'i_bob',occurrence:X,joinedOccurrence:X,revision:1,cycle:C,invitedBy:'alice',updatedAt:time};f[root+'/inviteeIndex/bob']={slotId:'slot1'};await h.seed(env,values(f));if(withBase)await base()}
 const payload=(over={})=>({...api('alice').newJointCMemberEdge(P,'A','bob',member,'alice',owner,sdk.serverTimestamp()),...over})
 const raw=(d=payload(),p=E,u='alice')=>sdk.setDoc(sdk.doc(db(u),p),d)
 async function deny(fn){let error;try{await fn()}catch(e){error=e}assert.ok(error,'expected denial');t.diagnostic(JSON.stringify({classification:resource.test(error.message)?'RESOURCE BLOCKED':error.code==='permission-denied'?'LOGICAL DENY':'OTHER ERROR',code:error.code,message:error.message}));assert.equal(error.code,'permission-denied');assert.ok(!resource.test(error.message),'Negative resource failure is not logical proof')}
 async function gate(name,fn){let fatal;await t.test(name,async()=>{try{await fn();t.diagnostic(JSON.stringify({name,status:'PASS',expressions:false,service:false}))}catch(e){if(resource.test(e.message))fatal=Error('RESOURCE FAILURE '+name+': '+e.message);throw e}});if(fatal)throw fatal}
 try{
 await gate('base create/ensure and own edge real services',async()=>{await reset(false);await base();await base();await assign('alice',owner)})
 await gate('other member edge real service and private reads denied',async()=>{await reset();await assign();for(const p of ['users/bob/careerInstances/i_bob','migrationUsers/bob','users/bob/careerInstances/i_bob/academic/progress','users/bob/careerInstances/i_bob/sharing/snapshot'])await deny(()=>sdk.getDoc(sdk.doc(db('alice'),p)))})
 await gate('non-owner actor to owner',async()=>{await reset();await api('bob').createJointCMemberEdge('bob',P,'A',member,'alice',owner)})
 for(const [name,p,d]of [
 ['target archive','users/bob/careerInstances/i_bob',{lifecycle:'archived',archivedAt:time}],
 ['target catalog','users/bob/careerInstances/i_bob',{catalogId:'other'}],
 ['target authority','migrationUsers/bob',{authority:'frozen'}],
 ['actor archive','users/alice/careerInstances/ia',{lifecycle:'archived',archivedAt:time}],
 ['closed',root,{closed:true}],['deleting',root,{closed:true,deleting:true}],
 ['pending',root+'/slots/slot1',{status:'pending',binding:null,joinedOccurrence:null}],
 ['stale occurrence',root+'/slots/slot1',{occurrence:Y,joinedOccurrence:Y}],
 ['stale revision',root+'/slots/slot1',{revision:3}],
 ['stale binding',root+'/slots/slot1',{binding:'other'}],
 ['released',root+'/slots/slot1',{status:'empty',uid:null}],
 ])await gate(name,async()=>{await reset();await patch(p,values(d));await deny(()=>raw());assert.equal(await read(E),undefined)})
 for(const [name,change]of [['schema',{schemaVersion:31}],['extra',{extra:true}],['path UID',{uid:'carol'}],['actor spoof',{updatedByUid:'bob'}],['revision',{revision:2}],['state',{state:'unassigned'}],['slot',{targetRef:{...member,slotId:'slot2'}}]])await gate('edge '+name,async()=>{await reset();await deny(()=>raw(payload(change)))})
 for(const key of Object.keys(payload()))await gate('edge missing '+key,async()=>{await reset();const d=payload();delete d[key];await deny(()=>raw(d))})
 await gate('base absent',async()=>{await reset(false);await deny(()=>raw())})
 await gate('base invalid',async()=>{await reset();await patch(B,{extra:true});await deny(()=>raw())})
 for(const key of ['schemaVersion','code','createdByUid','createdAt','creatorRef','extra'])await gate('base invalid '+key,async()=>{await reset(false);const d=api('alice').newJointCSubjectBase(P,'A','alice',owner,sdk.serverTimestamp());if(key==='extra')d.extra=true;else delete d[key];await deny(()=>sdk.setDoc(sdk.doc(db('alice'),B),d))})
 await gate('base wrong schema/path',async()=>{await reset(false);const d=api('alice').newJointCSubjectBase(P,'A','alice',owner,sdk.serverTimestamp());await deny(()=>sdk.setDoc(sdk.doc(db('alice'),B),{...d,schemaVersion:31}));await deny(()=>sdk.setDoc(sdk.doc(db('alice'),B),{...d,code:'B'}))})
 await gate('combined base edge creation denied',async()=>{await reset(false);const b=sdk.writeBatch(db('alice'));b.set(sdk.doc(db('alice'),B),api('alice').newJointCSubjectBase(P,'A','alice',owner,sdk.serverTimestamp()));b.set(sdk.doc(db('alice'),E),payload());await deny(()=>b.commit());assert.equal(await read(B),undefined)})
 await gate('archive preserves history, other member works, restore allows new edge',async()=>{await reset();await assign();const before=await read(E);await patch('users/bob/careerInstances/i_bob',{lifecycle:'archived',archivedAt:sdk.Timestamp.now()});await api('alice').ensureJointCSubjectBase('alice',P,'B',owner);const p=root+'/subjects/B/memberEdges/bob:'+X;await deny(()=>raw(payload(),p));await assign('alice',owner);assert.deepEqual(await read(E),before);await patch('users/bob/careerInstances/i_bob',{lifecycle:'active',archivedAt:null});await raw(payload(),p)})
 for(const u of ['carol','bob'])await gate('A1 release then '+(u==='bob'?'A2':'B1'),async()=>{await reset();await assign();const old=await read(E);const b=sdk.writeBatch(db('bob'));b.set(sdk.doc(db('bob'),root+'/slots/slot1'),{status:'empty',uid:null,revision:2,occurrence:null,cycle:null,invitedBy:null,binding:null,joinedOccurrence:null,updatedAt:sdk.serverTimestamp()});b.delete(sdk.doc(db('bob'),root+'/inviteeIndex/bob'));await b.commit();await patch(root+'/slots/slot1',{status:'member',uid:u,revision:3,occurrence:Y,joinedOccurrence:Y,binding:'i_'+u,cycle:C,invitedBy:'alice'});await h.seed(env,{[root+'/inviteeIndex/'+u]:{slotId:'slot1'}});await api('alice').ensureJointCSubjectBase('alice',P,'B',owner);await deny(()=>raw(payload(),root+'/subjects/B/memberEdges/bob:'+X));await assign(u,{...member,instanceId:'i_'+u,occurrence:Y,slotRevision:3});assert.deepEqual(await read(E),old)})
 await gate('membership not replaced by friendship ref sharing or selection',async()=>{await reset();await h.seed(env,{[root+'/inviteeIndex/frank']:{slotId:'slot2'},[`users/frank/jointPlanRefs/${P}`]:{schemaVersion:1},'users/frank':{activeCareerInstanceId:'i_frank'},'planningSharing/frank':{enabled:true}});await deny(()=>raw(payload({uid:'frank',targetRef:{...member,slotId:'slot2',instanceId:'i_frank'}}),B+'/memberEdges/frank:'+X));await deny(()=>raw(payload({actorRef:{...member,slotId:'slot2',instanceId:'i_frank'},createdByUid:'frank',updatedByUid:'frank'}),E,'frank'))})
 await gate('immutable base/edge mutations denied',async()=>{await reset();await assign();for(const p of [B,E]){await deny(()=>sdk.updateDoc(sdk.doc(db('alice'),p),{extra:true}));await deny(()=>sdk.deleteDoc(sdk.doc(db('alice'),p)))}await deny(()=>sdk.updateDoc(sdk.doc(db('alice'),E),{state:'unassigned',revision:2,updatedAt:sdk.serverTimestamp()}))})
 }finally{await env.cleanup()}
})
