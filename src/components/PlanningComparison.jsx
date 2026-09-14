import { useState } from 'react'
import { compareParticipants } from '../planningLogic'
import { getSubjectLevel } from '../logic'

const layers = { approved: 'Aprobadas', available: 'Habilitadas', finals: 'Finales pendientes' }
function label(row) {
  const count = `${row.matches.length}/${row.total}`
  return row.all ? `Todos · ${count}` : `${count} · ${!row.missing.length && row.matches.length === 1 && row.matches[0].isSelf ? 'Solo vos' : row.matches.length ? 'Coincidencias conocidas' : 'Sin coincidencias conocidas'}`
}

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
    <p>{layer === 'finals' ? 'Final pendiente significa materia regularizada aún no aprobada. No asegura que hoy puedas rendir el final.' : 'Habilitada significa que cumple las correlativas según el progreso guardado. No confirma intención de cursada, oferta, horarios ni cupos.'}</p>
    <p className="comparison-legend">Todos · subconjunto · solo vos · solo un amigo · sin coincidencias conocidas. El total siempre incluye a todas las personas seleccionadas.</p>
    <label><input type="checkbox" checked={onlyMatches} onChange={(event) => setOnlyMatches(event.target.checked)} /> Mostrar solo coincidencias de al menos dos personas</label>
    {participants.filter((p) => p.snapshot?.updatedAt?.toDate).map((p) => <p className="comparison-timestamp" key={p.uid}>{p.name}: datos del {p.snapshot.updatedAt.toDate().toLocaleString('es-AR')}.</p>)}
    {detail && <aside className="side-card comparison-detail" aria-live="polite">
      <h3>{detail.subject.name}</h3><p>{label(detail)}</p>
      <ul>{participants.map((p) => <li key={p.uid}>{p.name}: {detail.missing.includes(p) ? 'Sin datos para esta capa' : detail.matches.includes(p) ? layers[layer] : 'No figura en esta capa'}</li>)}</ul>
      <p>La ausencia en esta capa no revela otros estados académicos.</p>
      {layer === 'available' && detail.matches.length >= 2 && <button className="reset" onClick={() => onPlan(detail.subject.code)}>Agregar al plan conjunto</button>}
    </aside>}
    <div className="career-map">
      {levels.map((level) => <article className="year-column" key={level}>
        <div className="year-title"><strong>{level}</strong></div>
        <div className="map-subjects">
          {rows.filter((row) => getSubjectLevel(row.subject) === level && (!onlyMatches || row.matches.length >= 2)).map((row) => <button key={row.subject.code}
            className={`map-subject comparison-${row.category} ${row.missing.length ? 'comparison-incomplete' : ''} ${selected === row.subject.code ? 'selected' : ''}`}
            aria-pressed={selected === row.subject.code} onClick={() => setSelected(row.subject.code)}>
            <span>{row.subject.code}</span><strong>{row.subject.name}</strong><small>{label(row)}</small>
            {!!row.matches.length && <small>{row.matches.map((p) => p.name).join(' · ')}</small>}
            {!!row.missing.length && <small>Sin datos de {row.missing.map((p) => p.name).join(', ')}</small>}
          </button>)}
        </div>
      </article>)}
    </div>
    {onlyMatches && !rows.some((row) => row.matches.length >= 2) && <p>No hay coincidencias conocidas en esta capa.</p>}
  </section>
}
