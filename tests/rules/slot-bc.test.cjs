// First valid gate. A denial is a failing test and stops expansion, never an expected result.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {bc}=require('./fixtures/slot-bc.cjs')
const source=fs.readFileSync('tests/rules/slot-prototype.test.cjs','utf8').split("test('C ordered feasibility gates'")[0]
const {sdk,h,db,inputs,root,create,invite}=new Function('require',source+';return {sdk,h,db,inputs,root,create,invite}')(require)
test('B+C Gate 1/2: owner, five current academic participants',async t=>{
 const rules=bc(fs.readFileSync('firestore.rules','utf8'));fs.writeFileSync('.tools/slot-bc.rules',rules)
 const e=await h.initialize(rules)
 try{
  await e.clearFirestore();await h.seed(e,inputs('inverse'));await create(e)
  const proof={owner:{uid:'owner',instanceId:'i_owner',revision:null,occurrence:null}}
  for(const [i,u] of ['one','two','three','four'].entries()){
   const s='slot'+(i+1),o='subjectocc00000'+(i+1)
   await invite(e,s,u,o,'cycle_unique_000'+(i+1))
   await sdk.updateDoc(sdk.doc(db(e,u),root,'slots',s),{status:'member',binding:'i_'+u,joinedOccurrence:o,updatedAt:sdk.serverTimestamp()})
   proof[s]={uid:u,instanceId:'i_'+u,revision:1,occurrence:o}
  }
  const ids=['owner','one','two','three','four'],d=db(e,'owner'),b=sdk.writeBatch(d)
  b.set(sdk.doc(d,root,'subjects','MAX'),{code:'MAX',proposedParticipantIds:ids,addedByUid:'owner',createdAt:sdk.serverTimestamp(),updatedAt:sdk.serverTimestamp()})
  b.set(sdk.doc(d,root,'subjectChecks','MAX'),{revision:1,actorUid:'owner',updatedAt:sdk.serverTimestamp(),proof})
  let error;try{await b.commit()}catch(x){error=x}
  const evidence={gate:'1/2 owner maximum',ids,proof,pass:!error,code:error?.code||null,expressions:/1000 expressions/.test(error?.message||''),service:/Service call error/.test(error?.message||''),message:error?.message||''}
  await e.withSecurityRulesDisabled(async c=>{for(const name of ['subjects','subjectChecks']){const exists=(await sdk.getDoc(sdk.doc(c.firestore(),root,name,'MAX'))).exists();evidence[name+'Exists']=exists;assert.equal(exists,!error)}})
  fs.writeFileSync('.tools/slot-bc-evidence.json',JSON.stringify(evidence,null,2)+'\n');t.diagnostic(JSON.stringify(evidence))
  if(error)throw error
 }finally{await e.cleanup()}
})
