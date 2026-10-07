// DIAGNOSTIC ONLY: a reduced-fixture PASS is not a product PASS.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {variant}=require('./fixtures/second-dissection.cjs')
const {sdk,h,inputs,read,transition,write,activate,create}=require('./fixtures/independent-invitations-harness.cjs')
const original=fs.readFileSync('firestore.rules','utf8')
for(const name of (process.env.DISSECTION_CASES||'baseline,activity-true,parent-true,shape-true,transition-true').split(','))test(name,async t=>{
 let e=await h.initialize(variant(original,'baseline'))
 try{
  await e.clearFirestore();await h.seed(e,inputs());await create(e);await activate(e,'owner','one')
  if(name==='no-history')await e.withSecurityRulesDisabled(c=>sdk.deleteDoc(sdk.doc(c.firestore(),'users/one/activityInbox/jp_p_1')))
  const before=await read(e);await e.cleanup();e=await h.initialize(variant(original,name))
  const next=transition(before,'owner','two','cycle_unique_0002')
  if(name==='new-first')next.inviteeIds=['two','one'] // DIAGNOSTIC: same members/maps, different position only.
  let error;try{await write(e,'owner','two',next)}catch(x){error=x}
  t.diagnostic(JSON.stringify({name,pass:!error,expressions:/1000 expressions/.test(error?.message||''),message:error?.message}))
  if(error)assert.deepEqual(await read(e),before)
  if(name==='baseline')assert.equal(error,undefined)
  else if(error&&!/1000 expressions/.test(error.message))throw error // Stop: potential hidden logical rejection.
 }finally{await e.cleanup()}
})
