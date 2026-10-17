'use strict'
const {readFileSync,existsSync}=require('node:fs'),{createHash}=require('node:crypto'),{join}=require('node:path')
const PIN=Object.freeze({version:'1.22.0',expectedSize:136707194,expectedChecksumSHA256:'9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c',remoteUrl:'https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar',downloadPathRelativeToCacheDir:'cloud-firestore-emulator-v1.22.0.jar'})
function metadata(){
 const info=require('../../node_modules/firebase-tools/lib/emulator/downloadableEmulatorInfo.json').firestore
 for(const [k,v] of Object.entries(PIN))if(info[k]!==v)throw Error('LAB_ARTIFACT_METADATA_CHANGED_'+k)
 return PIN
}
function verifyBytes(bytes,expected=PIN){
 if(bytes.length!==expected.expectedSize||createHash('sha256').update(bytes).digest('hex')!==expected.expectedChecksumSHA256)throw Error('LAB_FIRESTORE_ARTIFACT_INVALID')
}
function artifact(cache){
 const info=metadata(),file=join(cache,info.downloadPathRelativeToCacheDir)
 if(!existsSync(file))throw Error('LAB_FIRESTORE_ARTIFACT_MISSING: run node mobile/emulator-lab/prepare.cjs; no fallback or auto-download')
 verifyBytes(readFileSync(file));return file
}
module.exports={PIN,metadata,verifyBytes,artifact}
