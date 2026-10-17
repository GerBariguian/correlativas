'use strict'
const {onRequest}=require('firebase-functions/v2/https')
const {PROJECT,assertEnvironment,localURL}=require('../policy.cjs')
exports.backendHarness=onRequest({region:'us-central1',timeoutSeconds:10},async(req,res)=>{
 try{assertEnvironment();if(process.env.FUNCTIONS_EMULATOR!=='true')throw Error('NOT_EMULATED')}catch{return res.status(503).json({error:'EMULATOR_ONLY'})}
 res.set('Cache-Control','no-store')
 if(req.path==='/health')return res.json({project:PROJECT,emulatorOnly:true,careerCreationImplemented:false,academicSaveImplemented:false})
 const token=/^Bearer (.+)$/.exec(req.get('authorization')??'')?.[1]
 if(!token)return res.status(401).json({error:'LOCAL_AUTH_REQUIRED'})
 try{
  const r=await fetch(localURL('auth','/identitytoolkit.googleapis.com/v1/accounts:lookup?key=fake-lab-key'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(2500)})
  const body=await r.json();const uid=body.users?.[0]?.localId
  const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString())
  if(!r.ok||!uid?.startsWith('lab-')||claims.aud!==PROJECT||claims.iss!==`https://securetoken.google.com/${PROJECT}`)return res.status(401).json({error:'INVALID_LOCAL_AUTH'})
  if(req.path==='/probe')return res.json({uid,project:PROJECT,emulatorOnly:true,writes:0})
  return res.status(501).json({error:'NOT_IMPLEMENTED_STAGE_B',writes:0})
 }catch{return res.status(401).json({error:'LOCAL_AUTH_UNAVAILABLE'})}
})
