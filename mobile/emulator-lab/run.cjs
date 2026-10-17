'use strict'
const {spawn}=require('node:child_process'),{resolve,join}=require('node:path'),{mkdirSync,readFileSync,existsSync,writeFileSync,rmSync}=require('node:fs'),{createHash}=require('node:crypto'),net=require('node:net')
const {PROJECT,HOSTS,cleanEnvironment,localURL}=require('./policy.cjs')
const ROOT=resolve(__dirname,'../..'),OUT=join(ROOT,'.tools/emulator-lab'),GUARD=join(__dirname,'net-guard.cjs'),mode=process.argv[2]
const allowed=['unit','test','auth-test','start','clean']
if(process.argv.length!==3||!allowed.includes(mode))throw Error('Use run.cjs unit|test|auth-test|start|clean; no project/host overrides accepted')
const env={...cleanEnvironment(),XDG_CONFIG_HOME:join(OUT,'config'),FIREBASE_EMULATORS_PATH:join(OUT,'cache'),NODE_OPTIONS:'--require='+GUARD}
mkdirSync(OUT,{recursive:true});mkdirSync(env.XDG_CONFIG_HOME,{recursive:true})
function runNode(args){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{cwd:ROOT,env,stdio:'inherit',timeout:60000});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error('LAB_CHILD_FAILED_'+code)))})}
function artifact(){
 const info=require('../../node_modules/firebase-tools/lib/emulator/downloadableEmulatorInfo.json').firestore,p=join(env.FIREBASE_EMULATORS_PATH,info.downloadPathRelativeToCacheDir)
 if(!existsSync(p))throw Error('LAB_FIRESTORE_ARTIFACT_MISSING: run python3 mobile/emulator-lab/prepare.py; no fallback or auto-download')
 const b=readFileSync(p);if(b.length!==info.expectedSize||createHash('sha256').update(b).digest('hex')!==info.expectedChecksumSHA256)throw Error('LAB_FIRESTORE_ARTIFACT_INVALID')
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
 if(mode==='unit'){await runNode(['--test',join(__dirname,'unit.test.cjs')]);return}
 validateConfig();if(mode!=='auth-test')artifact();await portsFree()
 const cli=resolve(ROOT,'node_modules/firebase-tools/lib/bin/firebase.js')
 const child=spawn(process.execPath,[cli,'emulators:start','--only',mode==='auth-test'?'auth,functions':'auth,firestore,functions','--project',PROJECT,'--config',join(__dirname,'firebase.json'),'--non-interactive'],{cwd:__dirname,env,stdio:'inherit',detached:true})
 let closed=false;child.on('exit',()=>{closed=true});child.on('error',()=>{closed=true})
 const stop=()=>{try{process.kill(-child.pid,'SIGTERM')}catch{}}
 const signal=()=>{stop()};process.once('SIGINT',signal);process.once('SIGTERM',signal)
 try{
  const until=Date.now()+60000;let ready=false
  while(Date.now()<until&&!closed){
   try{
    const r=await fetch(localURL('functions',`/${PROJECT}/us-central1/backendHarness/health`),{signal:AbortSignal.timeout(700)}),d=await r.json()
    const a=await fetch(localURL('auth','/'),{signal:AbortSignal.timeout(700)})
    if(r.ok&&d.project===PROJECT&&d.emulatorOnly===true&&a.status<500){ready=true;break}
   }catch{}
   await new Promise(r=>setTimeout(r,150))
  }
  if(!ready)throw Error('LAB_STARTUP_FAILED: no UI or remote fallback')
  if(mode==='start'){
   await runNode([join(__dirname,'seed.cjs')])
   console.log('LAB READY: only fixture data; Ctrl+C stops this owned process group. No product integration.')
   await new Promise((ok,bad)=>child.once('exit',code=>code===0?ok():bad(Error('LAB_EMULATORS_STOPPED'))));return
  }
  const file=mode==='auth-test'?'auth.test.cjs':'integration.test.cjs'
  await runNode(['--test',join(__dirname,file)])
  writeFileSync(join(OUT,mode+'-result.json'),JSON.stringify({project:PROJECT,mode,passed:true,firestoreTested:mode==='test',time:new Date().toISOString()},null,2)+'\n')
 }finally{
  stop();await new Promise(r=>setTimeout(r,500));try{process.kill(-child.pid,'SIGKILL')}catch{}
  process.removeListener('SIGINT',signal);process.removeListener('SIGTERM',signal)
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
