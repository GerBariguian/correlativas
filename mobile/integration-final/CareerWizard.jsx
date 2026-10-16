import React, { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Search, ChevronRight, Check } from 'lucide-react'
import { universities, careerChoices, planChoices } from './catalogSearch.mjs'
const routes=['alta-universidad','alta-carrera','alta-plan']
export function CareerWizard({ demo, navigation, draft, setDraft, onAdded }) {
  const step=routes.indexOf(navigation.route.page)
  const [error,setError]=useState(''), [working,setWorking]=useState(false)
  const lock=useRef(false)
  const valid=Boolean(draft?.queries && demo.context.authority==='instances' && demo.context.phase==='complete' && demo.context.capabilities.academicWrite)
  const plans=valid ? planChoices(demo.careers,draft.university,draft.career) : []
  useEffect(() => {
    if (!valid) navigation.replace('carreras')
    else if (step>0 && !draft.university) navigation.replace(routes[0])
    else if (step>1 && !draft.career) navigation.replace(routes[1])
  },[valid,step,draft?.university,draft?.career])
  if (!valid) return <p role="status">Volviendo a Mis carreras…</p>
  const query=draft.queries[step] ?? ''
  const options=step===0 ? universities(demo.careers,query).map(name => ({key:name,name})) : step===1 ? careerChoices(demo.careers,draft.university,query) : plans
  const chosen=plans.find(c => c.id===draft.catalogId)
  const owned=chosen && demo.state.instances.find(i=>i.catalogId===chosen.id)
  function close(reveal) { setDraft(reveal ? {reveal} : null); navigation.replace('carreras') }
  function pick(option) {
    setError('')
    if(step===0) { setDraft({...draft,university:option.key,career:'',catalogId:'',queries:[query,'']}); navigation.go(routes[1]) }
    else if(step===1) {
      const next=planChoices(demo.careers,draft.university,option.key)
      setDraft({...draft,career:option.key,catalogId:next.length===1 ? next[0].id : ''})
      navigation.go(routes[2])
    } else setDraft({...draft,catalogId:option.id})
  }
  async function add() {
    if(lock.current || !chosen || owned) return
    lock.current=true;setWorking(true);setError('')
    try { const instanceId=demo.act('add',chosen.id); if(onAdded)onAdded(instanceId,chosen.id); else close(chosen.id) }
    catch { setError('No se pudo agregar. Tu selección anterior y los datos se conservan. Revisá el plan antes de reintentar.'); lock.current=false;setWorking(false) }
  }
  return <section className="career-wizard" aria-labelledby="wizard-title" aria-busy={working}>
    <div className="wizard-controls"><button className="text-btn" disabled={working} onClick={() => step===0 ? close() : navigation.back()}><ArrowLeft size={18} aria-hidden="true"/>Atrás</button><button className="text-btn" onClick={() => close()} disabled={working}>Cancelar</button></div>
    <div className="wizard-heading"><span className="section-kicker">AGREGAR CARRERA · PASO {step+1} DE 3</span><h1 id="wizard-title">{['Elegí tu universidad','Buscá tu carrera','Elegí el plan'][step]}</h1><p>{step===0 ? 'Buscá entre las universidades del catálogo.' : step===1 ? draft.university : `${draft.university} · ${plans[0]?.name ?? ''}`}</p></div>
    <ol className="wizard-progress" aria-label="Pasos del alta">{['Universidad','Carrera','Plan'].map((name,i)=><li key={name} aria-current={step===i ? 'step' : undefined}><span>{i<step ? <Check size={13} aria-hidden="true"/> : i+1}</span>{name}</li>)}</ol>
    {step<2 && <label className="wizard-search"><span>{step===0 ? 'Buscar universidad' : 'Buscar carrera'}</span><div><Search size={18} aria-hidden="true"/><input type="search" value={query} autoComplete="off" enterKeyHint="search" onChange={e => { const queries=[...draft.queries];queries[step]=e.target.value;setDraft({...draft,queries}) }} placeholder={step===0 ? 'Nombre o sigla…' : 'Nombre de carrera…'}/></div></label>}
    <p className="wizard-result-count" role="status">{options.length} {step===0 ? 'universidades' : step===1 ? 'carreras' : 'planes'} disponibles</p>
    {!options.length && <div className="career-state"><h2>No encontramos resultados</h2><p>Probá con otro nombre dentro de {step===1 ? draft.university : 'las universidades disponibles'}.</p><button className="secondary-btn" onClick={() => { const queries=[...draft.queries];queries[step]='';setDraft({...draft,queries}) }}>Limpiar búsqueda</button></div>}
    <ul className="wizard-options" aria-label={['Universidades','Carreras','Planes de estudios'][step]}>{options.map(option => {
      const existing=step===2 && demo.state.instances.find(i=>i.catalogId===option.id)
      return <li key={option.key ?? option.id}>{step===2 ? <label className={`plan-option ${draft.catalogId===option.id ? 'is-chosen' : ''}`}><input type="radio" name="academic-plan" checked={draft.catalogId===option.id} onChange={()=>pick(option)}/><span><strong>Plan {option.plan}</strong>{existing && <small>{existing.lifecycle==='archived' ? 'Archivada · Podés restaurarla' : 'Ya agregada'}</small>}</span></label> : <button onClick={()=>pick(option)}><span><strong>{option.name}</strong>{option.faculty && <small>{option.faculty}</small>}</span><ChevronRight size={18} aria-hidden="true"/></button>}</li>
    })}</ul>
    {step===2 && chosen && <section className="wizard-review" aria-label="Resumen de la carrera"><h2>Tu elección</h2><strong>{chosen.name}</strong><p>{chosen.university}{chosen.faculty ? ` · ${chosen.faculty}` : ''}<br/>Plan {chosen.plan}</p><p>{owned ? 'Esta carrera ya forma parte de tus trayectorias. No se creará un duplicado.' : demo.state.instances.length===0 && !demo.state.profile.activeCareerInstanceId ? 'Es tu primera carrera: quedará seleccionada automáticamente.' : 'Se agregará sin cambiar tu contexto actual.'}</p>{owned ? <button className="secondary-btn full" onClick={()=>close(chosen.id)}>{owned.lifecycle==='archived' ? 'Ver en archivadas' : 'Ver en Mis carreras'}</button> : <button className="primary-btn full" onClick={add} disabled={working}>{working ? 'Agregando…' : 'Agregar carrera'}</button>}</section>}
    {step===2 && !chosen && <p className="sheet-info">Seleccioná un plan para revisar y confirmar. Cada plan conserva sus propios datos; no se transfieren materias ni notas.</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
