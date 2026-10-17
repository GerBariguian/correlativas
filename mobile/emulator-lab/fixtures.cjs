'use strict'
const {PROJECT,assertEnvironment,localURL}=require('./policy.cjs')
const USERS=['lab-legacy','lab-instances','lab-empty','lab-blocked']
async function seedAuth(){
 assertEnvironment()
 const r=await fetch(localURL('auth',`/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchCreate`),{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({users:USERS.map(localId=>({localId,email:localId+'@example.test',emailVerified:true,rawPassword:'fixture-only-password'}))}),signal:AbortSignal.timeout(3000)})
 const data=await r.json();if(!r.ok||(Array.isArray(data.error)?data.error.length:data.error))throw Error('LAB_AUTH_FIXTURE_FAILED_'+r.status)
 return USERS
}
function fixtureDocuments(Timestamp){
 const t=Timestamp.fromMillis(1700000000000),out={}
 for(const uid of USERS){
  out[`users/${uid}`]=uid==='lab-legacy'?{activeCareerId:'utn-sistemas-2023',updatedAt:t}:{schemaVersion:2,activeCareerInstanceId:uid==='lab-instances'?'lab-systems':null,updatedAt:t}
  if(uid!=='lab-legacy')out[`migrationUsers/${uid}`]={schemaVersion:1,generation:'multicareer-v1',authority:'instances',phase:uid==='lab-blocked'?'blocked':'complete',origin:'new',manifestId:uid,updatedAt:t}
 }
 const statuses={'UTN-ISI23-01':'Aprobada','UTN-ISI23-02':'Regularizada','UTN-ISI23-03':'Cursando','UTN-ISI23-04':'Pendiente'}
 out['users/lab-legacy/careers/utn-sistemas-2023']={statusMap:statuses,writeRevision:3,updatedAt:t}
 for(const [id,catalogId,lifecycle] of [['lab-systems','utn-sistemas-2023','active'],['lab-industrial23','utn-industrial-2023','active'],['lab-industrial07','utn-industrial-2007','archived']]){
  out[`users/lab-instances/careerInstances/${id}`]={schemaVersion:1,catalogId,lifecycle,createdAt:t,updatedAt:t,archivedAt:lifecycle==='archived'?t:null}
  out[`users/lab-instances/catalogMemberships/${catalogId}`]={schemaVersion:1,careerInstanceId:id}
  out[`users/lab-instances/careerInstances/${id}/academic/progress`]={schemaVersion:1,statusMap:id==='lab-systems'?statuses:{},revision:id==='lab-systems'?7:1,updatedAt:t}
 }
 out['labInfrastructure/lab-instances/probes/concurrency']={revision:1,cursor:0,marker:'fixture-only'}
 return out
}
async function seedFirestore(){
 assertEnvironment()
 const {readFileSync}=require('node:fs'),{initializeTestEnvironment}=require('@firebase/rules-unit-testing'),{doc,setDoc,Timestamp}=require('firebase/firestore')
 const env=await initializeTestEnvironment({projectId:PROJECT,firestore:{host:'127.0.0.1',port:8188,rules:readFileSync(__dirname+'/lab.rules','utf8')}})
 try{
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();for(const [path,data] of Object.entries(fixtureDocuments(Timestamp)))await setDoc(doc(db,path),data)})
 }finally{await env.cleanup()}
}
module.exports={USERS,fixtureDocuments,seedAuth,seedFirestore}
