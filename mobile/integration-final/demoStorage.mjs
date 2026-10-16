// Demo-only, origin-local data. No account tokens, PII or network persistence.
import {fixtureState,describeContext,SCENARIOS} from './contextModel.mjs'
import {validateCareerInstances} from '../../src/careerInstanceLogic.js'
import {restoreSession,sessionKey} from './onboardingModel.mjs'
import {STATUS} from '../../src/logic.js'
export const STORAGE_KEY='correlativas-demo-235-academic-v1'
export function restoreDemo(text,catalogs){
 if(typeof text!=='string'||text.length>2000000)return null
 try{
  const v=JSON.parse(text),s=v.state
  if(v.version!==1||!s||!Object.hasOwn(SCENARIOS,s.scenario)||!s.uid?.startsWith('demo-'))return null
  const base=fixtureState(s.scenario)
  if(s.uid!==base.uid||JSON.stringify(s.control)!==JSON.stringify(base.control)||!Number.isSafeInteger(s.sequence)||s.sequence<0||s.sequence>10000)return null
  validateCareerInstances(s.uid,s.instances)
  if(s.instances.length>catalogs.length+3||s.instances.some(i=>!i.careerInstanceId.startsWith('demo-')))return null
  if(!s.profile||![null,...s.instances.filter(i=>i.lifecycle==='active').map(i=>i.careerInstanceId)].includes(s.profile.activeCareerInstanceId)||![null,...catalogs.map(c=>c.id)].includes(s.profile.activeCareerId))return null
  if(!s.records||typeof s.records!=='object'||Array.isArray(s.records))return null
  const records={}
  for(const [key,record] of Object.entries(s.records)){
   const prefix=s.uid+':',suffix=key.slice(prefix.length)
   const catalog=suffix.startsWith('instances:')?catalogs.find(c=>c.id===s.instances.find(i=>i.careerInstanceId===suffix.slice(10))?.catalogId):suffix.startsWith('legacy:')?catalogs.find(c=>c.id===suffix.slice(7)):null
   if(!key.startsWith(prefix)||!catalog||!record?.status||Array.isArray(record.status)||typeof record.status!=='object')return null
   if(Object.entries(record.status).some(([code,status])=>!catalog.subjects.some(x=>x.code===code)||!STATUS.includes(status)))return null
   records[key]={status:{...record.status}}
  }
  const state={...base,profile:{activeCareerId:s.profile.activeCareerId,activeCareerInstanceId:s.profile.activeCareerInstanceId},instances:s.instances,records,sequence:s.sequence,sharing:Object.fromEntries(s.instances.map(i=>[i.careerInstanceId,{enabled:false,epoch:0}]))}
  describeContext(state,catalogs)
  const sessions={}
  if(v.sessions&&typeof v.sessions==='object'&&!Array.isArray(v.sessions))for(const [key,raw] of Object.entries(v.sessions).slice(0,100)){
   try{
    const scope=raw.draft.scope
    if(scope.uid!==state.uid||scope.model!==(state.control?.authority??'legacy'))continue
    const instance=state.instances.find(i=>i.careerInstanceId===scope.id&&i.catalogId===scope.catalogId)
    if(scope.model==='instances'&&!instance)continue
    const snapshot={...state,instances:state.instances.map(i=>i===instance?{...i,lifecycle:'active'}:i),profile:{...state.profile,activeCareerInstanceId:instance?.careerInstanceId??null,activeCareerId:scope.model==='legacy'?scope.catalogId:state.profile.activeCareerId}}
    const context=describeContext(snapshot,catalogs),session=restoreSession(raw,context)
    if(session&&key===sessionKey(context))sessions[key]=session
   }catch{/* An invalid draft cannot overwrite validated academic records. */}
  }
  return {state,sessions}
 }catch{return null}
}
export function readDemo(storage,catalogs){
 try{const text=storage.getItem(STORAGE_KEY);const value=text?restoreDemo(text,catalogs):null;return {value,invalid:Boolean(text&&!value),warning:text&&!value?'La copia local no pudo validarse. Se abrió un escenario ficticio; no se interpretó como progreso vacío.':''}}
 catch{return {value:null,warning:'El navegador no permite conservar la demo. Podés continuar en esta pestaña, pero recargar perderá los cambios.'}}
}
export function writeDemo(storage,state,sessions){
 try{storage.setItem(STORAGE_KEY,JSON.stringify({version:1,state,sessions}));return true}catch{return false}
}
