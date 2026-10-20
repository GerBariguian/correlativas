'use strict'
const {resolve,join}=require('node:path'),{mkdirSync,mkdtempSync,readdirSync,readFileSync,writeFileSync,rmSync}=require('node:fs'),net=require('node:net')
const {PROJECT,cleanEnvironment,localURL}=require('./policy.cjs')
const {spawnOwned,guardOption}=require('./process-tree.cjs')
const {artifact}=require('./artifact.cjs')
const ROOT=resolve(__dirname,'../..'),OUT=join(ROOT,'.tools/emulator-lab'),GUARD=join(__dirname,'net-guard.cjs'),mode=process.argv[2]
const allowed=['unit','process-test','test','auth-test','start','clean']
if(process.argv.length!==3||!allowed.includes(mode))throw Error('Use run.cjs unit|process-test|test|auth-test|start|clean; no project/host overrides accepted')
mkdirSync(OUT,{recursive:true})
const home=mkdtempSync(join(OUT,'home-'))
const env={...cleanEnvironment(),HOME:home,USERPROFILE:home,APPDATA:join(home,'AppData','Roaming'),LOCALAPPDATA:join(home,'AppData','Local'),CLOUDSDK_CONFIG:join(home,'gcloud'),XDG_CONFIG_HOME:join(home,'config'),FIREBASE_EMULATORS_PATH:join(OUT,'cache'),NODE_OPTIONS:guardOption(GUARD)}
for(const key of ['APPDATA','LOCALAPPDATA','CLOUDSDK_CONFIG','XDG_CONFIG_HOME'])mkdirSync(env[key],{recursive:true})
async function runNode(args){
 const owned=spawnOwned(process.execPath,args,{cwd:ROOT,env})
 let timer,interrupted=false
 const interrupt=()=>{interrupted=true;owned.stop().catch(e=>console.error(e.message))}
 process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt)
 try{
  const result=await Promise.race([owned.exited,new Promise((_,bad)=>{timer=setTimeout(()=>bad(Error('LAB_CHILD_TIMEOUT')),60000)})])
  if(interrupted||result.code!==0)throw Error('LAB_CHILD_FAILED_'+result.code)
 }finally{clearTimeout(timer);await owned.stop();process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt)}
}
async function portsFree(){for(const port of [9199,8188,5101,4501,4601,8255])await new Promise((ok,bad)=>{const s=net.createServer();s.once('error',()=>bad(Error('LAB_PORT_OCCUPIED_'+port)));s.listen(port,'127.0.0.1',()=>s.close(ok))})}
function validateConfig(){
 const c=JSON.parse(readFileSync(join(__dirname,'firebase.json')))
 const expected={functions:[{source:'functions',codebase:'emulator-lab',runtime:'nodejs24'}],firestore:{rules:'lab.rules'},emulators:{auth:{host:'127.0.0.1',port:9199},firestore:{host:'127.0.0.1',port:8188,websocketPort:8255},functions:{host:'127.0.0.1',port:5101},hub:{host:'127.0.0.1',port:4501},logging:{host:'127.0.0.1',port:4601},ui:{enabled:false},singleProjectMode:true}}
 if(!require('node:util').isDeepStrictEqual(c,expected))throw Error('LAB_CONFIG_CHANGED')
}
async function main(){
 if(mode==='clean'){
  await portsFree();for(const name of ['test-result.json','auth-test-result.json','firebase-debug.log','firestore-debug.log','logs'])rmSync(join(OUT,name),{recursive:true,force:true});console.log('Only generated lab reports/logs cleaned; artifact cache preserved');return
 }
 if(mode==='unit'){await runNode(['--test',...['unit.test.cjs','portable.test.cjs','artifact.test.cjs','functions-discovery.test.cjs'].map(f=>join(__dirname,f))]);return}
 if(mode==='process-test'){await runNode(['--test',join(__dirname,'process.test.cjs')]);return}
 validateConfig();
 for(const directory of [__dirname,join(__dirname,'functions')])if(readdirSync(directory).some(f=>/^\.env(?:\.|$)|^\.secret\.local$/i.test(f)))throw Error('LAB_REFUSES_LOCAL_ENV_FILES')
 if(mode!=='auth-test')artifact(env.FIREBASE_EMULATORS_PATH);await portsFree()
 const cli=process.platform==='win32'?join(__dirname,'functions-cli-bootstrap.cjs'):resolve(ROOT,'node_modules/firebase-tools/lib/bin/firebase.js')
 const owned=spawnOwned(process.execPath,[cli,'emulators:start','--only',mode==='auth-test'?'auth,functions':'auth,firestore,functions','--project',PROJECT,'--config',join(__dirname,'firebase.json'),'--non-interactive'],{cwd:__dirname,env})
 let childResult=null
 // Only fixed classifications/codes are logged, never error messages or bodies.
 const probeError=error=>{
  const code=error?.cause?.code??error?.code
  return {error:error?.name==='TimeoutError'?'timeout':error?.name==='AbortError'?'aborted':'request-failed',
   code:['ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENOTFOUND','EACCES','EPERM','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET','ABORT_ERR'].includes(code)?code:'UNCLASSIFIED'}
 }
 owned.exited.then(result=>{childResult={code:result.code,signal:result.signal??null}},error=>{childResult={supervisorError:probeError(error)}})
 let interrupted=false
 const signal=()=>{interrupted=true;owned.stop().catch(e=>console.error(e.message))}
 process.once('SIGINT',signal);process.once('SIGTERM',signal)
 try{
  const started=Date.now(),until=started+180000;let ready=false
  let lastFunctions={state:'not-probed'},lastAuth={state:'not-probed'}
  while(Date.now()<until&&!owned.closed&&!interrupted){
   let functionsReady=false,authReady=false
   try{
    const r=await fetch(localURL('functions',`/${PROJECT}/us-central1/backendHarness/health`),{signal:AbortSignal.timeout(700)})
    lastFunctions={status:r.status,json:'invalid'}
    let d
    try{d=await r.json();lastFunctions={status:r.status,json:'valid',projectMatches:d?.project===PROJECT,emulatorOnly:d?.emulatorOnly===true}}catch(error){lastFunctions={status:r.status,json:'invalid',...probeError(error)}}
    functionsReady=r.ok&&d?.project===PROJECT&&d?.emulatorOnly===true
   }catch(error){lastFunctions=probeError(error)}
   // Probe independently so Functions failure does not hide Auth's last result.
   try{
    const a=await fetch(localURL('auth','/'),{signal:AbortSignal.timeout(700)})
    lastAuth={status:a.status};authReady=a.status<500
   }catch(error){lastAuth=probeError(error)}
   if(functionsReady&&authReady&&!owned.closed&&!interrupted){ready=true;break}
   await new Promise(r=>setTimeout(r,150))
  }
  if(interrupted)throw Error('LAB_INTERRUPTED')
  if(!ready){
   const reason=owned.closed?'supervised-process-ended':'readiness-timeout'
   console.error('LAB_STARTUP_DIAGNOSTIC '+JSON.stringify({reason,elapsedMs:Date.now()-started,readinessBudgetMs:180000,process:childResult,functions:lastFunctions,auth:lastAuth}))
   throw Error('LAB_STARTUP_FAILED: '+reason+'; no UI or remote fallback')
  }
  if(mode==='start'){
   await runNode([join(__dirname,'seed.cjs')])
   console.log('LAB READY: only fixture data; Ctrl+C stops only this owned process tree. No product integration.')
   const result=await owned.exited;if(!interrupted&&result.code!==0)throw Error('LAB_EMULATORS_STOPPED');return
  }
  const file=mode==='auth-test'?'auth.test.cjs':'integration.test.cjs'
  await runNode(['--test',join(__dirname,file)])
  writeFileSync(join(OUT,mode+'-result.json'),JSON.stringify({project:PROJECT,mode,passed:true,firestoreTested:mode==='test',time:new Date().toISOString()},null,2)+'\n')
 }finally{
  await owned.stop()
  await portsFree()
  process.removeListener('SIGINT',signal);process.removeListener('SIGTERM',signal)
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>rmSync(home,{recursive:true,force:true,maxRetries:5,retryDelay:200}))
