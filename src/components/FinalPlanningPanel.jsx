import { useMemo, useState } from 'react'
import { getFinalPlanningRows, getFinalPeriodOptions, editPlannedFinal } from '../projectionLogic'

const finalPeriodLabel = p => `${p.term} ${p.year}`
const finalPeriodKey = p => `${p.year}:${p.term}`
export function finalDiagnosticText(diagnostic) {
  return ({ NOT_REGULARIZED: 'Todavía no estaría regularizada al cierre.', FINAL_REQUIREMENTS: 'Faltan aprobaciones requeridas para rendir.',
    UNKNOWN_FINAL_CODE: 'La materia ya no está en el catálogo.', NON_CALENDAR_ACTIVITY: 'Esta actividad no se planifica como final.',
    BEFORE_START: 'El período elegido es anterior al inicio de la proyección.', OUTSIDE_HORIZON: 'El período elegido está fuera del horizonte.',
    ALREADY_APPROVED_REAL: 'Ya aprobado en tu progreso. La intención se conserva inactiva.',
    INVALID_INPUT: 'No se pudo evaluar el evento: revisá los datos de la proyección.' })[diagnostic?.reason]
    || 'La proyección no alcanzó ese período.'
}

export default function FinalPlanningPanel({ career, statusMap, scenario, result, onChange }) {
  const [editing, setEditing] = useState(null)
  const input = useMemo(() => ({ career, statusMap, scenario }), [career, statusMap, scenario])
  const rows = useMemo(() => getFinalPlanningRows(input, result), [input, result])
  const selected = rows.find(row => row.code === editing)
  // Only the row being edited needs counterfactual simulations of possible periods.
  const options = useMemo(() => selected?.plannable ? getFinalPeriodOptions(input, editing) : [], [input, editing, selected?.plannable])
  const nameOf = code => career.subjects.find(s => s.code === code)?.name || code
  return <details className="side-card projection-finals"><summary>Finales ({rows.length}) <span className="projection-muted">· Ver y planificar</span></summary>
    <p className="projection-muted">Finales pendientes reales y futuros. Para estimar correlativas, se supone que aprobás los finales planificados elegibles al cierre del período. Tu progreso real no cambia.</p>
    {!rows.length && <p>No hay finales pendientes o planificados en este escenario.</p>}
    <ul className="projection-subjects">{rows.map(row => {
      const review = row.diagnostic && !['applied', 'obsolete'].includes(row.diagnostic.status)
      return <li key={row.code}><strong>{row.name} ({row.code})</strong>
        <span>{row.origin === 'approved-real' ? 'Ya aprobado en tu progreso' : row.origin === 'pending-real' ? 'Final pendiente real' : 'Final futuro'}</span>
        {row.event ? <><span>{review ? 'Requiere revisión' : row.diagnostic?.status === 'obsolete' ? 'Intención inactiva' : 'Final planificado'} · {finalPeriodLabel(row.event.period)}</span>
          {row.diagnostic?.status === 'applied' ? <small>Aprobación supuesta al cierre, solo dentro de la simulación.</small>
            : <small>{finalDiagnosticText(row.diagnostic)}{row.diagnostic?.missingApproved?.length > 0 && ` Falta aprobar: ${row.diagnostic.missingApproved.map(nameOf).join(', ')}.`}</small>}
        </> : <><span>Sin período</span>{row.missingApproved.length > 0 && <small>Final bloqueado al cierre simulado. Falta aprobar: {row.missingApproved.map(nameOf).join(', ')}.</small>}</>}
        {(row.plannable || row.event) && <button type="button" className="projection-action" aria-label={`Planificar final de ${row.name}`} onClick={() => setEditing(editing === row.code ? null : row.code)}>{row.event ? 'Cambiar período' : 'Planificar'}</button>}
        {editing === row.code && <label>Período del final
          <select aria-label={`Período del final de ${row.name}`} value={row.event ? finalPeriodKey(row.event.period) : ''} onChange={e => {
            const choice = options.find(option => finalPeriodKey(option.period) === e.target.value)
            if (!e.target.value || choice?.eligible) onChange(editPlannedFinal(input, row.code, choice?.period ?? null))
          }}>
            <option value="">Sin período</option>
            {row.event && !options.some(o => finalPeriodKey(o.period) === finalPeriodKey(row.event.period))
              && <option value={finalPeriodKey(row.event.period)} disabled>{finalPeriodLabel(row.event.period)} · {row.diagnostic?.status === 'obsolete' ? 'Inactivo' : 'Requiere revisión'}</option>}
            {options.map(option => <option key={finalPeriodKey(option.period)} value={finalPeriodKey(option.period)} disabled={!option.eligible}>
              {finalPeriodLabel(option.period)}{!option.eligible && ` · ${finalDiagnosticText(option.diagnostic)}`}
            </option>)}
          </select>
        </label>}
      </li>
    })}</ul>
  </details>
}
