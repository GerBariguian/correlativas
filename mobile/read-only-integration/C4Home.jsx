import React from 'react'
import { C4AcademicState } from './C4AcademicState.jsx'
import { catalogHeading, academicPanelModel } from './c4-ui-model.mjs'
const labels = { Aprobada: 'Aprobadas registradas', Regularizada: 'Regularizadas registradas', Cursando: 'Cursando registradas', Pendiente: 'Pendientes explícitas' }
const colors = { Aprobada: 'approved', Regularizada: 'regularized', Cursando: 'taking', Pendiente: 'pending' }
export function C4Home({ model: input, scope, refresh }) {
  const model = academicPanelModel(input, scope)
  const heading = catalogHeading(scope?.catalogId)
  return <section aria-label="Inicio académico">
    <header className="c4-heading"><div><span className="c4-kicker">TU RECORRIDO, CON INFORMACIÓN CLARA</span><h1>Inicio</h1><p>{heading ? `${heading.university} · ${heading.name} · Plan ${heading.plan}` : 'Catálogo no identificado'}</p><small>Selección actual del laboratorio · {scope?.model ?? 'sin modelo'}</small></div>
      {model.state === 'loaded' && <button onClick={() => void refresh()}>↻ Actualizar</button>}</header>
    {model.state !== 'loaded' ? <C4AcademicState model={model} refresh={refresh}/> : <>
      <div className="c4-home-hero"><span className="c4-kicker">COBERTURA DE REGISTROS</span><h2>{model.counts.recorded} actividades con estado registrado</h2>
        <p>El catálogo contiene {model.counts.total} actividades. Hay {model.counts.unrecorded} sin registro académico.</p><p>Sin registro no significa Pendiente. Este resumen no calcula un porcentaje de avance.</p></div>
      <div className="c4-home-states" aria-label="Estados efectivamente registrados">{Object.entries(labels).map(([status, label]) => <article className={`c4-home-stat ${colors[status]}`} key={status} aria-label={`${status}: ${model.counts.byStatus[status]} registrada`}><span>{label}</span><strong>{model.counts.byStatus[status]}</strong></article>)}</div>
      {model.counts.recorded === 0 && <p className="c4-state">No hay estados registrados en este documento de progreso. Las actividades permanecen sin registro.</p>}
      <p className="c4-note">Solo lectura · Revisión {String(model.revision)} · Sin habilitaciones, recomendaciones o certificación académica.</p>
    </>}
  </section>
}
