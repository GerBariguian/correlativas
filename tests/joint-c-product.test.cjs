const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const logic=new Function(fs.readFileSync('src/jointCProductLogic.js','utf8').replace(/export /g,'')+';return {jointCProduct,compatibleJointInstances,currentJointEdge,jointCParticipants}')()
function fixture(){
 const calls=[],parent={catalogId:'other-catalog',ownerId:'me',ownerInstanceId:'own',closed:false,deleting:false}
 const slots=['slot1','slot2','slot3','slot4'].map(slotId=>({planId:'p',slotId,slot:{status:'empty',uid:null,revision:0,occurrence:null}}))
 let valid=true
 const api={readJointCPlan:async()=>({planId:'p',plan:parent}),readJointCSlot:async(_,p,id)=>slots.find(s=>s.slotId===id),
  discoverJointCPlans:async()=>({plans:[{planId:'p',plan:parent}],unavailable:[{planId:'stale'}]}),
  readFriendship:async()=>({status:'accepted',cycleId:'C1'}),upgradeAcceptedLegacyFriendship:async()=>({cycleId:'upgraded'}),
  newOccurrenceId:()=> 'new-occurrence',inviteJointCParticipant:async(_,p,s,u,o,c)=>{slots.find(x=>x.slotId===s).slot={uid:u,status:'pending',occurrence:o,cycle:c,revision:1}},
  createJointCPlan:async()=> 'p',readJointCInvitationOccurrence:async()=>({occurrence:{uid:'me',slotId:'slot1',invitedBy:'friend',cycle:'C1',revision:1}}),
  joinJointCPlan:async()=>{},releaseJointCSlot:async()=>{},ensureJointCSubjectBase:async()=>{},createJointCMemberEdge:async()=>{},
  unassignJointCMemberEdge:async()=>{},reassignJointCMemberEdge:async()=>{},renameJointCPlan:async()=>{},closeJointCPlan:async()=>{},deleteJointCPlan:async()=>{},
  listJointCSubjectBases:async()=>[{code:'A'}],listJointCMemberEdges:async()=>[]}
 const proxy=new Proxy(api,{get:(a,k)=>typeof a[k]==='function'?async(...args)=>{calls.push([k,...args]);return a[k](...args)}:a[k]})
 // ID factory is synchronous.
 const adapter={...Object.fromEntries(Object.keys(api).map(k=>[k,proxy[k]])),newOccurrenceId:api.newOccurrenceId}
 const product=logic.jointCProduct('me',adapter,()=>{if(!valid)throw Error('SESSION_CHANGED')})
 return {api,parent,slots,calls,product,invalidate:()=>{valid=false}}
}
test('S6 discovery keeps resolvable plans and residual refs separate',async()=>{const h=fixture(),r=await h.product.discover();assert.equal(r.plans.length,1);assert.equal(r.unavailable[0].planId,'stale');assert.equal(h.calls.length,1)})
test('S6 create requires explicit active instance and exact catalog',async()=>{const h=fixture();await h.product.create({careerInstanceId:'chosen',catalogId:'other',lifecycle:'active'});assert.deepEqual(h.calls[0],['createJointCPlan','me','chosen','other','Plan conjunto']);assert.throws(()=>h.product.create(null));assert.throws(()=>h.product.create({lifecycle:'archived'}))})
for(const representation of ['versioned','canonical legacy','inverse legacy'])test('S6 invitation '+representation,async()=>{
 const h=fixture();h.api.readFriendship=async()=>representation==='versioned'?{status:'accepted',cycleId:'C1'}:{status:'accepted',participants:representation==='inverse legacy'?['z','a']:['a','z']}
 const result=await h.product.invite('p',['friend']);assert.equal(result[0].status,'success')
 assert.equal(h.calls.filter(c=>c[0]==='upgradeAcceptedLegacyFriendship').length,representation==='versioned'?0:1)
 assert.equal(h.calls.find(c=>c[0]==='inviteJointCParticipant')[6],representation==='versioned'?'C1':'upgraded')
 assert.ok(!h.calls.some(c=>/Activity|sendFriend|respondTo/.test(c[0])))
})
for(const failure of ['upgrade','invitation','duplicate orientations'])test('S6 partial success survives '+failure,async()=>{
 const h=fixture();h.api.readFriendship=async(_,u)=>u==='bad'&&failure!=='invitation'?failure==='duplicate orientations'?null:{status:'accepted'}:{status:'accepted',cycleId:'C1'}
 h.api.upgradeAcceptedLegacyFriendship=async()=>{throw Error('denied')}
 const invite=h.api.inviteJointCParticipant;h.api.inviteJointCParticipant=async(...a)=>{if(a[3]==='bad')throw Error('denied');return invite(...a)}
 const r=await h.product.invite('p',['first','bad','last']);assert.deepEqual(r.map(x=>x.status),['success','unavailable','success']);assert.equal(h.slots.filter(s=>s.slot.uid).length,2)
 assert.ok(!h.calls.some(c=>/delete|release/.test(c[0])))
})
function invited(h){h.parent.ownerId='friend';h.slots[0].slot={uid:'me',status:'pending',occurrence:'X',revision:1,invitedBy:'friend',cycle:'C1'}}
test('S6 JOIN uses exact occurrence and explicit compatible instance',async()=>{const h=fixture();invited(h);const own=[{careerInstanceId:'i',catalogId:'other-catalog',lifecycle:'active'}];await h.product.join('p','X','i',own);assert.deepEqual(h.calls.at(-1),['joinJointCPlan','me','p','X','i'])})
for(const reason of ['stale','no instance','archived','different catalog'])test('S6 JOIN rejects '+reason,async()=>{
 const h=fixture();invited(h);let instances=[{careerInstanceId:'i',catalogId:'other-catalog',lifecycle:'active'}]
 if(reason==='stale')h.slots[0].slot.occurrence='Y';if(reason==='no instance')instances=[];if(reason==='archived')instances[0].lifecycle='archived';if(reason==='different catalog')instances[0].catalogId='wrong'
 await assert.rejects(h.product.join('p','X','i',instances));assert.ok(!h.calls.some(c=>c[0]==='joinJointCPlan'))
})
test('S6 release forwards exact identity and never deletes history',async()=>{const h=fixture();invited(h);await h.product.release('p',h.slots[0]);assert.deepEqual(h.calls,[['releaseJointCSlot','me','p','slot1','X',1]])})
test('S6 subject base precedes independent assignments; failures do not rollback',async()=>{
 const h=fixture(),actor={occurrence:'owner'};h.api.createJointCMemberEdge=async(_,p,c,a,u)=>{if(u==='bad')throw Error('denied')}
 const r=await h.product.assign('p','A',actor,[{uid:'first',reference:{occurrence:'A1'}},{uid:'bad',reference:{occurrence:'B1'}},{uid:'last',reference:{occurrence:'A2'}}])
 assert.equal(h.calls[0][0],'ensureJointCSubjectBase');assert.deepEqual(r.map(x=>x.status),['success','unavailable','success']);assert.equal(h.calls.length,4)
})
for(const state of ['assigned','unassigned'])test('S6 CAS transition '+state,async()=>{const h=fixture(),edge={uid:'target',targetRef:{occurrence:'A1'},revision:8};await h.product.transition('p','A',{},edge,state);assert.deepEqual(h.calls[0],[state==='assigned'?'reassignJointCMemberEdge':'unassignJointCMemberEdge','me','p','A',{},'target',edge.targetRef,8])})
for(const action of ['close','delete'])test('S6 terminal '+action+' uses isolated C API',async()=>{const h=fixture();await h.product[action]('p');assert.deepEqual(h.calls,[[action==='close'?'closeJointCPlan':'deleteJointCPlan','me','p']])})
test('S6 history distinguishes A1/B1/A2 without private operability inference',()=>{const ref={slotId:'slot1',instanceId:'i',occurrence:'A2',slotRevision:3},people=[{uid:'a',reference:ref}];assert.equal(logic.currentJointEdge({uid:'a',targetRef:{...ref,occurrence:'A1'}},people),false);assert.equal(logic.currentJointEdge({uid:'b',targetRef:ref},people),false);assert.equal(logic.currentJointEdge({uid:'a',targetRef:ref},people),true)})
test('S6 session change prevents continuation; only C/public social calls',async()=>{const h=fixture();h.api.readJointCPlan=async()=>{h.invalidate();return {plan:h.parent}};await assert.rejects(h.product.plan('p'),/SESSION_CHANGED/);assert.equal(h.calls.length,1)})
test('S6 UI has only read-only legacy history; selection never authorizes C',()=>{
 const page=fs.readFileSync('src/components/PlannerPage.jsx','utf8'),workspace=fs.readFileSync('src/components/JointCWorkspace.jsx','utf8'),service=fs.readFileSync('src/services/jointCProduct.js','utf8')
 assert.ok(!page.includes('<JointPlanPanel'));assert.ok(!page.includes('<AddPlanSubjectDialog'));assert.ok(page.includes('<JointPlanHistory'))
 assert.ok(!workspace.includes('activeCareerInstanceId'));assert.ok(!service.includes('careerInstances/'));assert.ok(!service.includes('statusMap'))
})
module.exports={fixture,logic}
test('S6 name is forwarded explicitly for create and owner rename',async()=>{
 const h=fixture();await h.product.create({careerInstanceId:'chosen',catalogId:'other',lifecycle:'active'},'Mi plan')
 assert.deepEqual(h.calls[0],['createJointCPlan','me','chosen','other','Mi plan'])
 await h.product.rename('p','Nuevo');assert.deepEqual(h.calls[1],['renameJointCPlan','me','p','Nuevo'])
})
test('S6 context remount isolates career/session UI; no selected career becomes plan authority',()=>{
 const app=fs.readFileSync('src/App.jsx','utf8')
 assert.ok(app.includes('JointCWorkspace key={`${user.uid}:${bridge.key}`}'))
 const h=fixture(),instance={careerInstanceId:'explicit',catalogId:'other',lifecycle:'active'}
 Object.defineProperty(instance,'activeCareerInstanceId',{get(){throw Error('selection')}})
 return h.product.create(instance)
})
