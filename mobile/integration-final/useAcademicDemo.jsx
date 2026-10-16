import { useEffect, useMemo, useRef, useState } from 'react'
import { careers } from '../../src/data/careers'
import { makeStatus } from '../../prototypes/mobile-app/data'
import { fixtureState, describeContext, changeContext } from './contextModel.mjs'
import { academicPresentation } from './academicPresentation.mjs'
import { createSimulatedAcademicOperations } from './simulatedAcademicOperations.mjs'
import {readDemo,writeDemo} from './demoStorage.mjs'
import {startSession,sessionKey,sessionMatches,restoreSession,confirmDecision,moveSession,skipSession} from './onboardingModel.mjs'
const fresh = scenario => fixtureState(scenario,{status:makeStatus()})
export function useAcademicDemo(){
  const [restored]=useState(()=>readDemo({getItem:key=>window.localStorage.getItem(key)},careers))
  const [storageWarning,setStorageWarning]=useState(restored.warning)
  const [state,setState]=useState(()=>restored.value?.state??fresh(restored.invalid?'invalid-progress':'instances'))
  const storageWritable=useRef(!restored.invalid)
  const [sessions,setSessions]=useState(()=>restored.value?.sessions??{})
  const sessionsRef=useRef(sessions);sessionsRef.current=sessions
  useEffect(()=>{if(!storageWritable.current)return;if(!writeDemo({setItem:(key,value)=>window.localStorage.setItem(key,value)},state,sessions))setStorageWarning('No se pudo conservar la demo en este navegador. Continuá en esta pestaña; recargar puede perder los cambios.')},[state,sessions])
  const live=useRef(state)
  const [generation,setGeneration]=useState(0),generationRef=useRef(0)
  const [notice,setNotice]=useState('')
  const [onboardingNotice,setOnboardingNotice]=useState('')
  const [operation,setOperation]=useState({phase:'idle',message:'',requestId:null})
  const [simulation,setSimulation]=useState({mode:'success',delay:350})
  const commit=next=>{live.current=next;setState(next)}
  const controller=useRef(null)
  if(!controller.current)controller.current=createSimulatedAcademicOperations({read:()=>live.current,write:commit,catalogs:careers,publish:setOperation})
  useEffect(()=>()=>controller.current.dispose(),[])
  const scopeVersion=useRef(0)
  const actionEpoch=scopeVersion.current
  const context=describeContext(state,careers)
  const presentation=useMemo(()=>academicPresentation(context,operation),[state,operation])
  function act(op,value){
    if(actionEpoch!==scopeVersion.current || generation!==generationRef.current || describeContext(live.current,careers).key!==context.key)throw Object.assign(new Error('ACADEMIC_SCOPE_CHANGED'),{code:'ACADEMIC_SCOPE_CHANGED'})
    const before=live.current,next=changeContext(before,op,value,careers)
    const prior=describeContext(before,careers),after=describeContext(next,careers)
    if(prior.key!==after.key || prior.authority!==after.authority || prior.phase!==after.phase || prior.catalogId!==after.catalogId){scopeVersion.current++;controller.current.invalidate()}
    commit(next)
    setNotice({select:'Selección de trayectoria actualizada en la demo.','legacy-select':'Carrera seleccionada en la demo.',add:before.instances.length===0 && next.profile.activeCareerInstanceId?'Carrera agregada y seleccionada.':prior.career?`Carrera agregada. Seguís consultando ${prior.career.name}.`:'Carrera agregada. Seleccioná cuál querés consultar.',archive:'Carrera archivada. Tus datos se conservaron.',restore:'Carrera restaurada. Compartir sigue desactivado; seleccioná explícitamente para consultarla.'}[op])
    if(op==='add')return next.instances.find(i=>!before.instances.some(p=>p.careerInstanceId===i.careerInstanceId))?.careerInstanceId
    return value
  }
  function loadScenario(name){
    storageWritable.current=true;setStorageWarning('')
    scopeVersion.current++;controller.current.invalidate();generationRef.current++;setGeneration(generationRef.current)
    setSessions({});sessionsRef.current={};commit(fresh(name));setNotice('Escenario ficticio cargado. No se inició sesión ni se migraron datos.')
  }
  function updateStatus(code,status){
    if(actionEpoch!==scopeVersion.current || generation!==generationRef.current || describeContext(live.current,careers).key!==context.key)return false
    return controller.current.begin({kind:'save',code,status,...simulation})
  }
  const isLive=()=>actionEpoch===scopeVersion.current && generation===generationRef.current && describeContext(live.current,careers).key===context.key
  function saveSession(key,next){const all={...sessionsRef.current,[key]:next};sessionsRef.current=all;setSessions(all)}
  function beginOnboarding(){
    if(!isLive()||!context.usable||!presentation.available||presentation.busy)return false
    const key=sessionKey(context),raw=sessionsRef.current[key],prior=raw?restoreSession(raw,context):null
    setOnboardingNotice(raw&&!prior?'El progreso cambió desde la última carga. Se conservaron todos los estados confirmados y ahora están protegidos; el recorrido muestra únicamente materias sin registro.':'')
    saveSession(key,prior??startSession(context));return true
  }
  function onboardingAction(action,value){
    if(!isLive()||!context.usable||presentation.busy)return false
    const key=sessionKey(context),session=sessionsRef.current[key]
    if(!sessionMatches(session,context))return false
    if(action==='move')saveSession(key,moveSession(session,value))
    if(action==='skip')saveSession(key,skipSession(session))
    if(action==='complete')saveSession(key,{...session,complete:value!==false})
    return true
  }
  function decideOnboarding(code,status){
    if(!isLive()||!context.usable)return false
    const key=sessionKey(context),session=sessionsRef.current[key]
    if(!sessionMatches(session,context))return false
    // Domain validation: only editable cards; no inferred dependencies or grades.
    let next
    try{next=confirmDecision(session,code,status)}catch{return false}
    return controller.current.begin({kind:'save',code,status,...simulation,onResult:result=>{
      if(result==='success'&&isLive())saveSession(key,next)
    }})
  }
  const onboarding=context.usable?sessions[sessionKey(context)]??null:null
  return {onboardingNotice,onboarding,beginOnboarding,onboardingAction,decideOnboarding,storageWarning,state,context,careers,generation,notice,act,loadScenario,presentation,operation,simulation,setSimulation,updateStatus,
    simulateLoad:()=>controller.current.begin({kind:'load',...simulation}),
    refresh:()=>controller.current.begin({kind:'load',mode:'success',delay:350}),
    reset:()=>loadScenario(live.current.scenario),
    bridge:{...context,lifecycle:{add:v=>act('add',v),select:v=>act('select',v),archive:v=>act('archive',v),restore:v=>act('restore',v)},repository:{selectInstance:v=>act('select',v)}},
  }
}
