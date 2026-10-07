// DIAGNOSTIC ONLY. Observed denials are not product expectations.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {expanded}=require('./fixtures/slot-expansion.cjs')
const source=fs.readFileSync('tests/rules/slot-prototype.test.cjs','utf8').split("test('C ordered feasibility gates'")[0]
const {sdk,h,db,inputs,root,create,invite}=new Function('require',source+';return {sdk,h,db,inputs,root,create,invite}')(require)
const original=fs.readFileSync('firestore.rules','utf8'),baseline=expanded(original),observations=[]
async function prepare(e){
 await e.clearFirestore();await h.seed(e,inputs('inverse'));await create(e)
 for(const [i,u] of ['one','two','three','four'].entries()){
  const o='subjectocc00000'+(i+1),s='slot'+(i+1)
  await invite(e,s,u,o,'cycle_unique_000'+(i+1))
  await sdk.updateDoc(sdk.doc(db(e,u),root,'slots',s),{status:'member',binding:'i_'+u,joinedOccurrence:o,updatedAt:sdk.serverTimestamp()})
 }
 await e.withSecurityRulesDisabled(async c=>{
  const inventory={}
  for(const path of [root,...['owner','one','two','three','four'].flatMap(u=>['migrationUsers/'+u,'users/'+u+'/careerInstances/i_'+u]),...['one','two','three','four'].flatMap((u,i)=>[root+'/slots/slot'+(i+1),root+'/inviteeIndex/'+u])])inventory[path]=(await sdk.getDoc(sdk.doc(c.firestore(),path))).data()
  for(const u of ['owner','one','two','three','four']){assert.equal(inventory['migrationUsers/'+u].authority,'instances');assert.equal(inventory['users/'+u+'/careerInstances/i_'+u].lifecycle,'active')}
  fs.writeFileSync('.tools/slot-subject-inventory.json',JSON.stringify(inventory,null,2))
 })
}
async function attempt(e,label,ids){
 const d=db(e,'owner'),b=sdk.writeBatch(d),code='DIAG'+observations.length
 b.set(sdk.doc(d,root,'subjects',code),{code,proposedParticipantIds:ids,addedByUid:'owner',createdAt:sdk.serverTimestamp(),updatedAt:sdk.serverTimestamp()})
 b.set(sdk.doc(d,root,'subjectChecks',code),{revision:1,actorUid:'owner',updatedAt:sdk.serverTimestamp()})
 let error;try{await b.commit()}catch(x){error=x;assert.equal(x.code,'permission-denied')}
 const record={label,ids,pass:!error,expressions:/1000 expressions/.test(error?.message||''),service:/Service call error/.test(error?.message||''),message:error?.message||''}
 await e.withSecurityRulesDisabled(async c=>{for(const name of ['subjects','subjectChecks'])assert.equal((await sdk.getDoc(sdk.doc(c.firestore(),root,name,code))).exists(),!error)})
 observations.push(record);fs.writeFileSync('.tools/slot-subject-diagnostic.json',JSON.stringify(observations,null,2))
 return record
}
test('diagnostic baseline unchanged: 2 PASS, 3 PASS, 4 denied',async t=>{
 const e=await h.initialize(baseline)
 try{await prepare(e)
  for(const n of [2,3,4]){const result=await attempt(e,'baseline-'+n,['owner','one','two','three'].slice(0,n));t.diagnostic(JSON.stringify(result));assert.equal(result.pass,n<4)}
 }finally{await e.cleanup()}
})
test('diagnostic cardinality: actor owner absent from subject list',async t=>{
 const e=await h.initialize(baseline)
 try{await prepare(e);for(const ids of [['one','two'],['one','two','three'],['one','two','three','four']])t.diagnostic(JSON.stringify(await attempt(e,'invitees-only',ids)))}finally{await e.cleanup()}
})
test('diagnostic limited padding: check reduced, fixed paths',async t=>{
 const {diagnostic,editFunction}=require('./fixtures/slot-subject-diagnostic.cjs')
 for(const variant of ['baseline','index-reduced']){
  // The check is trivial in both controls to separate the expression symptom.
  const base=editFunction(diagnostic(original,variant),'checked',()=> ' return true; ')
  const ids=variant==='baseline'?['owner','one','two']:['owner','one','two','three']
  let denied=false
  for(let n=0;n<=3&&!denied;n++){
   const pads=Array.from({length:n},(_,i)=>`get(/databases/$(database)/documents/subjectDiagnosticPadding/p${i}).data.ok == true`).join(' && ')||'true'
   const padded=editFunction(base,'subject',body=>body.replace('return openPlan(p)',`return (${pads}) && openPlan(p)`))
   const e=await h.initialize(padded)
   try{await prepare(e);await h.seed(e,Object.fromEntries(Array.from({length:n},(_,i)=>['subjectDiagnosticPadding/p'+i,{ok:true}])))
    const result=await attempt(e,`padding-${variant}-${n}`,ids);t.diagnostic(JSON.stringify(result));if(n===0)assert.equal(result.pass,true);denied=!result.pass
   }finally{await e.cleanup()}
  }
 }
})
for(const variant of require('./fixtures/slot-subject-diagnostic.cjs').variants){
 test('diagnostic family: '+variant,async t=>{
  const {diagnostic}=require('./fixtures/slot-subject-diagnostic.cjs'),e=await h.initialize(diagnostic(original,variant))
  try{await prepare(e);t.diagnostic(JSON.stringify(await attempt(e,variant,['owner','one','two','three'])))}finally{await e.cleanup()}
 })
}
test('diagnostic position: same four UIDs',async t=>{
 const e=await h.initialize(baseline)
 try{await prepare(e)
  for(const ids of [['three','owner','one','two'],['owner','three','one','two'],['owner','one','three','two'],['one','two','three','owner']])t.diagnostic(JSON.stringify(await attempt(e,'position',ids)))
 }finally{await e.cleanup()}
})
