'use strict'
// Download is deliberately separate from the guarded emulator runtime.
const https=require('node:https'),{createHash,randomUUID}=require('node:crypto')
const {mkdir,open,rename,rm,readFile}=require('node:fs/promises'),{resolve,join}=require('node:path')
const {metadata,verifyBytes}=require('./artifact.cjs')
async function writeVerifiedResponse(file,response,info){
 const length=response.headers['content-length']
 if(length!==undefined&&Number(length)!==info.expectedSize)throw Error('LAB_ARTIFACT_SIZE_MISMATCH')
 const hash=createHash('sha256');let size=0
 const handle=await open(file,'wx',0o600)
 try{
  for await(const chunk of response){
   size+=chunk.length;if(size>info.expectedSize)throw Error('LAB_ARTIFACT_SIZE_MISMATCH')
   hash.update(chunk);await handle.writeFile(chunk)
  }
 }finally{await handle.close()}
 if(size!==info.expectedSize||hash.digest('hex')!==info.expectedChecksumSHA256)throw Error('LAB_FIRESTORE_ARTIFACT_INVALID')
}
async function download(file,request=https.get){
 // The transport has no URL, size, hash or TLS overrides.
 const info=metadata()
 const agent=new https.Agent({proxyEnv:process.env,rejectUnauthorized:true})
 let req,response,timer
 try{
  response=await new Promise((ok,bad)=>{
   req=request(info.remoteUrl,{agent,rejectUnauthorized:true},ok)
   req.once('error',bad)
   timer=setTimeout(()=>{const error=Error('LAB_OFFICIAL_DOWNLOAD_TIMEOUT');req.destroy(error);response?.destroy(error)},60000)
  })
  if(response.statusCode!==200)throw Error('LAB_OFFICIAL_DOWNLOAD_HTTP_'+response.statusCode)
  await writeVerifiedResponse(file,response,info)
 }finally{clearTimeout(timer);response?.destroy();req?.destroy();agent.destroy()}
}

async function prepare(){
 if(process.argv.length!==2)throw Error('LAB_NO_DOWNLOAD_OVERRIDES')
 const info=metadata(),cache=resolve(__dirname,'../../.tools/emulator-lab/cache'),target=join(cache,info.downloadPathRelativeToCacheDir)
 await mkdir(cache,{recursive:true})
 try{verifyBytes(await readFile(target));console.log('Firestore 1.22.0: cached size and SHA-256 verified');return}catch(e){if(e.code!=='ENOENT')throw e}
 const temporary=target+'.'+randomUUID()+'.download'
 try{await download(temporary);await rename(temporary,target);console.log('Firestore 1.22.0: official TLS, size and SHA-256 verified')}
 finally{await rm(temporary,{force:true,maxRetries:5,retryDelay:200})}
}
if(require.main===module)prepare().catch(e=>{console.error(e.message);process.exitCode=1})
module.exports={download,prepare,writeVerifiedResponse}
