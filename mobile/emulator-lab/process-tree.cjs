'use strict'
const {spawn}=require('node:child_process'),{readFileSync,existsSync}=require('node:fs'),{join,isAbsolute}=require('node:path')
const delay=ms=>new Promise(r=>setTimeout(r,ms))
async function waitExit(exited,milliseconds,message){
 let timer
 try{return await Promise.race([exited,new Promise((_,bad)=>{timer=setTimeout(()=>bad(Error(message)),milliseconds)})])}
 finally{clearTimeout(timer)}
}
function guardOption(file){return '--require='+JSON.stringify(process.platform==='win32'?file.replaceAll('\\','/'):file)}
function spawnOwned(exe,args,options){
 let child
 if(process.platform==='win32'){
  const root=options.env.SYSTEMROOT
  if(!root||!isAbsolute(root))throw Error('LAB_WINDOWS_SYSTEMROOT_REQUIRED')
  const powershell=join(root,'System32','WindowsPowerShell','v1.0','powershell.exe')
  if(!existsSync(powershell))throw Error('LAB_WINDOWS_POWERSHELL_REQUIRED')
  const spec=Buffer.from(JSON.stringify({exe,args,cwd:options.cwd,parent:process.pid})).toString('base64')
  child=spawn(powershell,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(readFileSync(join(__dirname,'windows-job.ps1'),'utf8'),'utf16le').toString('base64')],{...options,env:{...options.env,LAB_OWNED_SPEC:spec},stdio:['pipe','inherit','inherit'],windowsHide:true})
 }else{
  child=spawn(exe,args,{...options,stdio:'inherit',detached:true})
 }
 let closed=false
 const exited=new Promise((ok,bad)=>{child.once('error',e=>{closed=true;bad(e)});child.once('exit',(code,signal)=>{closed=true;ok({code,signal})})})
 // Track even startup failures immediately, avoiding an unhandled rejection.
 exited.catch(()=>{})
 let stopping
 async function stop(){
  if(stopping)return stopping
  stopping=(async()=>{
   if(process.platform==='win32'){
    // Closing our pipe makes the supervisor close its kill-on-close Job Object.
    child.stdin.on('error',()=>{});child.stdin.end()
    await waitExit(exited,10000,'LAB_WINDOWS_SUPERVISOR_STOP_TIMEOUT: inspect owned job; do not kill unrelated processes')
   }else if(child.pid){
    const signal=name=>{try{process.kill(-child.pid,name)}catch(e){if(e.code!=='ESRCH')throw e}}
    signal('SIGTERM');await delay(500);signal('SIGKILL')
    await waitExit(exited,5000,'LAB_PROCESS_STOP_TIMEOUT')
   }
  })()
  return stopping
 }
 return {child,exited,stop,get closed(){return closed}}
}
module.exports={spawnOwned,guardOption}
