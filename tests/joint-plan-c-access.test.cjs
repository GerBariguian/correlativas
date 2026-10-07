const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const P='explicitplan0001x',time={seconds:1700000000,nanoseconds:0};
const parent=()=>({schemaVersion:3,origin:'native',ownerId:'alice',ownerInstanceId:'i_alice',catalogId:'catalog',closed:false,deleting:false,createdAt:time});
const slot=()=>({status:'empty',uid:null,revision:0,occurrence:null,cycle:null,invitedBy:null,binding:null,joinedOccurrence:null,updatedAt:time});
function setup(){
 const auth={currentUser:{uid:'alice'}},calls=[],records=new Map();let failure=null,afterRead=()=>{};
 const source=['src/jointPlanLogic.js','src/services/jointPlans.js'].map(p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8').replace(/^import .*\r?\n/gm,'').replace(/export /g,'')).join('\n');
 const api=new Function('auth','db','doc','getDocFromServer',source+'\nreturn {decodeJointCPlan,decodeJointCSlot,jointCPlanPath,jointCSlotPath,readJointCPlan,readJointCSlot};')(auth,{},(_db,p)=>{calls.push(['ref',p]);return p},async p=>{calls.push(['read',p]);afterRead();if(failure)throw failure;return {exists:()=>records.has(p),data:()=>records.get(p)}});
 return {...api,auth,calls,records,fail:e=>failure=e,onRead:fn=>afterRead=fn};
}
test('S2-A T1 parent C decode',()=>{assert.deepEqual(setup().decodeJointCPlan(parent()),parent())});
test('S2-A T2 rejects legacy and v2',()=>{for(const version of [undefined,2])assert.throws(()=>setup().decodeJointCPlan({...parent(),schemaVersion:version}),{code:'INVALID_JOINT_C_DOCUMENT'})});
test('S2-A T3 invalid C parent',()=>{for(const patch of [{origin:'unknown'},{ownerId:''},{closed:'false'},{deleting:true},{extra:1}])assert.throws(()=>setup().decodeJointCPlan({...parent(),...patch}),{code:'INVALID_JOINT_C_DOCUMENT'})});
test('S2-A T4 slot DTOs: empty, pending, member and imported occupancy',()=>{
 const a=setup();a.decodeJointCSlot(slot());const pending={...slot(),status:'pending',uid:'bob',revision:1,occurrence:'occurrence000001x',cycle:'cycle_1',invitedBy:'alice'};a.decodeJointCSlot(pending);
 a.decodeJointCSlot({...pending,status:'member',binding:'i_bob',joinedOccurrence:pending.occurrence});
 a.decodeJointCSlot({...pending,status:'member',binding:'i_bob',occurrence:'import_occupancy0000001x',joinedOccurrence:'import_occupancy0000001x',cycle:null,invitedBy:null});
});
test('S2-A T5 invalid slots',()=>{for(const patch of [{revision:-1},{uid:'bob'},{status:'other'},{importId:'provenance'},{updatedAt:null}])assert.throws(()=>setup().decodeJointCSlot({...slot(),...patch}),{code:'INVALID_JOINT_C_DOCUMENT'})});
test('S2-A T6 explicit plan reader, exactly one read',async()=>{const a=setup();a.records.set('jointPlans/'+P,parent());assert.deepEqual(await a.readJointCPlan('alice',P),{planId:P,plan:parent()});assert.deepEqual(a.calls,[['ref','jointPlans/'+P],['read','jointPlans/'+P]])});
test('S2-A T7 no session, wrong uid, invalid uid: no SDK access',async()=>{for(const uid of ['alice','bob',undefined]){const a=setup();if(uid==='alice')a.auth.currentUser=null;await assert.rejects(a.readJointCPlan(uid,P));assert.equal(a.calls.length,0)}});
test('S2-A T8 missing plan/slot: null and no fallback',async()=>{for(const mode of ['plan','slot']){const a=setup();assert.equal(await(mode==='plan'?a.readJointCPlan('alice',P):a.readJointCSlot('alice',P,'slot1')),null);assert.equal(a.calls.filter(x=>x[0]==='read').length,1)}});
test('S2-A T9 SDK errors propagate, no fallback',async()=>{for(const code of ['permission-denied','not-found','unavailable'])for(const mode of ['plan','slot']){const a=setup(),error=Object.assign(new Error(code),{code});a.fail(error);await assert.rejects(mode==='plan'?a.readJointCPlan('alice',P):a.readJointCSlot('alice',P,'slot1'),e=>e===error);assert.equal(a.calls.filter(x=>x[0]==='read').length,1)}});
test('S2-A T10 explicit slot reader, no parent read',async()=>{const a=setup(),p=`jointPlans/${P}/slots/slot3`;a.records.set(p,slot());assert.deepEqual(await a.readJointCSlot('alice',P,'slot3'),{planId:P,slotId:'slot3',slot:slot()});assert.deepEqual(a.calls,[['ref',p],['read',p]])});
test('S2-A T11 selection and owner identity do not decide permission',async()=>{const a=setup();Object.defineProperty(a.auth.currentUser,'activeCareerInstanceId',{get(){throw Error('selection accessed')}});a.records.set('jointPlans/'+P,{...parent(),ownerId:'other'});assert.equal((await a.readJointCPlan('alice',P)).plan.ownerId,'other');assert.equal(a.calls.length,2)});
test('S2-A session changes while reading suppress result',async()=>{const a=setup();a.records.set('jointPlans/'+P,parent());a.onRead(()=>a.auth.currentUser={uid:'alice'});await assert.rejects(a.readJointCPlan('alice',P),/sesión cambió/)});
test('S2-A invalid IDs rejected before SDK',async()=>{const a=setup();await assert.rejects(a.readJointCPlan('alice','../legacy'));await assert.rejects(a.readJointCSlot('alice',P,'slot5'));assert.equal(a.calls.length,0)});
test('S2-A invalid read payload remains error without fallback',async()=>{const a=setup();a.records.set('jointPlans/'+P,{...parent(),schemaVersion:2});await assert.rejects(a.readJointCPlan('alice',P),{code:'INVALID_JOINT_C_DOCUMENT'});assert.equal(a.calls.length,2)});
test('S2-A T12 existing v2 JOIN builder retains explicit binding behavior',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/jointJoinLogic.js'),'utf8').replace(/export /g,'');
 const {buildJointJoin}=new Function(source+';return {buildJointJoin}')();
 const plan={schemaVersion:2,catalogId:'catalog',ownerId:'alice',inviteeIds:['bob'],memberIds:['alice'],closed:false,deleting:false,participants:{alice:{bindingState:'resolved',careerInstanceId:'i_alice'},bob:{bindingState:'unresolved',careerInstanceId:null}}};
 const before=JSON.stringify(plan),result=buildJointJoin(plan,'bob','i_bob');
 assert.deepEqual(result.memberIds,['alice','bob']);assert.deepEqual(result.participants.bob,{bindingState:'resolved',careerInstanceId:'i_bob'});assert.equal(JSON.stringify(plan),before);
 assert.equal(buildJointJoin({...plan,...result},'bob','i_bob'),null);
});
