'use strict'
const PROJECT='demo-correlativas-244b'
const HOSTS=Object.freeze({auth:'127.0.0.1:9199',firestore:'127.0.0.1:8188',functions:'127.0.0.1:5101',hub:'127.0.0.1:4501'})
function canonicalEnvironment(base){
 const result={}
 for(const [key,value] of Object.entries(base)){const name=key.toUpperCase();if(Object.hasOwn(result,name))throw Error('LAB_AMBIGUOUS_ENVIRONMENT');result[name]=value}
 return result
}
function assertEnvironment(env=process.env){
 env=canonicalEnvironment(env)
 if(env.GCLOUD_PROJECT!==PROJECT||env.GOOGLE_CLOUD_PROJECT!==PROJECT||env.FIREBASE_AUTH_EMULATOR_HOST!==HOSTS.auth||env.FIRESTORE_EMULATOR_HOST!==HOSTS.firestore||env.LAB_EMULATOR_ONLY!=='1')throw Error('LAB_REFUSES_UNSAFE_OR_MISSING_ENVIRONMENT')
 if(env.FIREBASE_CONFIG){let c;try{c=JSON.parse(env.FIREBASE_CONFIG)}catch{throw Error('LAB_INVALID_FIREBASE_CONFIG')}if(c.projectId!==PROJECT)throw Error('LAB_INVALID_FIREBASE_CONFIG')}
 for(const k of Object.keys(env))if(/^(VITE_|GOOGLE_APPLICATION_CREDENTIALS$|FIREBASE_TOKEN$|GOOGLE_OAUTH_ACCESS_TOKEN$)/.test(k))throw Error('LAB_REFUSES_CREDENTIAL_VARIABLE')
}
function localURL(service,path=''){
 if(!Object.hasOwn(HOSTS,service)||!path.startsWith('/')||path.startsWith('//'))throw Error('LAB_INVALID_DESTINATION')
 const u=new URL('http://'+HOSTS[service]+path)
 if(u.origin!=='http://'+HOSTS[service])throw Error('LAB_INVALID_DESTINATION')
 return u.href
}
function cleanEnvironment(base=process.env){
 const allowed=['PATH','LANG','LC_ALL','JAVA_HOME','TMPDIR','TEMP','TMP','SYSTEMROOT']
 base=canonicalEnvironment(Object.fromEntries(Object.entries(base).filter(([k])=>allowed.includes(k.toUpperCase()))))
 const e={}
 for(const k of allowed)if(base[k])e[k]=base[k]
 const home=require('node:path').resolve(__dirname,'../../.tools/emulator-lab/home')
 Object.assign(e,{HOME:home,USERPROFILE:home,APPDATA:require('node:path').join(home,'AppData','Roaming'),LOCALAPPDATA:require('node:path').join(home,'AppData','Local'),CLOUDSDK_CONFIG:require('node:path').join(home,'gcloud'),XDG_CONFIG_HOME:require('node:path').join(home,'config')})
 return {...e,GCLOUD_PROJECT:PROJECT,GOOGLE_CLOUD_PROJECT:PROJECT,FIREBASE_AUTH_EMULATOR_HOST:HOSTS.auth,FIRESTORE_EMULATOR_HOST:HOSTS.firestore,LAB_EMULATOR_ONLY:'1',CI:'true',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true',GCLOUD_DISABLE_METRICS:'true',METADATA_SERVER_DETECTION:'none',npm_config_offline:'true',npm_config_cache:require('node:path').resolve(__dirname,'../../.tools/emulator-lab/npm-cache')}
}
module.exports={PROJECT,HOSTS,assertEnvironment,localURL,cleanEnvironment,canonicalEnvironment}
