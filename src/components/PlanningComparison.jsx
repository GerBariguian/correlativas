import { useState } from 'react'
import { compareParticipants } from '../planningLogic'
import { getSubjectLevel } from '../logic'
import { comparisonLabel } from '../planningPresentation'
import PlanningDialog from './PlanningDialog'

const layers = { approved: 'Aprobadas', available: 'Habilitadas', finals: 'Finales pendientes' }

export default function PlanningComparison({ career, participants, onPlan }) {
  const [layer, setLayer] = useState('approved')
  const [selected, setSelected] = useState(null)
  const [onlyMatches, setOnlyMatches] = useState(false)
  const rows = compareParticipants(career.subjects, participants, layer)
  const levels = [...new Set(career.subjects.map(getSubjectLevel))]
  const detail = rows.find((row) => row.subject.code === selected)
  return <section className="planning-comparison">
    <div className="top-nav" aria-label="Capa de comparación">
      {Object.entries(layers).map(([key, name]) => <button key={key} className={layer === key ? 'active' : ''} aria-pressed={layer === key} onClick={() => setLayer(key)}>{name}</button>)}
    </div>
    {layer === 'finals' && <p className="planning-muted">Un final pendiente no asegura que hoy puedas rendirlo.</p>}
    <div className="comparison-legend" aria-label="Leyenda"><span><i className="comparison-both" />Todos</span><span><i className="comparison-subset" />Algunos / Una persona</span><span><i className="comparison-neither" />Sin coincidencias</span><span>? Información incompleta</span></div>
    <label className="comparison-filter"><input type="checkbox" checked={onlyMatches} onChange={(event) => setOnlyMatches(event.target.checked)} /> Mostrar solo coincidencias entre 2 o más</label>
    {rows[0]?.missing.length > 0 && <p className="planning-muted">Falta información de {rows[0].missing.map((p) => p.name).join(', ')}. Sigue incluida en el total.</p>}
    {detail && <PlanningDialog open title={detail.subject.name} onClose={() => setSelected(null)}>
      <p>{comparisonLabel(detail, layer)}</p>
      <ul>{participants.map((p) => <li key={p.uid}>{p.name}: {detail.missing.includes(p) ? 'Sin datos para esta capa' : detail.matches.includes(p) ? layers[layer] : 'No figura en esta capa'}</li>)}</ul>
      <p>La ausencia en esta capa no revela otros estados académicos.</p>
      <details><summary>Información de la comparación</summary>{participants.filter((p) => p.snapshot?.updatedAt?.toDate).map((p) => <p key={p.uid}>{p.name}: {p.snapshot.updatedAt.toDate().toLocaleString('es-AR')}.</p>)}<p>La habilitación no confirma oferta, horarios, cupos ni intención individual.</p></details>
      {layer === 'available' && detail.matches.length >= 2 && <button className="planning-primary" onClick={() => { onPlan(detail.subject.code, detail.matches.map((p) => p.uid)); setSelected(null) }}>Agregar al plan conjunto</button>}
    </PlanningDialog>}
    <div className="career-map">
      {levels.map((level) => <article className="year-column" key={level}>
        <div className="year-title"><strong>{level}</strong></div>
        <div className="map-subjects">
          {rows.filter((row) => getSubjectLevel(row.subject) === level && (!onlyMatches || row.matches.length >= 2)).map((row) => <button key={row.subject.code}
            className={`map-subject comparison-${row.category} ${row.missing.length ? 'comparison-incomplete' : ''} ${selected === row.subject.code ? 'selected' : ''}`}
            aria-pressed={selected === row.subject.code} onClick={() => setSelected(row.subject.code)}>
            <span>{row.subject.code}</span><strong>{row.subject.name}</strong><small>{comparisonLabel(row, layer)}</small>
            {!!row.missing.length && <small>? {row.missing.length} sin información</small>}
            <small>Ver detalle</small>
          </button>)}
        </div>
      </article>)}
    </div>
    {onlyMatches && !rows.some((row) => row.matches.length >= 2) && <p>No hay coincidencias conocidas en esta capa.</p>}
  </section>
}
