const {test}=require('node:test'),assert=require('node:assert/strict')
const {PROJECT,HOSTS,assertEnvironment,localURL,cleanEnvironment}=require('./policy.cjs')
const {fixtureDocuments}=require('./fixtures.cjs'),{Timestamp}=require('firebase/firestore')
const {validate}=require('./net-guard.cjs')
test('environment is explicit, scrubbed, demo-only and fails closed',()=>{
 assertEnvironment(cleanEnvironment({PATH:process.env.PATH,VITE_FIREBASE_API_KEY:'must-not-inherit',GOOGLE_APPLICATION_CREDENTIALS:'must-not-inherit',NODE_OPTIONS:'must-not-inherit',FIREBASE_TOKEN:'must-not-inherit',HTTPS_PROXY:'must-not-inherit'}))
 assert.throws(()=>assertEnvironment({}))
 for(const key of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST','LAB_EMULATOR_ONLY']){
  assert.throws(()=>assertEnvironment({...cleanEnvironment(),[key]:'unsafe'}))
  const e=cleanEnvironment();delete e[key];assert.throws(()=>assertEnvironment(e))
 }
 assert.throws(()=>assertEnvironment({...cleanEnvironment(),FIREBASE_CONFIG:JSON.stringify({projectId:'not-a-demo'})}))
 for(const key of ['VITE_FIREBASE_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_TOKEN'])assert.throws(()=>assertEnvironment({...cleanEnvironment(),[key]:'fixture-not-a-secret'}))
})
test('URL builder rejects unknown destinations and authority injection',()=>{
 assert.equal(localURL('auth','/health'),'http://'+HOSTS.auth+'/health')
 for(const p of ['https://example.invalid','//example.invalid','\\\\example.invalid'])assert.throws(()=>localURL('auth',p))
 assert.throws(()=>localURL('production','/'))
})
test('network guard rejects HTTP, raw sockets, TLS and fetch before remote access',async()=>{
 const net=require('node:net'),tls=require('node:tls'),http=require('node:http'),https=require('node:https')
 for(const host of ['firestore.googleapis.com','identitytoolkit.googleapis.com','169.254.169.254','8.8.8.8']){
  assert.throws(()=>validate([{host,port:443}]),/LAB_BLOCKED/)
  assert.throws(()=>net.connect({host,port:443}),/LAB_BLOCKED/)
  assert.throws(()=>tls.connect({host,port:443}),/LAB_BLOCKED/)
  assert.throws(()=>http.get('http://'+host),/LAB_BLOCKED/)
  assert.throws(()=>https.get('https://'+host),/LAB_BLOCKED/)
  assert.throws(()=>fetch('https://'+host),/LAB_BLOCKED/)
 }
 assert.throws(()=>net.connect('/tmp/not-allowed.sock'),/LAB_BLOCKED/)
})
test('fixtures include legacy, independent active/archived plans, recorded Pending and stale revision scenario',()=>{
 const f=fixtureDocuments(Timestamp)
 assert.equal(f['users/lab-legacy/careers/utn-sistemas-2023'].writeRevision,3)
 const root='users/lab-instances/careerInstances/'
 assert.equal(f[root+'lab-systems/academic/progress'].revision,7)
 assert.equal(f[root+'lab-systems/academic/progress'].statusMap['UTN-ISI23-04'],'Pendiente')
 assert.equal(f[root+'lab-industrial07'].lifecycle,'archived')
 assert.equal(f[root+'lab-industrial23'].catalogId,'utn-industrial-2023')
 assert.equal(f['migrationUsers/lab-blocked'].phase,'blocked')
 assert.equal(f['users/lab-empty'].activeCareerInstanceId,null)
 assert.ok(PROJECT.startsWith('demo-'))
})
test('loss-of-response harness does not turn completion into a success response or retry',async()=>{
 let count=0;await assert.rejects(require('./faults.cjs').loseResponse(async()=>{count++}),{code:'LAB_RESULT_UNCERTAIN'});assert.equal(count,1)
})

test('missing emulator prevents client initialization instead of creating a remote app',async()=>{
 const {getApps}=require('firebase/app'),before=getApps().length
 const old={...process.env};Object.assign(process.env,cleanEnvironment())
 for(const key of Object.keys(process.env))if(/^(VITE_|GOOGLE_APPLICATION_CREDENTIALS$|FIREBASE_TOKEN$)/.test(key))delete process.env[key]
 try{await assert.rejects(require('./client.cjs').createClient('must-not-start'));assert.equal(getApps().length,before)}
 finally{for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,old)}
})
test('temporary SDK listeners, including wildcard requests, are forced to loopback',async()=>{
 const net=require('node:net'),server=net.createServer()
 await new Promise(ok=>server.listen(0,ok));assert.equal(server.address().address,'127.0.0.1');await new Promise(ok=>server.close(ok))
 const wildcard=net.createServer();await new Promise(ok=>wildcard.listen({port:0,host:'0.0.0.0'},ok));assert.equal(wildcard.address().address,'127.0.0.1');await new Promise(ok=>wildcard.close(ok))
 const remoteBind=net.createServer();await new Promise(ok=>remoteBind.listen({port:0,host:'example.invalid'},ok));assert.equal(remoteBind.address().address,'127.0.0.1');await new Promise(ok=>remoteBind.close(ok))
})
