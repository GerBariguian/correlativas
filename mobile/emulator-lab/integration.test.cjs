const {test}=require('node:test'),assert=require('node:assert/strict')
const {createClient}=require('./client.cjs'),{seedAuth,seedFirestore}=require('./fixtures.cjs')
const {doc,getDocFromServer,setDoc,runTransaction}=require('firebase/firestore')
const {disconnect,reconnect,loseResponse}=require('./faults.cjs')
test('fixtures, real Auth + Firestore clients, CAS infrastructure probes and transport faults',{timeout:30000},async()=>{
 await seedAuth();await seedFirestore()
 const a=await createClient('device-a'),b=await createClient('device-b'),outsider=await createClient('other-account')
 try{
  await a.signIn('lab-instances');await b.signIn('lab-instances');await outsider.signIn('lab-legacy')
  const path='users/lab-instances/careerInstances/lab-systems/academic/progress'
  assert.equal((await getDocFromServer(doc(a.db,path))).data().revision,7)
  await assert.rejects(getDocFromServer(doc(outsider.db,path)),{code:'permission-denied'})
  await assert.rejects(setDoc(doc(a.db,path),{schemaVersion:1,statusMap:{},revision:8}),{code:'permission-denied'})
  const probe='labInfrastructure/lab-instances/probes/concurrency'
  async function cas(client,expected,cursor){return runTransaction(client.db,async tx=>{const ref=doc(client.db,probe),old=(await tx.get(ref)).data();if(old.revision!==expected)throw Error('LAB_STALE_REVISION');tx.set(ref,{revision:expected+1,cursor,marker:'fixture-only'})})}
  const results=await Promise.allSettled([cas(a,1,1),cas(b,1,2)])
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1)
  const confirmed=(await getDocFromServer(doc(a.db,probe))).data();assert.equal(confirmed.revision,2)
  assert.deepEqual((await getDocFromServer(doc(b.db,probe))).data(),confirmed)
  await disconnect(a);await assert.rejects(getDocFromServer(doc(a.db,probe)));await reconnect(a)
  await assert.rejects(loseResponse(()=>cas(a,2,3)),{code:'LAB_RESULT_UNCERTAIN'})
  assert.equal((await getDocFromServer(doc(b.db,probe))).data().revision,3)
  assert.equal((await getDocFromServer(doc(a.db,path))).data().revision,7)
 }finally{await Promise.all([a.close(),b.close(),outsider.close()])}
})
