import { useMemo, useState } from 'react'
import { getFinalPlanningRows, getFinalPeriodOptions, editPlannedFinal } from '../projectionLogic'

const finalPeriodLabel = p => `${p.term} ${p.year}`
const finalPeriodKey = p => `${p.year}:${p.term}`
const needsReview = row => Boolean(row.diagnostic && !['applied', 'obsolete'].includes(row.diagnostic.status))
const finalFilters = [
  ['relevant', 'Relevantes', row => row.origin === 'pending-real' || Boolean(row.event)],
  ['review', 'Requiere revisión', needsReview],
  ['planned', 'Planificados', row => row.diagnostic?.status === 'applied'],
  ['pending', 'Pendientes reales', row => row.origin === 'pending-real'],
  ['future', 'Futuros', row => row.origin === 'future'],
  ['approved', 'Ya aprobados', row => row.origin === 'approved-real'],
  ['all', 'Todos', () => true],
]
const relevanceOrder = row => needsReview(row) ? 0 : row.origin === 'pending-real' ? 1
  : row.origin === 'future' && row.diagnostic?.status === 'applied' ? 2 : 3
export function finalDiagnosticText(diagnostic) {
  return ({ NOT_REGULARIZED: 'Todavía no estaría regularizada al cierre.', FINAL_REQUIREMENTS: 'Faltan aprobaciones requeridas para rendir.',
    UNKNOWN_FINAL_CODE: 'La materia ya no está en el catálogo.', NON_CALENDAR_ACTIVITY: 'Esta actividad no se planifica como final.',
    BEFORE_START: 'El período elegido es anterior al inicio de la proyección.', OUTSIDE_HORIZON: 'El período elegido está fuera del horizonte.',
    ALREADY_APPROVED_REAL: 'Ya aprobado en tu progreso. La intención se conserva inactiva.',
    INVALID_INPUT: 'No se pudo evaluar el evento: revisá los datos de la proyección.' })[diagnostic?.reason]
    || 'La proyección no alcanzó ese período.'
}

