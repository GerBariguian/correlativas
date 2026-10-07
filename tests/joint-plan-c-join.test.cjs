const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const P='joinplan00000001x',O='occurrence000001x',C='cycle00000000001',R=`jointPlans/${P}`,S=R+'/slots/slot1',I=R+'/inviteeIndex/bob',OP=R+'/invitationOccurrences/'+O,F='friendships/bob:carol',M='users/bob/careerInstances/ib',U='migrationUsers/bob',time={seconds:1,nanoseconds:0}
const copy=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x))
function setup(){
  const records=new Map(),reads=[],commits=[],auth={currentUser:{uid:'bob'}};let version=0,denied=false,onRead=()=>{},onCommit=()=>{}
  records.set(R,{schemaVersion:3,origin:'native',ownerId:'alice',ownerInstanceId:'ia',catalogId:'catalog',closed:false,deleting:false,createdAt:time})
  records.set(S,{status:'pending',uid:'bob',revision:1,occurrence:O,cycle:C,invitedBy:'carol',binding:null,joinedOccurrence:null,updatedAt:time})
  records.set(I,{slotId:'slot1'})
  records.set(OP,{slotId:'slot1',uid:'bob',invitedBy:'carol',cycle:C,revision:1,createdAt:time})
  records.set(F,{participants:['bob','carol'],senderId:'carol',recipientId:'bob',status:'accepted',cycleId:C})
  records.set(U,{schemaVersion:1,generation:'multicareer-v1',authority:'instances',phase:'complete',origin:'legacy',manifestId:'bob',updatedAt:time})
  records.set(M,{schemaVersion:1,catalogId:'catalog',lifecycle:'active',createdAt:time,updatedAt:time,archivedAt:null})
  const doc=(_, ...p)=>p.join('/'),serverTimestamp=()=>time
  const runTransaction=async(_,fn)=>{for(let n=0;n<5;n++){
    const start=version,writes=[]
    await fn({get:async p=>{assert.equal(writes.length,0);reads.push(p);const data=copy(records.get(p));onRead(p);return {exists:()=>data!==undefined,data:()=>data}},update:(p,d)=>writes.push([p,copy(d)])})
    if(start!==version)continue
    if(denied)throw Object.assign(Error('denied'),{code:'permission-denied'})
    for(const [p,d]of writes)records.set(p,{...records.get(p),...d});version++;commits.push(writes);onCommit();return
  }throw Error('conflict')}
  const load=f=>fs.readFileSync(path.resolve(__dirname,'../src',f),'utf8').replace(/^import .*\r?\n/gm,'').replace(/export /g,'')
  const friend=new Function(load('friendshipCycleLogic.js')+';return {canonicalFriendshipId,decodeFriendshipCycle}')()
  const source=['careerInstanceLogic.js','careerInstancePersistenceLogic.js','userDataAuthorityLogic.js','jointPlanLogic.js','jointJoinLogic.js','services/jointJoin.js'].map(load).join('\n')
  const api=new Function('doc','serverTimestamp','runTransaction','canonicalFriendshipId','decodeFriendshipCycle',source+';return {joinJointCPlan}')(doc,serverTimestamp,runTransaction,friend.canonicalFriendshipId,friend.decodeFriendshipCycle)
  return {records,reads,commits,auth,join:(o=O,uid='bob',instance='ib')=>api.joinJointCPlan({db:{},auth},uid,P,o,instance),deny:()=>denied=true,readHook:f=>onRead=f,commitHook:f=>onCommit=f}
}
test('F2 T1/T2/T13/T14 valid explicit occurrence, nonowner inviter, own binding',async()=>{const h=setup();await h.join();const s=h.records.get(S);assert.equal(s.status,'member');assert.equal(s.binding,'ib');assert.equal(s.joinedOccurrence,O);assert.equal(s.revision,1);assert.ok(h.reads.includes(OP))})
const invalidCases=[
  ['T3 wrong invitee',h=>h.records.get(OP).uid='eve'],
  ['T4 wrong slot',h=>h.records.get(OP).slotId='slot2'],
  ['T5/T11 stale X after Y',h=>h.records.get(S).occurrence='occurrence000002y'],
  ['T6 stale revision',h=>h.records.get(S).revision=2],
  ['T7 inconsistent index',h=>h.records.get(I).slotId='slot2'],
  ['T8 friendship not accepted',h=>h.records.get(F).status='withdrawn'],
  ['T9/T10 C1 after C2',h=>h.records.get(F).cycleId='cycle00000000002'],
  ['T12 after RELEASE',h=>{Object.assign(h.records.get(S),{status:'empty',uid:null,revision:2,occurrence:null,cycle:null,invitedBy:null,binding:null,joinedOccurrence:null});h.records.delete(I)}],
  ['T15 missing instance',h=>h.records.delete(M)],
  ['T15 invalid instance',h=>h.records.get(M).schemaVersion=2],
  ['T15 wrong catalog',h=>h.records.get(M).catalogId='other'],
  ['T15 archived instance',h=>Object.assign(h.records.get(M),{lifecycle:'archived',archivedAt:time})],
  ['missing occurrence',h=>h.records.delete(OP)],
  ['malformed occurrence',h=>h.records.get(OP).extra=true],
  ['duplicate friendship orientation',h=>h.records.set('friendships/carol:bob',copy(h.records.get(F)))],
  ['missing authority',h=>h.records.delete(U)],
  ['blocked authority',h=>h.records.get(U).phase='blocked'],
  ['closed parent',h=>h.records.get(R).closed=true],
  ['deleting parent',h=>Object.assign(h.records.get(R),{closed:true,deleting:true})],
  ['T28 legacy parent',h=>delete h.records.get(R).schemaVersion],
  ['T28 v2 parent',h=>h.records.get(R).schemaVersion=2]
]
for(const [label,mutate]of invalidCases)test('F2 '+label+' rejects without partial writes',async()=>{const h=setup();mutate(h);const before=copy([...h.records]);await assert.rejects(h.join());assert.deepEqual([...h.records],before);assert.equal(h.commits.length,0)})
test('F2 inverse friendship with same contractual identity accepted',async()=>{const h=setup();h.records.set('friendships/carol:bob',h.records.get(F));h.records.delete(F);await h.join();assert.equal(h.records.get(S).status,'member')})
test('F2 T16/T17/T18/T19/T20 exact reads, no selection, sharing/progress, Activity or refs',async()=>{const h=setup();Object.defineProperty(h.auth.currentUser,'activeCareerInstanceId',{get(){throw Error('selection')}});await h.join();assert.deepEqual(h.reads,[R,OP,S,I,F,'friendships/carol:bob',U,M])})
test('F2 T21 one atomic slot update with only contractual fields',async()=>{const h=setup(),before=copy([...h.records]);await h.join();assert.equal(h.commits.length,1);assert.equal(h.commits[0].length,1);assert.equal(h.commits[0][0][0],S);assert.deepEqual(Object.keys(h.commits[0][0][1]),['status','binding','joinedOccurrence','updatedAt']);for(const [p,d]of before)if(p!==S)assert.deepEqual(h.records.get(p),d)})
test('F2 T23 write denial leaves membership and binding untouched, no fallback',async()=>{const h=setup(),before=copy([...h.records]);h.deny();await assert.rejects(h.join(),{code:'permission-denied'});assert.deepEqual([...h.records],before);assert.equal(h.reads.length,8)})
test('F2 T24 concurrent JOINs retry with at most one transition',async()=>{const h=setup(),results=await Promise.allSettled([h.join(),h.join()]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(h.commits.length,1)})
test('F2 T25 replay rejected',async()=>{const h=setup();await h.join();await assert.rejects(h.join());assert.equal(h.commits.length,1)})
test('F2 T26 absent/mismatched session rejects before read',async()=>{for(const user of [null,{uid:'eve'}]){const h=setup();h.auth.currentUser=user;await assert.rejects(h.join());assert.equal(h.reads.length,0)}})
test('F2 T27 session replacement during read prevents write',async()=>{const h=setup();h.readHook(()=>h.auth.currentUser={uid:'bob'});await assert.rejects(h.join());assert.equal(h.commits.length,0)})
test('F2 T27 session replacement after commit cannot report success',async()=>{const h=setup();h.commitHook(()=>h.auth.currentUser={uid:'bob'});await assert.rejects(h.join());assert.equal(h.commits.length,1)})
