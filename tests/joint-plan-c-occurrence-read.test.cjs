const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const P='explicitplan0001x',O='occurrence000001x',target=`jointPlans/${P}/invitationOccurrences/${O}`
const fixture=()=>({slotId:'slot2',uid:'bob',invitedBy:'carol',cycle:'cycle00000000001',revision:3,createdAt:{seconds:1,nanoseconds:0}})
function setup(){
  const auth={currentUser:{uid:'alice'}},reads=[];let data=fixture(),error=null,afterRead=()=>{}
  const source=['jointPlanLogic.js','services/jointPlans.js'].map(f=>fs.readFileSync(path.resolve(__dirname,'../src',f),'utf8').replace(/^import .*\r?\n/gm,'').replace(/export /g,'')).join('\n')
  const api=new Function('auth','db','doc','getDocFromServer',source+';return {readJointCInvitationOccurrence,decodeJointCInvitationOccurrence}')(
    auth,{},(_,p)=>p,async p=>{reads.push(p);afterRead();if(error)throw error;return {exists:()=>data!==null,data:()=>data}})
  return {auth,reads,api,read:(uid='alice',p=P,o=O)=>api.readJointCInvitationOccurrence(uid,p,o),data:d=>data=d,fail:e=>error=e,after:f=>afterRead=f}
}
test('O2 T1 exact O1 decoded representation',async()=>{const h=setup();assert.deepEqual(await h.read(),h.api.decodeJointCInvitationOccurrence(P,O,fixture()))})
test('O2 T2 explicit plan/occurrence path',async()=>{const h=setup();await h.read();assert.deepEqual(h.reads,[target])})
test('O2 T3 absent document is null',async()=>{const h=setup();h.data(null);assert.equal(await h.read(),null)})
test('O2 T4 malformed document is error',async()=>{const h=setup();h.data({});await assert.rejects(h.read(),{code:'INVALID_JOINT_C_DOCUMENT'})})
test('O2 T5 noncontractual field rejected',async()=>{const h=setup();h.data({...fixture(),authorized:true});await assert.rejects(h.read(),{code:'INVALID_JOINT_C_DOCUMENT'})})
test('O2 T6 permission denied propagated unchanged',async()=>{const h=setup(),e=Object.assign(Error('denied'),{code:'permission-denied'});h.fail(e);await assert.rejects(h.read(),x=>x===e);assert.equal(h.reads.length,1)})
test('O2 T7 SDK errors including not-found never converted to null',async()=>{for(const code of ['unavailable','not-found','internal']){const h=setup(),e=Object.assign(Error(code),{code});h.fail(e);await assert.rejects(h.read(),x=>x===e)}})
test('O2 T8 absent session rejects without GET',async()=>{const h=setup();h.auth.currentUser=null;await assert.rejects(h.read());assert.equal(h.reads.length,0)})
test('O2 T9 mismatch or invalid UID rejects without GET',async()=>{for(const uid of ['bob',null,'','a/b']){const h=setup();await assert.rejects(h.read(uid));assert.equal(h.reads.length,0)}})
test('O2 T10 logout, other user, same UID replacement reject result',async()=>{for(const user of [null,{uid:'bob'},{uid:'alice'}]){const h=setup();h.after(()=>h.auth.currentUser=user);await assert.rejects(h.read(),/sesión/)}const h=setup();h.data(null);h.after(()=>h.auth.currentUser=null);await assert.rejects(h.read(),/sesión/)})
test('O2 T11/T12/T13 exactly one GET, no queries or secondary reads',async()=>{const h=setup();Object.defineProperty(h.auth.currentUser,'activeCareerInstanceId',{get(){throw Error('selection')}});await h.read();assert.deepEqual(h.reads,[target])})
test('O2 T14 invalid legacy-shaped payload never causes fallback',async()=>{const h=setup();h.data({schemaVersion:2,inviteeIds:['alice']});await assert.rejects(h.read());assert.deepEqual(h.reads,[target])})
test('O2 T15 structure is not authorization or JOIN eligibility',async()=>{const h=setup(),result=await h.read();assert.equal(result.occurrence.uid,'bob');assert.deepEqual(Object.keys(result),['planId','occurrenceId','occurrence']);assert.deepEqual(Object.keys(result.occurrence),Object.keys(fixture()))})
test('O2 IDs validated before GET',async()=>{for(const [p,o] of [['bad',O],[P,'import_'+O]]){const h=setup();await assert.rejects(h.read('alice',p,o));assert.equal(h.reads.length,0)}})
test('O2 payload is not mutated or aliased',async()=>{const h=setup(),d=fixture();Object.freeze(d.createdAt);Object.freeze(d);h.data(d);const result=await h.read();result.occurrence.uid='changed';result.occurrence.createdAt.seconds=9;assert.deepEqual(d,fixture())})
