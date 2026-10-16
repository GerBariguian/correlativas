import React, { useState } from 'react'
import { CareerCards } from './CareerCards'
import CareerSelector from '../../src/components/CareerSelector'
import { AcademicSimulation } from './AcademicSimulation'
import { SCENARIOS } from './contextModel.mjs'

export function ScenarioPicker({ demo }) {
  return <details className="context-scenarios"><summary>Escenarios de prueba · datos ficticios</summary>
    <label htmlFor="demo-scenario">Escenario ficticio</label><select id="demo-scenario" value={demo.state.scenario} onChange={e => demo.loadScenario(e.target.value)}>{Object.entries(SCENARIOS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
    <AcademicSimulation demo={demo} />
    <p>Herramienta de revisión de la demo. Cambia los datos de ejemplo; no son tipos de cuenta elegibles ni migraciones reales.</p>
  </details>
}
export function ContextSelector({ demo, navigate }) {
  const career = demo.context.career
  return <button className="context-selector" onClick={() => navigate('carreras')} aria-label="Cambiar contexto académico">
    <span>{career ? `${career.university} · ${career.name}` : 'Contexto académico'}</span><strong>{career ? `Plan ${career.plan}` : demo.context.catalogId ? 'Catálogo no disponible' : 'Sin selección'}</strong><span className="context-selector-action">Mis carreras →</span>
  </button>
}
export function ContextPage({ demo, startAdd, reveal, onConfigure }) {
  const { context, state, careers, act } = demo
  const [draft, setDraft] = useState(careers[0].id)
  const legacy = context.authority === 'legacy'
  return <section className="context-page" aria-label="Contexto académico">
    <div className="page-heading"><span className="section-kicker">UNIVERSIDAD · CARRERA · PLAN</span><h1>Mis carreras</h1></div>
    {demo.notice && <p role="status" className="context-notice">{demo.notice}</p>}
    {legacy ? <>
      {!context.career && <><h2>Elegí tu carrera</h2><p>Elegí universidad, carrera y plan para comenzar. No se reinicia ningún progreso previo.</p></>}
      <CareerSelector careers={careers} activeCareerId={context.career?.id ?? draft} setActiveCareerId={id => context.career ? act('legacy-select', id) : setDraft(id)} />
      {!context.career && <button className="primary-btn full" onClick={() => act('legacy-select', draft)}>Empezar</button>}
      <p className="sheet-info">La selección de universidad y carrera mantiene el primer catálogo correspondiente, como en la web. Los estados se conservan por carrera y plan; no se infieren equivalencias.</p>
      {onConfigure && context.usable && <button className="secondary-btn full" disabled={demo.presentation.busy} onClick={()=>onConfigure(null)}>Configurar mis materias</button>}
    </> : <>
      <CareerCards demo={demo} startAdd={startAdd} reveal={reveal} onConfigure={onConfigure} />
    </>}
  </section>
}
export function ContextUnavailable({ demo, navigate }) {
  const { context } = demo
  const suspended = ['frozen', 'invalid'].includes(context.authority) || context.phase === 'blocked'
  const title = context.authority === 'frozen' ? 'Estamos actualizando tu cuenta' : suspended ? 'La edición está suspendida' : context.catalogId ? 'Catálogo no disponible' : 'Elegí una carrera para continuar'
  return <section className="context-empty" role="status"><h1>{title}</h1>
    <p>{suspended ? 'No pudimos habilitar este contexto. No se usa otro modelo ni se reemplazan datos.' : context.catalogId ? 'Tus datos se conservan. Este catálogo no está disponible para consultar materias.' : 'No se eligió otra carrera automáticamente. Podés revisar tus carreras o agregar la primera.'}</p>
    <button className="primary-btn full" onClick={() => navigate('carreras')}>Ir a Mis carreras</button>
  </section>
}
