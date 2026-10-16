import React,{useEffect,useRef,useState} from 'react'
import {Dialog} from '@mui/material'
import {X,Maximize2,Minimize2,Check,LockKeyhole,Map,BookOpen,GitBranch} from 'lucide-react'
import {STATUS} from '../../src/logic.js'
import {AcademicFeedback} from './AcademicSimulation'
import {subjectDetailModel} from './subjectDetailModel.mjs'
const classes={Pendiente:'pending',Cursando:'taking',Regularizada:'regularized',Aprobada:'approved'}
function Requirements({title,rows,kind,empty}){
 return <section className="detail-requirement-group"><h4>{title}</h4>{rows.length?<ul>{rows.map(r=><li key={r.code} className={r.missing?'is-missing':'is-met'}><span className="requirement-symbol" aria-hidden="true">{r.missing?<LockKeyhole size={15}/>:<Check size={15}/>}</span><span><strong>{r.name}</strong><small>{r.code}{!r.known?' · Nombre no disponible en el catálogo':''}</small><span>{r.missing?(kind==='regularized'?'Falta regularizar o aprobar':'Falta aprobar'):'Cumplido'}</span></span></li>)}</ul>:<p className="detail-muted">{empty}</p>}</section>
}
export function SubjectDetailPanel({demo,code,close,onMap}){
 const model=demo.presentation,detail=subjectDetailModel(model,code)
 const [full,setFull]=useState(false),heading=useRef(null)
 const [viewport,setViewport]=useState(()=>({height:window.visualViewport?.height??innerHeight,top:window.visualViewport?.offsetTop??0}))
 useEffect(()=>{
  const view=window.visualViewport,update=()=>setViewport({height:view?.height??innerHeight,top:view?.offsetTop??0})
  view?.addEventListener('resize',update);view?.addEventListener('scroll',update);window.addEventListener('resize',update)
  return()=>{view?.removeEventListener('resize',update);view?.removeEventListener('scroll',update);window.removeEventListener('resize',update)}
 },[])
 useEffect(()=>{heading.current?.focus({preventScroll:true})},[code])
 if(!detail)return null
 const s=detail.subject
 return <Dialog open onClose={close} className="demo-sheet-root subject-detail-root" aria-labelledby="subject-detail-title" aria-describedby="subject-detail-context" style={{'--sheet-viewport-height':`${viewport.height}px`,'--sheet-viewport-top':`${viewport.top}px`}} slotProps={{paper:{className:`demo-sheet subject-detail-panel ${full?'is-full':''}`}}}>
  <div className="sheet-handle" aria-hidden="true"/><header><h2>Tu materia</h2><div className="detail-header-actions"><button className="icon-btn" onClick={()=>setFull(v=>!v)} aria-label={full?'Reducir panel':'Ampliar panel'} aria-pressed={full}>{full?<Minimize2 size={20}/>:<Maximize2 size={20}/>}</button><button className="icon-btn" onClick={close} aria-label="Cerrar"><X size={21}/></button></div></header>
  <div className="detail-identity"><p className="section-kicker" id="subject-detail-context">{demo.context.career.university} · {demo.context.career.name} · Plan {demo.context.career.plan}</p><h3 id="subject-detail-title" tabIndex={-1} ref={heading}>{s.name}</h3><p className="detail-code">{s.code} · {detail.displayLevel}{detail.displayPeriod!==detail.displayLevel?` · ${detail.displayPeriod}`:''}</p><span className={`status ${classes[detail.status]}`}>{detail.status}</span></div>
  <AcademicFeedback demo={demo}/>
  <section className="detail-status-section" aria-labelledby="detail-status-title"><h3 id="detail-status-title">Tu estado académico</h3><fieldset aria-labelledby="detail-status-title" className="academic-editor detail-status-editor" disabled={!model.canEdit}><div className="status-actions" role="group" aria-label="Cambiar estado académico">{STATUS.map(value=><button type="button" key={value} aria-pressed={detail.status===value} className={detail.status===value?'active':''} onClick={()=>demo.updateStatus(code,value)}>{value}</button>)}</div></fieldset></section>
  <p className="detail-muted">Podés registrar tu estado aunque falten correlativas. No se modifican otras materias.</p>
  <section className="detail-section detail-eligibility" aria-label="Habilitaciones académicas"><h3><BookOpen size={18} aria-hidden="true"/>Condiciones académicas</h3><div><h4>Para cursar</h4><strong>{detail.courseLabel}</strong><p>{detail.courseRequirementsMet?'Correlativas de cursada cumplidas.':'Hay correlativas de cursada pendientes.'}</p></div><div><h4>Para rendir final</h4><strong>{detail.finalLabel}</strong><p>{detail.finalRequirementsMet?'Correlativas de final cumplidas.':'Hay correlativas de final pendientes.'}</p></div></section>
  <section className="detail-section" aria-label="Requisitos de cursada"><h3>Correlativas para cursar</h3><Requirements title="Tener regularizadas o aprobadas" rows={detail.courseRegularized} kind="regularized" empty="Sin requisitos de regularización."/><Requirements title="Tener aprobadas" rows={detail.courseApproved} kind="approved" empty="Sin requisitos adicionales de aprobación."/></section>
  <section className="detail-section" aria-label="Requisitos de final"><h3>Correlativas para rendir final</h3>{detail.allFinals&&<p className="detail-muted">Este plan utiliza la regla «ALL». La lista respeta las exclusiones del catálogo.</p>}<details aria-label="Correlativas de final requeridas" className="detail-long-list" open={detail.finalRequired.length<=8}><summary>{detail.finalRequired.length} requisitos · {detail.missingFinal.length} pendientes</summary><Requirements title="Tener aprobadas" rows={detail.finalRequired} kind="approved" empty="Sin correlativas de final."/></details></section>
  <section className="detail-section" aria-label="Dependencias directas"><h3><GitBranch size={18} aria-hidden="true"/>Podría ayudar a desbloquear</h3><p className="detail-muted">Son dependencias directas de cursada. Cada materia conserva sus otros requisitos; cambiar este estado no garantiza habilitarla ni modifica su progreso.</p>{detail.dependents.length?<ul className="detail-dependents">{detail.dependents.map(item=><li key={item.code}><strong>{item.name}</strong><small>{item.code}</small></li>)}</ul>:<p className="detail-muted">No tiene dependencias directas de cursada en este catálogo.</p>}</section>
  <section className="detail-section" aria-label="Información del catálogo"><h3>Sobre esta materia</h3>{s.description?<p>{s.description}</p>:<p className="detail-muted">El catálogo no incluye una descripción.</p>}{Array.isArray(s.topics)&&s.topics.length>0&&<><h4>Temas principales</h4><ul className="detail-topics">{s.topics.map((topic,i)=><li key={i}>{topic}</li>)}</ul></>}{detail.hoursLabel&&<p className="detail-hours"><strong>Carga horaria</strong><span>{detail.hoursLabel}</span></p>}</section>
  <div className="detail-map-action"><button className="secondary-btn full" onClick={onMap}>Ver en el mapa<Map size={18} aria-hidden="true"/></button></div>
 </Dialog>
}
