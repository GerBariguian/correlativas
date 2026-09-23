const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const {spawnSync}=require('node:child_process')
const {transformSync}=require('rolldown/utils')
const source=fs.readFileSync('src/firebaseRuntime.js','utf8').replace(/export /g,'')
const select=new Function(source+';return selectFirebaseRuntime')()
const local={protocol:'http:',hostname:'127.0.0.1',port:'5174'}
const env={MODE:'development',DEV:true,VITE_FIREBASE_API_KEY:'original-key',VITE_FIREBASE_AUTH_DOMAIN:'original-domain',VITE_FIREBASE_PROJECT_ID:'original-project',VITE_FIREBASE_STORAGE_BUCKET:'original-bucket',VITE_FIREBASE_MESSAGING_SENDER_ID:'original-sender',VITE_FIREBASE_APP_ID:'original-app'}
test('firebase normal development and production preserve all original env values',()=>{
 for(const mode of ['development','production']) {
  const result=select({...env,MODE:mode,DEV:mode==='development'},{port:'5173'})
  assert.equal(result.emulator,false);assert.deepEqual(result.config,{apiKey:'original-key',authDomain:'original-domain',projectId:'original-project',storageBucket:'original-bucket',messagingSenderId:'original-sender',appId:'original-app'});assert.equal(result.authUrl,undefined)
 }
})
test('firebase emulator never reads real Firebase environment and fixes all endpoints',()=>{
 const guarded=new Proxy({MODE:'emulator',DEV:true},{get:(obj,key)=>{if(String(key).startsWith('VITE_FIREBASE_'))assert.fail('read real environment');return obj[key]}})
 const runtime=select(guarded,local)
 assert.equal(runtime.config.projectId,'demo-correlativas-manual');assert.equal(runtime.config.apiKey,'fake-api-key-correlativas-manual');assert.equal(runtime.authUrl,'http://127.0.0.1:9099');assert.equal(runtime.firestoreHost,'127.0.0.1');assert.equal(runtime.firestorePort,8088)
 assert.equal(JSON.stringify(runtime).includes('original'),false)
})
test('firebase emulator fails outside DEV and outside fixed loopback origin',()=>{
 for(const DEV of [false,undefined,'true'])assert.throws(()=>select({MODE:'emulator',DEV},local),/EMULATOR_REQUIRES_DEV/)
 for(const location of [undefined,{...local,hostname:'localhost'},{...local,hostname:'example.com'},{...local,port:'5173'},{...local,protocol:'https:'}])assert.throws(()=>select({MODE:'emulator',DEV:true},location),/EMULATOR_REQUIRES_HTTP/)
 assert.throws(()=>select(env,local),/PORT_5174_RESERVED/)
})
function bootstrap(emulator,fail=false){
 const calls=[],api={selectFirebaseRuntime:select,env:emulator?{...env,MODE:'emulator'}:env,globalThis:{location:emulator?local:{port:'5173'}},
 initializeApp:config=>{calls.push(['app',config]);return 'app'},getAuth:()=>{calls.push(['getAuth']);return 'auth'},initializeAuth:(_,options)=>{calls.push(['initializeAuth',options]);return 'auth'},inMemoryPersistence:'memory',browserPopupRedirectResolver:'popup',getFirestore:()=>{calls.push(['getFirestore']);return 'db'},connectAuthEmulator:(_,url)=>{calls.push(['authEndpoint',url]);if(fail)throw Error('local failure')},connectFirestoreEmulator:(_,host,port)=>calls.push(['dbEndpoint',host,port]),GoogleAuthProvider:class{constructor(){calls.push(['provider'])}}}
 vm.createContext(api)
 const s=fs.readFileSync('src/firebase.js','utf8').replace(/import[\s\S]*?from ['"][^'"]+['"]\s*/g,'').replace(/export /g,'').replace(/import.meta.env/g,'env')
 return {calls,run:()=>vm.runInContext(s,api)}
}
test('firebase bootstrap connects BOTH before consumers and keeps popup with memory Auth',()=>{
 const h=bootstrap(true);h.run();assert.deepEqual(h.calls.map(c=>c[0]),['app','initializeAuth','getFirestore','authEndpoint','dbEndpoint','provider']);assert.deepEqual(JSON.parse(JSON.stringify(h.calls[1][1])),{persistence:'memory',popupRedirectResolver:'popup'})
})
test('firebase normal bootstrap retains getAuth and never connects emulators',()=>{
 const h=bootstrap(false);h.run();assert.deepEqual(h.calls.map(c=>c[0]),['app','getAuth','getFirestore','provider'])
})
test('firebase failed emulator connection aborts without normal Auth fallback',()=>{
 const h=bootstrap(true,true);assert.throws(h.run,/local failure/);assert.equal(h.calls.some(c=>c[0]==='getAuth'||c[0]==='provider'),false)
})
test('firebase manual config and launch script agree without changing Rules test runner',()=>{
 const config=JSON.parse(fs.readFileSync('firebase.emulators.json','utf8').replace(/^\uFEFF/,''))
 assert.deepEqual(config.firestore,{rules:'firestore.rules',indexes:'firestore.indexes.json'})
 assert.deepEqual(config.emulators,{auth:{host:'127.0.0.1',port:9099},firestore:{host:'127.0.0.1',port:8088},ui:{enabled:true,host:'127.0.0.1',port:4000},singleProjectMode:true})
 assert.equal(JSON.parse(fs.readFileSync('package.json')).scripts['dev:emulator'],'vite --mode emulator --host 127.0.0.1 --port 5174 --strictPort')
 assert.equal(JSON.parse(fs.readFileSync('firebase.rules-test.json')).emulators.auth,undefined)
})
test('firebase indicator is rendered exclusively for selected emulator runtime',()=>{
 for(const isEmulator of [false,true]){
 const context={isEmulator,h:(type,props,...children)=>({type,props,children})};vm.createContext(context)
 const code=fs.readFileSync('src/components/EmulatorIndicator.jsx','utf8').replace(/import[^\n]+\n/,'').replace('export default ','')
 vm.runInContext(transformSync('indicator.jsx',code,{jsx:{runtime:'classic',pragma:'h'}}).code,context)
 const result=context.EmulatorIndicator();if(isEmulator)assert.equal(result.children[0],'Emulator local');else assert.equal(result,null)
 }
})
test('firebase real Vite build rejects emulator mode before bundling',()=>{
 const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--mode','emulator'],{encoding:'utf8',windowsHide:true})
 assert.notEqual(result.status,0);assert.match(result.stdout+result.stderr,/EMULATOR_BUILD_FORBIDDEN/)
})
test('firebase Vite config excludes real VITE variables only in emulator mode',()=>{
 const config=new Function(fs.readFileSync('vite.config.js','utf8').replace('export default ','')+';return config')()
 assert.deepEqual(config({command:'serve',mode:'emulator'}),{envPrefix:'CORRELATIVAS_EMULATOR_PUBLIC_'})
 for(const command of ['serve','build'])assert.deepEqual(config({command,mode:'production'}),{define:{__SOCIAL_MAINTENANCE__:false}})
 assert.throws(()=>config({command:'build',mode:'emulator'}),/EMULATOR_BUILD_FORBIDDEN/)
})
