import React,{useEffect,useRef} from 'react'
import {BookOpen,ArrowRight,Check,ChevronLeft,Pause} from 'lucide-react'
import {STATUS,getSubjectLevel} from '../../src/logic.js'
import {editableCodes,sessionProgress,sessionMatches} from './onboardingModel.mjs'
import {AcademicFeedback} from './AcademicSimulation'
import './onboarding.css'
const colors={Pendiente:'pending',Cursando:'taking',Regularizada:'regularized',Aprobada:'approved'}
export function OnboardingEntry({demo,start}){
 if(!demo.presentation.available)return null
 return <section className="onboarding-entry-mobile" aria-label="Carga académica por tarjetas"><BookOpen size={23} aria-hidden="true"/><div><h2>Cargá tu recorrido</h2><p>Una materia a la vez. Conservamos los estados que ya registraste.</p></div><button className="secondary-btn full" disabled={demo.presentation.busy} onClick={start}>Configurar mis materias <ArrowRight size={17} aria-hidden="true"/></button></section>
}
export function AcademicOnboarding({demo,navigate}){
 const s=demo.onboarding,heading=useRef(null)
 const codes=s?editableCodes(s):[],code=codes[s?.cursor],subject=demo.presentation.byCode[code]?.subject
 const p=s?sessionProgress(s):null
 const busy=demo.presentation.busy,live=s&&sessionMatches(s,demo.context),editable=demo.presentation.canEdit&&live
 useEffect(()=>{heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView({block:'nearest',behavior:'instant'})},[s?.cursor,s?.complete])
 function move(n){demo.onboardingAction('move',n)}
 function returnLater(){navigate('inicio')}
 if(!demo.context.usable||!demo.presentation.available)return <section className="onboarding-mobile-page"><h1>Carga no disponible</h1><p>Elegí un contexto académico válido. No se usan datos de otra carrera.</p><button className="primary-btn" onClick={()=>navigate('carreras')}>Ir a Mis carreras</button></section>
 if(!s)return <section className="onboarding-mobile-page"><h1>Tu punto de partida</h1><p>Podés cargar tus estados sin reemplazar los que ya registraste. Omitir una materia no asigna Pendiente.</p><button className="primary-btn" onClick={demo.beginOnboarding}>Comenzar carga por tarjetas</button><button className="secondary-btn full" onClick={returnLater}>Lo hago después</button></section>
 return <section className="onboarding-mobile-page" aria-label="Carga académica inicial" aria-busy={busy}>
  <header className="onboarding-heading"><span className="section-kicker">TU PUNTO DE PARTIDA</span><h1>Una materia a la vez.</h1></header>
  <AcademicFeedback demo={demo}/>{demo.onboardingNotice&&<p role="status" className="context-notice">{demo.onboardingNotice}</p>}
  {!live&&<div role="alert" className="academic-feedback has-issue"><p>El progreso cambió fuera de estas tarjetas. Actualizá el recorrido para proteger esos estados; no se sobrescribirán.</p><button className="secondary-btn" disabled={busy} onClick={demo.beginOnboarding}>Actualizar recorrido</button></div>}
  <div className="onboarding-progress"><div><strong>{p.reviewed} de {p.editable} revisadas</strong><span>{p.remaining} sin revisar</span></div><progress aria-label="Progreso de la carga, no porcentaje aprobado" value={p.reviewed} max={p.editable||1}/><p>{p.protected} con estado previo protegido · {p.skipped} omitidas sin cambios</p></div>
  {s.complete?<div className="onboarding-summary"><span className="onboarding-mark"><Check size={28} aria-hidden="true"/></span><h2 ref={heading} tabIndex={-1}>Tu punto de partida está listo</h2><p>{p.reviewed} decisiones confirmadas en esta demo. {p.remaining} materias siguen sin revisar; no se les asignó ningún estado.</p><button className="primary-btn full" onClick={returnLater}>Ver mi Inicio</button><button className="secondary-btn full" disabled={!codes.length} onClick={()=>{demo.onboardingAction('complete',false);move(-codes.length)}}>Volver a las tarjetas</button></div>:subject?<>
   <article className="onboarding-subject" aria-labelledby="onboarding-subject-title"><span className="onboarding-card-position">Tarjeta {s.cursor+1} de {codes.length}</span><span className="onboarding-level">{subject.level||(typeof subject.year==='number'?getSubjectLevel(subject):subject.year)||'Nivel no informado'}{subject.term?` · ${subject.term}`:''}</span><h2 id="onboarding-subject-title" ref={heading} tabIndex={-1}>{subject.name}</h2><p className="onboarding-code">{subject.code}</p><span className={`demo-status ${colors[s.draft.decisions[code]]??'pending'}`}>{s.draft.decisions[code]??'Sin revisar'}</span></article>
   <div className="onboarding-status" role="group" aria-labelledby="onboarding-status-title"><h2 id="onboarding-status-title">Tu estado académico</h2><div>{STATUS.map(status=><button key={status} className={`onboarding-choice ${colors[status]}`} aria-pressed={s.draft.decisions[code]===status} disabled={!editable} onClick={()=>demo.decideOnboarding(code,status)}><span aria-hidden="true">{s.draft.decisions[code]===status?'✓':'○'}</span>{status}</button>)}</div></div>
   <p className="onboarding-help">Cada elección se confirma en la demo antes de avanzar. Las correlativas no impiden registrar tu estado ni cambian otras materias.</p>
   <div className="onboarding-card-nav"><button className="secondary-btn" disabled={busy||!live||s.cursor===0} onClick={()=>move(-1)}><ChevronLeft size={17} aria-hidden="true"/>Anterior</button><button className="secondary-btn" disabled={busy||!live} onClick={()=>demo.onboardingAction('skip')}>{Object.hasOwn(s.draft.decisions,code)?'Siguiente':'Omitir'}<ArrowRight size={17} aria-hidden="true"/></button></div>
  </>:<div className="onboarding-summary"><h2 ref={heading} tabIndex={-1}>{!codes.length?'Tus estados previos están protegidos':'Llegaste al final del recorrido'}</h2><p>{!codes.length?'Todas las materias ya tienen un estado registrado. Para corregirlo, usá el detalle de Materias.':`${p.reviewed} revisadas y ${p.remaining} sin revisar. Podés volver para corregir u omitir el resto sin asignar estados.`}</p><button className="secondary-btn full" disabled={busy||!live||!codes.length} onClick={()=>move(-1)}>Volver a la última tarjeta</button><button className="primary-btn full" disabled={busy||!live} onClick={()=>demo.onboardingAction('complete',true)}>Terminar por ahora</button></div>}
  {!s.complete&&<button className="text-btn onboarding-pause" onClick={returnLater}><Pause size={16} aria-hidden="true"/>Pausar y volver a Inicio</button>}
  <p className="onboarding-storage-note">Sólo datos ficticios guardados en este navegador. No se envía información a servidores. Las decisiones confirmadas se ven en Inicio y Materias; una operación pendiente puede finalizar después de pausar, pero se descarta al cambiar de contexto.</p>
 </section>
}
