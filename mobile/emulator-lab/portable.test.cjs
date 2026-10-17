'use strict'
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs'),{spawnSync}=require('node:child_process'),{randomBytes}=require('node:crypto')
const {cleanEnvironment,assertEnvironment}=require('./policy.cjs'),{guardOption}=require('./process-tree.cjs'),{localSocket}=require('./ipc.cjs')
require('./net-guard.cjs')
test('Windows environment casing and isolated credential discovery paths',()=>{
 const env=cleanEnvironment({Path:'fixture-path',SystemRoot:'C:\\Windows',HOME:'must-not-inherit',APPDATA:'must-not-inherit',gOoGlE_Application_credentials:'must-not-inherit',https_proxy:'must-not-inherit'})
 assert.equal(env.PATH,'fixture-path');assert.equal(env.SYSTEMROOT,'C:\\Windows')
 for(const key of ['HOME','USERPROFILE','APPDATA','LOCALAPPDATA','CLOUDSDK_CONFIG','XDG_CONFIG_HOME'])assert.ok(env[key].includes('emulator-lab'))
 assertEnvironment(env)
 for(const key of ['gOoGlE_Application_credentials','firebase_token','vite_secret','google_oauth_access_token'])assert.throws(()=>assertEnvironment({...env,[key]:'fixture'}),/CREDENTIAL/)
 assert.throws(()=>cleanEnvironment({PATH:'one',Path:'two'}),/AMBIGUOUS/)
})
test('IPC policy allows only pinned local Windows pipes and canonical Unix sockets',()=>{
 const pipe=String.raw`\\?\pipe\fire_emu_0123456789abcdef`
 assert.ok(localSocket(pipe,'win32'))
 for(const p of [String.raw`\\remote\pipe\fire_emu_0123456789abcdef`,String.raw`\\.\pipe\anything`,pipe+'x',pipe+'\\tail',pipe.replace('?','server'),pipe.replace('0123456789abcdef','abcd')])assert.equal(localSocket(p,'win32'),false,p)
 const file=path.join(os.tmpdir(),'fire_emu_0123456789abcdef.sock')
 assert.ok(localSocket(file,'linux',os.tmpdir()))
 for(const p of [file+'/../other.sock',file+'.x',path.join(os.tmpdir(),'not-allowed.sock')])assert.equal(localSocket(p,'linux',os.tmpdir()),false)
})
test('actual local Functions-style IPC roundtrip with guard enabled',async()=>{
 const net=require('node:net'),id=randomBytes(8).toString('hex')
 const file=process.platform==='win32'?String.raw`\\?\pipe\fire_emu_${id}`:path.join(os.tmpdir(),`fire_emu_${id}.sock`)
 const server=net.createServer(socket=>socket.end('local-only'))
 try{
  await new Promise((ok,bad)=>{server.once('error',bad);server.listen(file,ok)})
  let data='';await new Promise((ok,bad)=>{const client=net.connect(file);client.on('data',x=>data+=x);client.once('error',bad);client.once('end',ok)})
  assert.equal(data,'local-only')
 }finally{await new Promise(ok=>server.close(ok));if(process.platform!=='win32')fs.rmSync(file,{force:true})}
})
test('preload survives spaces and Unicode, and fails closed with missing environment',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lab guard ñ spaces '))
 try{
  for(const file of ['net-guard.cjs','ipc.cjs','policy.cjs'])fs.copyFileSync(path.join(__dirname,file),path.join(directory,file))
  const env={...process.env,NODE_OPTIONS:guardOption(path.join(directory,'net-guard.cjs'))}
  const code="const assert=require('node:assert/strict');assert.throws(()=>fetch('https://firestore.googleapis.com'),/LAB_BLOCKED/);assert.throws(()=>require('node:net').connect({host:'8.8.8.8',port:443}),/LAB_BLOCKED/)"
  const good=spawnSync(process.execPath,['-e',code],{env,encoding:'utf8',timeout:15000})
  assert.equal(good.status,0,good.stderr)
  delete env.FIRESTORE_EMULATOR_HOST
  const bad=spawnSync(process.execPath,['-e','throw Error("must not run")'],{env,encoding:'utf8',timeout:15000})
  assert.notEqual(bad.status,0);assert.match(bad.stderr,/LAB_REFUSES/);assert.doesNotMatch(bad.stderr,/Error: must not run/)
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
})
test('launcher rejects host/project overrides before starting services',()=>{
 for(const args of [['auth-test','--project','real-project'],['auth-test','--host','0.0.0.0'],['unknown']]){
  const result=spawnSync(process.execPath,[path.join(__dirname,'run.cjs'),...args],{env:process.env,encoding:'utf8',timeout:10000})
  assert.notEqual(result.status,0);assert.match(result.stderr,/no project\/host overrides accepted/)
 }
})
test('occupied emulator port makes launcher abort without killing its owner',async()=>{
 const net=require('node:net'),server=net.createServer()
 await new Promise((ok,bad)=>{server.once('error',bad);server.listen(9199,'127.0.0.1',ok)})
 try{
  const result=spawnSync(process.execPath,[path.join(__dirname,'run.cjs'),'auth-test'],{env:process.env,encoding:'utf8',timeout:15000})
  assert.notEqual(result.status,0);assert.match(result.stderr,/LAB_PORT_OCCUPIED_9199/);assert.ok(server.listening)
 }finally{await new Promise(ok=>server.close(ok))}
})
test('local env files, including Windows case variants, abort before emulator startup',()=>{
 const file=path.join(__dirname,'.ENV.lab-isolation-test')
 fs.writeFileSync(file,'FIXTURE_ONLY=1\n',{flag:'wx'})
 try{
  const result=spawnSync(process.execPath,[path.join(__dirname,'run.cjs'),'auth-test'],{env:process.env,encoding:'utf8',timeout:15000})
  assert.notEqual(result.status,0);assert.match(result.stderr,/LAB_REFUSES_LOCAL_ENV_FILES/)
 }finally{fs.rmSync(file)}
})
