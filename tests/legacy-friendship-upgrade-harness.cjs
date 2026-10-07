const fs=require('node:fs'),path=require('node:path')
function load(sdk,db,auth){
 const scope={...sdk,db,auth}
 for(const file of ['friendshipCycleLogic.js','activityLogic.js','socialMaintenance.js','services/friends.js']){
  const raw=fs.readFileSync(path.resolve(__dirname,'../src',file),'utf8')
  const names=[...raw.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(x=>x[1])
  const code=raw.replace(/import[\s\S]*?from ['"][^'"]+['"]\s*/g,'').replace(/export /g,'')
  Object.assign(scope,new Function(...Object.keys(scope),code+`;return {${names.join(',')}}`)(...Object.values(scope)))
 }
 return scope
}
const legacy=(inverse=false)=>({participants:inverse?['bob','alice']:['alice','bob'],senderId:'bob',recipientId:'alice',status:'accepted',createdAt:{seconds:1,nanoseconds:0},updatedAt:{seconds:2,nanoseconds:0}})
function memory(inverse=false){
 const docs=new Map([['friendships/'+(inverse?'bob:alice':'alice:bob'),legacy(inverse)]]),commits=[]
 let version=0,deny=()=>false,hook=()=>{}
 const auth={currentUser:{uid:'alice',emailVerified:true}}
 const sdk={doc:(_, ...p)=>p.join('/'),runTransaction:async(_,fn)=>{
  for(let i=0;i<6;i++){
   const before=version,writes=[]
   await fn({get:async p=>{const d=structuredClone(docs.get(p));hook();return {exists:()=>d!==undefined,data:()=>d}},
    set:(p,d)=>writes.push([p,structuredClone(d)]),delete:p=>writes.push([p,undefined])})
   if(before!==version)continue
   for(const [p]of writes)if(deny(p)||p.startsWith('usedFriendshipCycles/')&&docs.has(p))throw Object.assign(Error('denied'),{code:'permission-denied'})
   for(const [p,d]of writes)d===undefined?docs.delete(p):docs.set(p,d)
   version++;commits.push(writes);return
  }
  throw Error('conflict')
 }}
 return {docs,commits,auth,api:load(sdk,{},auth),deny:f=>{deny=f},hook:f=>{hook=f}}
}
module.exports={load,legacy,memory}
