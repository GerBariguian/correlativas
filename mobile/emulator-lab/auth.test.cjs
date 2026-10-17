const {test}=require('node:test'),assert=require('node:assert/strict')
const {createClient}=require('./client.cjs'),{seedAuth}=require('./fixtures.cjs'),{localURL,PROJECT}=require('./policy.cjs')
test('two independent Auth clients and emulated backend probe; no career/academic operation',{timeout:20000},async()=>{
 await seedAuth();const a=await createClient('auth-a',{authOnly:true}),b=await createClient('auth-b',{authOnly:true})
 try{
  await a.signIn('lab-instances');await b.signIn('lab-instances');assert.notEqual(a.app,b.app);assert.notEqual(a.auth,b.auth)
  assert.equal(a.auth.currentUser.uid,b.auth.currentUser.uid)
  await require('firebase/auth').signOut(a.auth);assert.equal(b.auth.currentUser.uid,'lab-instances');await a.signIn('lab-instances')
  // Auth availability must never make a missing Firestore emulator fall back remotely.
  const before=require('firebase/app').getApps().length
  await assert.rejects(createClient('missing-firestore'));assert.equal(require('firebase/app').getApps().length,before)
  const base=`/${PROJECT}/us-central1/backendHarness`
  let r=await fetch(localURL('functions',base+'/health'));assert.equal(r.status,200);assert.equal((await r.json()).careerCreationImplemented,false)
  r=await fetch(localURL('functions',base+'/probe'));assert.equal(r.status,401)
  r=await fetch(localURL('functions',base+'/probe'),{headers:{Authorization:'Bearer invalid-local-token'}});assert.equal(r.status,401)
  const headers={Authorization:'Bearer '+await a.auth.currentUser.getIdToken()}
  r=await fetch(localURL('functions',base+'/probe'),{headers});assert.equal(r.status,200);assert.equal((await r.json()).writes,0)
  r=await fetch(localURL('functions',base+'/careers'),{method:'POST',headers});assert.equal(r.status,501)
  r=await fetch(localURL('functions',base+'/academic'),{method:'POST',headers});assert.equal(r.status,501)
 }finally{await Promise.all([a.close(),b.close()])}
})
