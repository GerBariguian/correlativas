'use strict'
// Synthetic local process tree only. Never launches Firebase or accesses the network.
const fs=require('node:fs'),{spawn}=require('node:child_process'),{spawnOwned}=require('./process-tree.cjs')
const [mode,file]=process.argv.slice(2)
if(mode==='leaf'){
 fs.writeFileSync(file+'.leaf',String(process.pid));setInterval(()=>{},1000)
}else if(mode==='root'||mode==='exit-root'){
 const leaf=spawn(process.execPath,[__filename,'leaf',file],{env:process.env,stdio:'ignore'})
 leaf.on('error',()=>process.exit(2))
 process.on('SIGTERM',()=>{leaf.kill();leaf.once('exit',()=>process.exit(0))})
 const timer=setInterval(()=>{if(fs.existsSync(file+'.leaf')){clearInterval(timer);fs.writeFileSync(file+'.root',String(process.pid));if(mode==='exit-root')setTimeout(()=>process.exit(7),100)}},20)
}else if(mode==='owner'){
 const tree=spawnOwned(process.execPath,[__filename,'root',file],{cwd:__dirname,env:process.env})
 tree.exited.then(()=>process.exit(2),()=>process.exit(3))
 fs.writeFileSync(file+'.owner',String(process.pid));setInterval(()=>{},1000)
}else{throw Error('LAB_INVALID_PROCESS_FIXTURE')}
