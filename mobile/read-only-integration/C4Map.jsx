import React, { useEffect, useRef, useState } from 'react'
import { C4AcademicState } from './C4AcademicState.jsx'
import { C4SubjectDetail } from './C4Subjects.jsx'
import { catalogHeading, groupRowsByYear, academicPanelModel } from './c4-ui-model.mjs'
const color = row => row.recorded ? ({ Aprobada: 'approved', Regularizada: 'regularized', Cursando: 'taking', Pendiente: 'pending' })[row.status] : 'unrecorded'
export function C4MapBoard({ model, selected, onSelect }) {
  if (model.state !== 'loaded') return null
  return <div className="c4-map-board" role="region" aria-label="Materias organizadas por año; desplazamiento horizontal" tabIndex={0}>
    {groupRowsByYear(model).map(group => <section className="c4-map-year" key={String(group.year)} aria-label={group.year === null ? 'Año no informado' : `${group.year}° año`}>
      <header><h2>{group.year === null ? 'Año no informado' : `${group.year}° año`}</h2><span>{group.rows.length} actividades</span></header>
      {group.rows.map(row => <button className={`c4-map-node ${selected === row.code ? 'is-selected' : ''}`} key={row.code} aria-expanded={selected === row.code}
        aria-label={`${row.name}, ${row.code}, ${row.recorded ? row.status : 'Sin registro'}. Ver requisitos`} onClick={event => onSelect(row.code, event.currentTarget)}>
        <small>{row.code} · {row.term ?? 'Período no informado'}</small><strong>{row.name}</strong><span className={`c4-status ${color(row)}`}>{row.recorded ? row.status : 'Sin registro'}</span>
      </button>)}
    </section>)}
  </div>
}
export function C4Map({ model: input, scope, refresh }) {
  const model = academicPanelModel(input, scope)
  const [selected, setSelected] = useState(null), detail = useRef(null), trigger = useRef(null)
  useEffect(() => { if (selected) detail.current?.focus() }, [selected])
  const heading = catalogHeading(scope?.catalogId)
  return <section aria-label="Mapa académico de solo lectura">
    <header className="c4-heading"><div><span className="c4-kicker">EXPLORÁ LA ESTRUCTURA DE TU PLAN</span><h1>Mapa</h1><p>{heading ? `${heading.name} · Plan ${heading.plan}` : 'Catálogo no identificado'}</p></div></header>
    {model.state !== 'loaded' ? <C4AcademicState model={model} refresh={refresh}/> : <>
      <p className="c4-note">Materias por año, en el orden del catálogo. Elegí una para consultar sus requisitos originales. Sin cálculo de habilitación, bloqueo o elegibilidad.</p>
      <div className="c4-map-legend" aria-label="Leyenda de estados">{[['Aprobada','approved'],['Regularizada','regularized'],['Cursando','taking'],['Pendiente','pending'],['Sin registro','unrecorded']].map(([label, css]) => <span className={`c4-status ${css}`} key={label}>{label}</span>)}</div>
      <C4SubjectDetail model={model} code={selected} panelRef={detail} onClose={() => { setSelected(null); trigger.current?.focus() }}/>
      <C4MapBoard model={model} selected={selected} onSelect={(code, element) => { trigger.current = element; setSelected(code) }}/>
    </>}
  </section>
}
