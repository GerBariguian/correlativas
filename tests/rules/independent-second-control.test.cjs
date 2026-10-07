// Diagnostic only: preserve the expectation that a valid second invitation succeeds.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {independent}=require('./fixtures/independent-invitations.cjs')
const {sdk,h,inputs,read,transition,write,activate,create}=require('./fixtures/independent-invitations-harness.cjs')
const rules=independent(fs.readFileSync('firestore.rules','utf8'))
async function snapshot(e){let result;await e.withSecurityRulesDisabled(async c=>{
 const paths=['jointPlans/p','users/one/activityInbox/jp_p_1','users/two/activityInbox/jp_p_2']
 result=await Promise.all(paths.map(async p=>{const s=await sdk.getDoc(sdk.doc(c.firestore(),p));return s.exists()?s.data():null}))
});return result}
for(const orientation of ['direct','inverse','mixed']) {
 let reference
 for(const mode of ['transaction','batch'])test(`${orientation}: second invitation ${mode}`,async t=>{
  const e=await h.initialize(rules)
  try {
   const fixture=inputs(orientation),untouched=JSON.stringify(fixture)
   await e.clearFirestore();await h.seed(e,fixture);await create(e)
   await activate(e,'owner','one') // Exactly the same preparation in A and B.
   const before=await snapshot(e)
   assert.equal(before[0].invitationSerial,1);assert.deepEqual(before[0].inviteeIds,['one'])
   assert.equal(before[1].occurrence,1);assert.equal(before[2],null)
   // Only server-generated instants differ between independent preparations.
   const semantic=JSON.stringify(before, (k,v)=>['createdAt','updatedAt'].includes(k)?'<server time>':v)
   if(reference)assert.equal(semantic,reference);else reference=semantic
   assert.equal(JSON.stringify(fixture),untouched)
   const trace=[];let error
   try {
    if(mode==='transaction')await activate(e,'owner','two','p',trace)
    else await write(e,'owner','two',transition(await read(e),'owner','two','cycle_unique_0002'))
   }catch(x){error=x}
   const after=await snapshot(e)
   if(error)assert.deepEqual(after,before)
   t.diagnostic(JSON.stringify({orientation,mode,code:error?.code,message:error?.message,trace,
    expressions:/1000 expressions/.test(error?.message||''),serviceCall:/Service call error/i.test(error?.message||''),
    getAfter:/getAfter/.test(error?.message||''),accessCall:/access.call|too many.*call/i.test(error?.message||''),
    parentUnchanged:JSON.stringify(after[0])===JSON.stringify(before[0]),serial:after[0].invitationSerial,
    occurrence2:after[0].invitationOccurrences.two??null,activity2:after[2]!==null,activity1Unchanged:JSON.stringify(after[1])===JSON.stringify(before[1])}))
   assert.equal(error,undefined)
  }finally{await e.cleanup()}
 })
}