export default function FinalPlanningPanel({ career, statusMap, scenario, result, onChange, panelRef }) {
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('relevant')
  const [viewYear, setViewYear] = useState(null)
  const input = useMemo(() => ({ career, statusMap, scenario }), [career, statusMap, scenario])
  const rows = useMemo(() => getFinalPlanningRows(input, result), [input, result])
  // Retain the editor even if a recalculation removes its row altogether.
  // The fallback is display-only and never reuses stale eligibility.
  const selected = rows.find(row => row.code === editing?.code) || (editing && {
    code: editing.code, name: editing.name, event: null, diagnostic: null,
    plannable: false, missingApproved: [], unavailable: true,
  })
  // Only the row being edited needs counterfactual simulations of possible periods.
  const options = useMemo(() => selected?.plannable ? getFinalPeriodOptions(input, editing.code) : [], [input, editing?.code, selected?.plannable])
  const years = [...new Set(options.map(option => option.period.year))]
  const year = years.includes(viewYear) ? viewYear : years.includes(selected?.event?.period.year) ? selected.event.period.year : years[0]
  const matchesFilter = finalFilters.find(([key]) => key === filter)[2]
  const visibleRows = rows.filter(row => matchesFilter(row) || row.code === editing?.code)
  if (selected?.unavailable) visibleRows.push(selected)
  if (filter === 'relevant') visibleRows.sort((a, b) => relevanceOrder(a) - relevanceOrder(b))
  const nameOf = code => career.subjects.find(s => s.code === code)?.name || code
  const yearOptions = options.filter(option => option.period.year === year)
  const optionDiagnostic = option => option.eligible ? '' : finalDiagnosticText(option.diagnostic)
    + (option.diagnostic?.missingApproved?.length > 0 ? ` Falta aprobar: ${option.diagnostic.missingApproved.map(nameOf).join(', ')}.` : '')
  // Share presentation only: never merge different reasons or prerequisite lists.
  const sharedDiagnostic = yearOptions.length === 2 && optionDiagnostic(yearOptions[0])
    && optionDiagnostic(yearOptions[0]) === optionDiagnostic(yearOptions[1])
    && yearOptions[0].diagnostic?.reason === yearOptions[1].diagnostic?.reason
    && JSON.stringify(yearOptions[0].diagnostic?.missingApproved) === JSON.stringify(yearOptions[1].diagnostic?.missingApproved)
    ? optionDiagnostic(yearOptions[0]) : ''
  return <details ref={panelRef} className="side-card projection-finals"><summary>Finales · {rows.length}
    <span className="projection-finals-summary">{rows.filter(needsReview).length} requieren revisión · {rows.filter(row => row.diagnostic?.status === 'applied').length} planificados</span>
  </summary>
    <p className="projection-muted">Finales pendientes reales y futuros. Para estimar correlativas, se supone que aprobás los finales planificados elegibles al cierre del período. Tu progreso real no cambia.</p>
    <div className="projection-final-filters" role="group" aria-label="Filtrar finales">{finalFilters.map(([key, label, predicate]) =>
      <button key={key} type="button" className="projection-action" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} ({rows.filter(predicate).length})</button>
    )}</div>
    {!rows.length && <p>No hay finales pendientes o planificados en este escenario.</p>}
    {rows.length > 0 && visibleRows.length === 0 && <p>No hay finales en este filtro. <button type="button" className="projection-action" onClick={() => setFilter('all')}>Ver todos</button></p>}
    <ul className="projection-subjects projection-final-list">{visibleRows.map(row => {
      const review = needsReview(row)
      const isEditing = editing?.code === row.code
      const editorId = `projection-final-editor-${encodeURIComponent(row.code)}`
      return <li key={row.code} className={review ? 'projection-final-review' : undefined}>
        <div className="projection-final-row"><div className="projection-final-title"><strong>{row.name}</strong>
          <div className="projection-final-meta"><span>{row.code} · {row.unavailable ? 'Fuera de la lista actual' : row.origin === 'approved-real' ? 'Ya aprobado en tu progreso' : row.origin === 'pending-real' ? 'Final pendiente real' : 'Final futuro'}</span>
            {row.event && <span className={review ? 'projection-review-label' : 'projection-badge'}>{review ? '⚠ Requiere revisión' : row.diagnostic?.status === 'obsolete' ? 'Intención inactiva' : 'Final planificado'}</span>}
          </div>
        </div><div className="projection-final-actions">
          {(row.plannable || row.event) && <button type="button" className="projection-action" aria-expanded={isEditing} aria-controls={editorId}
            aria-label={`${row.event ? 'Cambiar período del' : 'Planificar'} final de ${row.name}`} onClick={() => {
              if (isEditing && !matchesFilter(row)) panelRef?.current?.querySelector('summary')?.focus()
              setEditing(isEditing ? null : { code: row.code, name: row.name }); setViewYear(null)
            }}>{row.event ? 'Cambiar período' : 'Planificar'}</button>}
          <span>{row.event ? finalPeriodLabel(row.event.period) : 'Sin período'}</span>
        </div></div>
        {row.event && row.diagnostic?.status !== 'applied' && <small>{finalDiagnosticText(row.diagnostic)}{row.diagnostic?.missingApproved?.length > 0 && ` Falta aprobar: ${row.diagnostic.missingApproved.map(nameOf).join(', ')}.`}</small>}
        {!row.event && row.missingApproved.length > 0 && <small>Final bloqueado al cierre simulado. Falta aprobar: {row.missingApproved.map(nameOf).join(', ')}.</small>}
        {isEditing && <div id={editorId} className="projection-final-editor">
          <h4>Período del final</h4>
          {(!matchesFilter(row) || row.unavailable) && <p className="projection-muted">Esta fila se mantiene visible mientras la editás, aunque ya no pertenece al filtro actual.</p>}
          {years.length > 0 ? <>
            <label>Año <select aria-label={`Año del final de ${row.name}`} value={year} onChange={e => setViewYear(Number(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select></label>
            <div className="projection-final-terms" role="group" aria-label={`Cuatrimestre del final de ${row.name}`}>
              {yearOptions.map(option => {
                const key = finalPeriodKey(option.period)
                const reasonId = `${editorId}-${key}`
                return <div key={key}><button type="button" className="projection-action" disabled={!option.eligible}
                  aria-label={`${finalPeriodLabel(option.period)} para el final de ${row.name}`}
                  aria-pressed={Boolean(row.event && finalPeriodKey(row.event.period) === key)} aria-describedby={!option.eligible ? sharedDiagnostic ? `${editorId}-shared-reason` : reasonId : undefined}
                  onClick={() => { if (option.eligible) onChange(editPlannedFinal(input, row.code, option.period)) }}>
                  {option.period.term} · {option.eligible ? 'Elegible' : 'No disponible'}
                </button>{!option.eligible && !sharedDiagnostic && <p id={reasonId}>{optionDiagnostic(option)}</p>}</div>
              })}
            </div>
            {sharedDiagnostic && <p className="projection-final-reason" id={`${editorId}-shared-reason`}>{sharedDiagnostic}</p>}
          </> : <p>No hay períodos disponibles para este final en el escenario actual.</p>}
          <div className="projection-final-editor-actions"><button type="button" className="projection-action" disabled={!row.event}
            aria-label={`Quitar período del final de ${row.name}`} onClick={() => { if (row.event) onChange(editPlannedFinal(input, row.code, null)) }}>Quitar período</button>
            <button type="button" className="projection-action" onClick={() => {
              panelRef?.current?.querySelector('summary')?.focus(); setEditing(null)
            }}>Cerrar editor</button>
          </div>
        </div>}
      </li>
    })}</ul>
  </details>
}
