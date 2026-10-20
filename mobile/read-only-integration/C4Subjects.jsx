import React, { useEffect, useRef, useState } from 'react'
import { filterSubjectRows } from './c4-ui-model.mjs'
import { C4AcademicState } from './C4AcademicState.jsx'
const statusClass = row => row.recorded ? ({ Aprobada: 'approved', Regularizada: 'regularized', Cursando: 'taking', Pendiente: 'pending' })[row.status] : 'unrecorded'
export function C4SubjectDetail({ model, code, onClose, panelRef }) {
  const subject = model.state === 'loaded' ? model.rows.find(row => row.code === code) : null
  if (!subject) return null
  function requirements(values) {
    if (values === null) return 'No informado en el catálogo'
    if (!values.length) return 'Sin requisitos declarados'
    if (values.includes('ALL')) return 'ALL: requisito global según el catálogo; no se evalúa habilitación.'
    return values.map(code => `${model.rows.find(row => row.code === code)?.name ?? code} (${code})`).join(' · ')
  }
  return <section className="c4-detail" ref={panelRef} tabIndex={-1} aria-label="Detalle de materia"><header><h2>{subject.name}</h2><button onClick={onClose}>Cerrar detalle</button></header>
    <p>{subject.code} · {subject.level ?? `${subject.year}° año`} · {subject.term ?? 'Período no informado'}</p>
    <p><strong>{subject.recorded ? subject.status : 'Sin registro'}</strong></p>
    <h3>Regularización para cursar</h3><p>{requirements(subject.prereqs)}</p>
    <h3>Aprobación para cursar</h3><p>{requirements(subject.approvedPrereqs)}</p>
    <h3>Requisitos de final declarados</h3><p>{requirements(subject.finalPrereqs)}</p><small>Requisitos estructurales de catálogo. Sin evaluación de habilitación o acciones de inscripción.</small>
  </section>
}
export function C4Subjects({ model, refresh }) {
  const [query, setQuery] = useState(''), [status, setStatus] = useState(''), [year, setYear] = useState(''), [selected, setSelected] = useState(null)
  const detail = useRef(null), trigger = useRef(null)
  useEffect(() => { if (selected) detail.current?.focus() }, [selected])
  const rows = filterSubjectRows(model, { query, status, year })
  if (model.state !== 'loaded') return <C4AcademicState model={model} refresh={refresh}/>
  return <section aria-label="Materias read-only">
    <header className="c4-heading"><div><span className="c4-kicker">CADA MATERIA, UN PASO MÁS</span><h1>Materias</h1><p>Consultá tu recorrido. Sin edición ni guardado.</p></div><button onClick={() => void refresh()}>↻ Actualizar</button></header>
    <div className="c4-counts" aria-label="Cobertura de registros"><span><strong>{model.counts.total}</strong> actividades</span><span><strong>{model.counts.recorded}</strong> registradas</span><span><strong>{model.counts.unrecorded}</strong> sin registro</span></div>
    <p className="c4-note">Sin registro no equivale a Pendiente. Revisión: {String(model.revision)}. No se calculan habilitaciones.</p>
    <div className="c4-filters"><label>Buscar materia<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Nombre o código"/></label>
      <label>Estado<select value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos</option>{['Pendiente', 'Cursando', 'Regularizada', 'Aprobada'].map(value => <option key={value}>{value}</option>)}<option value="unrecorded">Sin registro</option></select></label>
      <label>Año<select value={year} onChange={e => setYear(e.target.value)}><option value="">Todos</option>{[...new Set(model.rows.map(row => row.year).filter(Boolean))].map(value => <option key={value} value={value}>{value}° año</option>)}</select></label>
      <button onClick={() => { setQuery(''); setStatus(''); setYear(''); setSelected(null) }}>Limpiar filtros</button></div>
    <p role="status">{rows.length} de {model.counts.total} materias</p>
    <C4SubjectDetail model={model} code={selected} panelRef={detail} onClose={() => { setSelected(null); trigger.current?.focus() }}/>
    {!rows.length && <p className="c4-state">No hay materias que coincidan con estos filtros.</p>}
    <div className="c4-subjects">{rows.map(row => <button className="c4-subject" key={row.code} onClick={e => { trigger.current = e.currentTarget; setSelected(row.code) }} aria-expanded={selected === row.code}>
      <span className={`c4-dot ${statusClass(row)}`} aria-hidden="true"/><span><strong>{row.name}</strong><small>{row.code} · {row.level ?? `${row.year}° año`} · {row.term ?? 'Período no informado'}</small></span>
      <span className={`c4-status ${statusClass(row)}`}>{row.recorded ? row.status : 'Sin registro'}</span><span aria-hidden="true">›</span></button>)}</div>
  </section>
}
