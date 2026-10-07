const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {independent}=require('./fixtures/independent-invitations.cjs'),{sdk,h,db,inputs,base,read,transition,write,activate,joinPatch,create}=require('./fixtures/independent-invitations-harness.cjs')
const rules=()=>independent(fs.readFileSync('firestore.rules','utf8'))
test('new contract: base plus four independent activations',async t=>{
 const r=rules();fs.writeFileSync('.tools/independent-invitations.rules',r);const e=await h.initialize(r)
 try{for(const o of ['direct','inverse','mixed'])await t.test(o,async t=>{
 await e.clearFirestore();await h.seed(e,inputs(o));await h.assertSucceeds(create(e))
  for(const uid of ['one','two','three','four']) {
 const before=await read(e),trace=[]
 try { await h.assertSucceeds(activate(e,'owner',uid,'p',trace)); t.diagnostic(JSON.stringify({orientation:o,uid,status:'sent',trace})) }
 catch(error) {
   assert.deepEqual(await read(e),before)
   assert.equal((await sdk.getDocs(sdk.collection(db(e,uid),'users',uid,'activityInbox'))).size,0)
   t.diagnostic(JSON.stringify({orientation:o,uid,status:'failed',trace,expressions:/1000 expressions/.test(error.message),noPartialWrite:true}))
   throw error
 }
 }
 const p=await read(e);assert.equal(p.inviteeIds.length,4);assert.equal(p.invitationSerial,4)
 for(const uid of p.inviteeIds)assert.equal((await sdk.getDocs(sdk.collection(db(e,uid),'users',uid,'activityInbox'))).size,1)
 })}finally{await e.cleanup()}
})

test('isolate first activation as atomic batch with identical payload',async()=>{
 const e=await h.initialize(rules());try{await e.clearFirestore();await h.seed(e,inputs());await create(e);const p=await read(e);await h.assertSucceeds(write(e,'owner','one',transition(p,'owner','one','cycle_unique_0001')))}finally{await e.cleanup()}
})

test('isolate failing second activation as atomic batch with identical payload',async()=>{
 const e=await h.initialize(rules());try{
 await e.clearFirestore();await h.seed(e,inputs());await create(e)
 await write(e,'owner','one',transition(await read(e),'owner','one','cycle_unique_0001'))
 const before=await read(e);let error
 try{await write(e,'owner','two',transition(before,'owner','two','cycle_unique_0002'))}catch(x){error=x}
 if(error){assert.deepEqual(await read(e),before);assert.equal((await sdk.getDocs(sdk.collection(db(e,'two'),'users/two/activityInbox'))).size,0)}
 assert.equal(error,undefined)
 }finally{await e.cleanup()}
})
