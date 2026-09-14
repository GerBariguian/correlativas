import { useState } from 'react'
import { comparePlanning } from '../planningLogic'
import { getSubjectLevel } from '../logic'

const messages = {
  loading: 'Cargando comparación...',
  disabled: 'Este amigo no comparte su progreso.',
  incompatible: 'Tu amigo comparte otra carrera o plan. Solo se pueden comparar planes iguales.',
  stale: 'El resumen no está disponible o está desactualizado. Tu amigo puede actualizar sus datos compartidos en Amigos.',
  unavailable: 'No se pudo verificar el acceso. Revisá la conexión, la amistad y el permiso para compartir.',
}

export default function PlanningComparison({ career, mine, comparison, friendName }) {
  const [layer, setLayer] = useState('approved')
  const [selected, setSelected] = useState(null)
  const rows = comparison.state === 'ready' ? comparePlanning(career.subjects, mine, comparison.snapshot, layer) : []
  const levels = [...new Set(career.subjects.map(getSubjectLevel))]
  const detail = rows.find((row) => row.subject.code === selected)
  const labels = { both: layer === 'approved' ? 'Ambos aprobaron' : 'Ambos pueden cursarla', mine: 'Solo vos', friend: `Solo ${friendName}`, neither: layer === 'approved' ? 'Sin aprobación registrada' : 'Sin habilitación registrada' }
  return <section className="planning-comparison">
    <div className="top-nav" aria-label="Capa de comparación">
      <button className={layer === 'approved' ? 'active' : ''} aria-pressed={layer === 'approved'} onClick={() => setLayer('approved')}>Aprobadas</button>
      <button className={layer === 'available' ? 'active' : ''} aria-pressed={layer === 'available'} onClick={() => setLayer('available')}>Habilitadas</button>
    </div>
    <p>Habilitada significa que cumple las correlativas según el progreso guardado. No confirma oferta, horarios ni cupos.</p>
    {comparison.state !== 'ready' ? <p role="status">{messages[comparison.state]}</p> : <>
      <p className="comparison-legend">Cada materia indica: ambos · solo vos · solo {friendName} · sin coincidencia en esta capa.</p>
      {comparison.snapshot.updatedAt?.toDate && <p>Datos de {friendName} actualizados: {comparison.snapshot.updatedAt.toDate().toLocaleString('es-AR')}.</p>}
      {detail && <aside className="side-card" aria-live="polite">
        <h3>{detail.subject.name}</h3>
        <p>{labels[detail.category]}</p>
        <p>Vos: {detail.own ? (layer === 'approved' ? 'Aprobada' : 'Habilitada') : 'No figura en esta capa'}.</p>
        <p>{friendName}: {detail.other ? (layer === 'approved' ? 'Aprobada' : 'Habilitada') : 'No figura en esta capa'}.</p>
        <p>La ausencia en esta capa no muestra si una materia está cursando, regularizada o bloqueada.</p>
      </aside>}
      <div className="career-map">
        {levels.map((level) => <article className="year-column" key={level}>
          <div className="year-title"><strong>{level}</strong></div>
          <div className="map-subjects">
            {rows.filter((row) => getSubjectLevel(row.subject) === level).map((row) => <button key={row.subject.code}
              className={`map-subject comparison-${row.category} ${selected === row.subject.code ? 'selected' : ''}`}
              aria-pressed={selected === row.subject.code} onClick={() => setSelected(row.subject.code)}>
              <span>{row.subject.code}</span><strong>{row.subject.name}</strong><small>{labels[row.category]}</small>
            </button>)}
          </div>
        </article>)}
      </div>
    </>}
  </section>
}
