'use strict'
const {initializeApp,deleteApp}=require('firebase/app')
const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword}=require('firebase/auth')
const fs=require('firebase/firestore')
const {PROJECT,HOSTS,assertEnvironment,localURL}=require('./policy.cjs')
async function readiness({firestore=true}={}){
 assertEnvironment()
 for(const service of firestore?['auth','firestore']:['auth']){
  const r=await fetch(localURL(service,'/'),{signal:AbortSignal.timeout(2000)})
  if(r.status>=500)throw Error('LAB_EMULATOR_NOT_READY')
 }
}
async function createClient(name,{authOnly=false}={}){
 await readiness({firestore:!authOnly})
 const app=initializeApp({projectId:PROJECT,apiKey:'fake-lab-key',appId:'lab-only',authDomain:'localhost'},'lab-'+name)
 try{
  const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://'+HOSTS.auth,{disableWarnings:true})
  const db=fs.getFirestore(app);fs.connectFirestoreEmulator(db,'127.0.0.1',8188)
  return {app,auth,db,signIn:uid=>signInWithEmailAndPassword(auth,uid+'@example.test','fixture-only-password'),close:()=>deleteApp(app)}
 }catch(e){await deleteApp(app);throw e}
}
module.exports={createClient,readiness}
