'use strict'
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process')
const {spawnOwned}=require('./process-tree.cjs')
const fixture=path.join(__dirname,'process.fixture.cjs'),delay=ms=>new Promise(r=>setTimeout(r,ms))
async function until(check,message){const end=Date.now()+15000;while(Date.now()<end){if(check())return;await delay(40)}throw Error(message)}
function alive(pid){try{process.kill(pid,0);return true}catch(e){if(e.code==='ESRCH')return false;throw e}}
function temp(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lab process ñ spaces '));return {dir,file:path.join(dir,'tree')}}
async function ready(file){await until(()=>fs.existsSync(file+'.root')&&fs.existsSync(file+'.leaf'),'process fixture not ready');return ['root','leaf'].map(k=>Number(fs.readFileSync(file+'.'+k,'utf8')))}
const options={cwd:__dirname,env:process.env}
test('owned tree stop removes root and descendant; unrelated process survives',async()=>{
 const {dir,file}=temp(),tree=spawnOwned(process.execPath,[fixture,'root',file],options)
 const unrelated=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{env:process.env,stdio:'ignore'})
 try{
  const pids=await ready(file);assert.ok(alive(unrelated.pid))
  await tree.stop();await until(()=>pids.every(p=>!alive(p)),'owned process survived stop')
  assert.ok(alive(unrelated.pid));await tree.stop() // idempotent, no name/port termination
 }finally{await tree.stop();unrelated.kill();await new Promise(ok=>unrelated.once('exit',ok));fs.rmSync(dir,{recursive:true,force:true})}
})
test('startup error returns failure without leaving an owned tree',async()=>{
 const tree=spawnOwned(process.execPath,['-e','process.exit(7)'],options)
 const result=await tree.exited;assert.equal(result.code,7);await tree.stop()
})
test('timeout path stops the entire owned tree',async()=>{
 const {dir,file}=temp(),tree=spawnOwned(process.execPath,[fixture,'root',file],options)
 try{
  const pids=await ready(file)
  const timeout=setTimeout(()=>tree.stop(),20)
  await tree.exited;clearTimeout(timeout);await tree.stop()
  await until(()=>pids.every(p=>!alive(p)),'owned process survived timeout')
 }finally{await tree.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('Windows Job Object removes descendants when its root exits unexpectedly',{skip:process.platform!=='win32'},async()=>{
 const {dir,file}=temp(),tree=spawnOwned(process.execPath,[fixture,'exit-root',file],options)
 try{
  const pids=await ready(file);assert.equal((await tree.exited).code,7)
  await until(()=>pids.every(p=>!alive(p)),'orphan after root exit')
 }finally{await tree.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('Windows Job Object removes descendants after launcher/owner is killed',{skip:process.platform!=='win32'},async()=>{
 const {dir,file}=temp(),owner=spawn(process.execPath,[fixture,'owner',file],{...options,stdio:'ignore'})
 try{
  const pids=await ready(file);owner.kill('SIGKILL')
  await new Promise(ok=>owner.once('exit',ok))
  await until(()=>pids.every(p=>!alive(p)),'orphan after owner death')
 }finally{if(owner.exitCode===null&&owner.signalCode===null)owner.kill('SIGKILL');fs.rmSync(dir,{recursive:true,force:true})}
})
test('Windows Job Object removes descendants if supervisor is forcibly killed',{skip:process.platform!=='win32'},async()=>{
 const {dir,file}=temp(),tree=spawnOwned(process.execPath,[fixture,'root',file],options)
 try{
  const pids=await ready(file);tree.child.kill('SIGKILL');await tree.exited
  await until(()=>pids.every(p=>!alive(p)),'orphan after supervisor death')
 }finally{await tree.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
