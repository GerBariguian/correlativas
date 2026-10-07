const S='legacySource',T='migratedPlan00001',time={seconds:1700000000,nanoseconds:0}
function fixture(){
 const d={[`jointPlans/${S}`]:{ownerId:'alice',careerId:'catalog',inviteeIds:['bob','carol'],memberIds:['alice','bob'],
  closed:false,deleting:false,name:'Legacy',invitedBy:{bob:'alice',carol:'alice'},createdAt:time,updatedAt:time}}
 for(const uid of ['alice','bob']){
  d[`migrationUsers/${uid}`]={schemaVersion:1,generation:'multicareer-v1',authority:'instances',phase:'complete',origin:'legacy',manifestId:uid,updatedAt:time}
  d[`migrationManifests/${uid}`]={schemaVersion:1,generation:'multicareer-v1',uid,origin:'legacy',checkpoints:{FREEZE:time,CUTOVER:time},validation:{ok:true}}
  d[`users/${uid}/catalogMemberships/catalog`]={schemaVersion:1,careerInstanceId:'i_'+uid}
  d[`users/${uid}/careerInstances/i_${uid}`]={schemaVersion:1,catalogId:'catalog',lifecycle:'active',createdAt:time,updatedAt:time,archivedAt:null}
 }
 return structuredClone(d)
}
function memory(initial=fixture()){
 let docs=structuredClone(initial)
 return {environment:'fixture',get docs(){return docs},async transaction(fn){const {writes,result}=await fn(structuredClone(docs),time);docs={...docs,...structuredClone(writes)};return result}}
}
function values(v,sdk){if(Array.isArray(v))return v.map(x=>values(x,sdk));if(v&&typeof v==='object'){if(Object.keys(v).sort().join()==='nanoseconds,seconds')return new sdk.Timestamp(v.seconds,v.nanoseconds);return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,values(x,sdk)]))}return v}
module.exports={S,T,time,fixture,memory,values}
