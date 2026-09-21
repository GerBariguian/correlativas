import { useMemo, useState } from 'react'
import { projectCareer, getProjectionDuration, editProjectionPeriod } from '../projectionLogic'

const periodLabel = p => p ? `${p.term} ${p.year}` : null
const diagnosticText = {
  INVALID_CATALOG: 'El catálogo está vacío o no tiene una lista de materias válida.',
  INVALID_TEMPORAL_METADATA: 'La duración o los períodos permitidos de una materia no son válidos.',
  INVALID_CODE: 'El catálogo contiene un código vacío, inválido o repetido.',
  INVALID_REQUIREMENTS: 'Hay correlativas con un formato inválido en el catálogo.',
  REQUIREMENT_CYCLE: 'El catálogo contiene dependencias circulares.',
  INVALID_STATUS_MAP: 'No se recibió un mapa de progreso válido.',
  INVALID_START_PERIOD: 'El período inicial no es válido.',
  INVALID_CAPACITY: 'La cantidad de materias no es un entero válido.',
  INVALID_HORIZON: 'La extensión o las fechas del escenario superan el horizonte admitido.',
  INVALID_SCENARIO_LIST: 'La lista de ajustes o eventos del escenario no es válida.',
  INVALID_EVENT_PERIOD: 'Un ajuste o evento tiene una fecha inválida o anterior al inicio.',
  DUPLICATE_SCENARIO_ENTRY: 'Hay ajustes o eventos repetidos en el escenario.',
  INVALID_SCENARIO_ENTRY: 'Un ajuste o evento contiene una cantidad o materia inválida.',
  INVALID_MANUAL_PERIODS: 'La lista de decisiones manuales no es válida.',
  INVALID_MANUAL_PERIOD: 'Una decisión manual tiene un período o una selección inválida.',
  DUPLICATE_MANUAL_PERIOD: 'Un período tiene más de una selección manual.',
  INVALID_MANUAL_CODE: 'Una decisión manual contiene una materia desconocida o repetida.',
  CURRENT_PERIOD_READ_ONLY: 'Hay una decisión manual sobre el período real en curso, que es de solo lectura.',
  FINAL_NOT_AVAILABLE: 'Un final planificado no cumple sus requisitos en el período indicado.',
  CAPACITY_BELOW_CONTINUING: 'La carga futura no alcanza para las continuaciones obligatorias.',
}
const outcomeText = {
  invalid: 'No pudimos proyectar con estos datos. Revisá el período y la coherencia de tu situación académica.',
  blocked: 'El recorrido necesita cumplir requisitos para continuar. Revisá las materias pendientes.',
  horizon: 'Quedan cursadas fuera del horizonte de 40 cuatrimestres. Revisá tus decisiones y las materias pendientes.',
  'capacity-conflict': 'La capacidad futura no alcanza para una continuación obligatoria. Revisá la propuesta.',
  'invalid-event': 'Una aprobación planificada no pudo realizarse.',
}

function ProjectionSummary({ summary, count }) {
  return <section className="side-card projection-overview" aria-label="Resumen de proyección" aria-live="polite">
    <h3>Fin estimado de cursadas</h3>
    <strong>{periodLabel(summary.estimatedCourseEnd) || (summary.coursesComplete ? 'Cursadas ya completadas' : 'Sin determinar')}</strong>
    <p>{summary.estimatedAcademicEnd ? `Finalización estimada: ${periodLabel(summary.estimatedAcademicEnd)}`
      : summary.academicComplete ? 'Carrera ya completada' : summary.pendingActivities.length ? 'Finalización pendiente de finales y acreditaciones' : 'Finalización pendiente de planificar finales'}</p>
    <small className="projection-muted">Estimación basada en la planificación actual. · {count} cuatrimestres</small>
  </section>
}

function ProjectionSemester({ career, entry, result, onEdit }) {
  const nameOf = code => career.subjects.find(s => s.code === code)?.name || code
  return <article className="side-card projection-semester">
    <header className="projection-period-heading"><h3>{periodLabel(entry.period)}{entry.readOnly && ' · En curso'}</h3><span>{entry.started.length + entry.continuing.length} materias{entry.readOnly && ' reales'}</span></header>
    <ul className="projection-subjects">{[...entry.continuing, ...entry.started].map(code => {
      const annual = getProjectionDuration(career, career.subjects.find(s => s.code === code)) === 2
      const continuing = entry.continuing.includes(code)
      const initial = continuing && !result.periods.some(p => p.started.includes(code))
      const unlocks = entry.ranking.find(r => r.code === code)?.effectiveUnlocks.length ?? 0
      return <li key={code}><div className="projection-subject-row">
        <details><summary>{nameOf(code)} {annual && <small className="projection-badge">{continuing ? 'Anual · continuación' : 'Anual · inicio'}</small>}{initial && <small className="projection-badge">Cursando</small>}</summary>
          <div className="projection-detail"><small>{code} · Al cierre: {entry.statusMap[code]}</small>
            {annual && <p>Una misma materia ocupa ambos cuatrimestres. Para quitarla, editá su inicio.{initial && ' Ya está en curso: se estima su cierre en este primer período.'}</p>}
            {unlocks > 0 && <p>Su regularización habilita {unlocks} materias según el estado de inicio.</p>}
          </div>
        </details>
        {!continuing && <button type="button" className="projection-icon" aria-label={`Quitar ${nameOf(code)} de ${periodLabel(entry.period)}`} onClick={() => onEdit(entry.period, code, 'remove')}>×</button>}
      </div></li>
    })}</ul>
    {!entry.started.length && !entry.continuing.length && <p className="projection-muted">Sin materias planificadas.</p>}
    {!entry.readOnly && <details className="projection-picker" key={entry.started.join('|')}><summary>+ Agregar materia</summary>
      <>
        {!entry.addCandidates.length && <p>No hay otras materias habilitadas para comenzar en este período.</p>}
        <ul>{entry.addCandidates.map(code => {
          const planned = result.periods.find(p => p.started.includes(code))
          return <li key={code}><span>{nameOf(code)}{planned && <small className="projection-muted"> · Prevista en {periodLabel(planned.period)}</small>}</span>
            <button type="button" className="projection-action" aria-label={`Agregar ${nameOf(code)} a ${periodLabel(entry.period)}`} onClick={() => onEdit(entry.period, code, 'add')}>{planned ? 'Mover aquí' : 'Agregar'}</button>
          </li>
        })}</ul>
      </>
    </details>}
  </article>
}

function PendingFinalsPanel({ finals, titleOf }) {
  return <details className="side-card projection-finals"><summary>Finales pendientes ({finals.length}) <span className="projection-muted">· Ver finales</span></summary>
    <p className="projection-muted">Al cierre simulado. Regularizada no significa Aprobada. En esta etapa no se programan finales.</p>
    {!finals.length && <p>No hay finales de materias regularizadas pendientes en este estado.</p>}
    <ul className="projection-subjects">{finals.map(final => <li key={final.code}><strong>{titleOf(final.code)}</strong>
      <span>{final.available ? 'Final habilitado' : 'Final bloqueado'}</span>
      {!final.available && <small>Falta aprobar: {final.missingApproved.map(titleOf).join(', ')}.</small>}
    </li>)}</ul>
  </details>
}

export default function CareerProjectionPage({ career, statusMap }) {
  const [initialCapacity, setInitialCapacity] = useState(4)
  // App has no academic-calendar source. Keep the existing editable calendar
  // default, initialized once outside the pure engine, never an eligibility rule.
  const [startPeriod, setStartPeriod] = useState(() => {
    const today = new Date()
    return { year: today.getFullYear(), term: today.getMonth() < 6 ? '1C' : '2C' }
  })
  const [scenario, setScenario] = useState(null)
  const result = useMemo(() => scenario ? projectCareer({ career, statusMap, scenario }) : null, [career, statusMap, scenario])
  const titleOf = code => `${career.subjects.find(s => s.code === code)?.name || code} (${code})`
  function edit(period, code, action) {
    setScenario(previous => editProjectionPeriod(previous, result, period, code, action))
  }
  function generate(event) {
    event.preventDefault()
    if (!Number.isSafeInteger(initialCapacity) || initialCapacity < 1) return
    if (!Number.isInteger(startPeriod.year) || startPeriod.year < 1 || startPeriod.year > 9979) return
    setScenario({ startPeriod: { ...startPeriod }, initialCapacity, capacities: [], manualPeriods: [], finalEvents: [], maxPeriods: 40 })
  }
  const setup = <form onSubmit={generate} className="projection-setup">
    <div className="projection-load"><label htmlFor="projection-load">¿Con qué carga querés comenzar?</label>
      <div className="projection-load-controls">
        <button type="button" className="projection-action" aria-label="Disminuir carga inicial" disabled={!Number.isSafeInteger(initialCapacity) || initialCapacity <= 1} onClick={() => setInitialCapacity(n => n - 1)}>−</button>
        <input id="projection-load" aria-label="Cantidad inicial de materias" type="number" min="1" step="1" required value={initialCapacity} onChange={e => setInitialCapacity(e.target.value === '' ? '' : Number(e.target.value))} />
        <span>materias</span>
        <button type="button" className="projection-action" aria-label="Aumentar carga inicial" disabled={!Number.isSafeInteger(initialCapacity) || initialCapacity >= Number.MAX_SAFE_INTEGER} onClick={() => setInitialCapacity(n => n + 1)}>+</button>
      </div>
      {(!Number.isSafeInteger(initialCapacity) || initialCapacity < 1) && <small role="alert">Ingresá una cantidad entera positiva representable de forma exacta.</small>}
    </div>
    <small className="projection-muted">Después podés cambiar las materias de cada cuatrimestre.</small>
    <details><summary>Período inicial · {periodLabel(startPeriod)}</summary><div className="projection-period-heading">
      <label>Cuatrimestre inicial <select value={startPeriod.term} onChange={e => setStartPeriod(p => ({ ...p, term: e.target.value }))}><option>1C</option><option>2C</option></select></label>
      <label>Año inicial <input type="number" min="1" max="9979" required value={startPeriod.year || ''} onChange={e => setStartPeriod(p => ({ ...p, year: Number(e.target.value) }))} /></label>
    </div></details>
    <button className="reset" type="submit">{result ? 'Reemplazar proyección' : 'Generar proyección'}</button>
    {result && <small className="projection-muted">Reemplaza tus decisiones manuales. El progreso real no cambia.</small>}
  </form>
  const affected = result?.placementDiagnostics.filter(d => d.status !== 'applied') ?? []
  const generationFailed = result && ['invalid', 'capacity-conflict', 'invalid-event'].includes(result.outcome)
  return <div className="projection-page">
    <section className="side-card projection-intro"><h2>Proyectar carrera</h2>
      {!result && <p>Simulá cómo podría avanzar tu carrera según tu situación académica actual.</p>}
      {result ? <details><summary>Nueva propuesta · {career.name}</summary>{setup}</details> : setup}
    </section>
    {result && <>
      {outcomeText[result.outcome] && <p role="status" className="side-card">{outcomeText[result.outcome]}</p>}
      {generationFailed && result.errors.length > 0 && <details className="side-card"><summary>Ver qué impide proyectar</summary><ul>{result.errors.map((error, index) => <li key={index}>
        {error.code === 'INCONSISTENT_STATUS' ? <><strong>{titleOf(error.detail)} · {error.subjectStatus}</strong>
          <p>El estado registrado no cumple los requisitos del catálogo actual.</p>
          {error.regularized.length > 0 && <p>Falta regularizar: {error.regularized.map(titleOf).join(', ')}.</p>}
          {error.approved.length > 0 && <p>Falta aprobar para cursar: {error.approved.map(titleOf).join(', ')}.</p>}
          {error.missingFinalApproved.length > 0 && <p>Falta aprobar para el final: {error.missingFinalApproved.map(titleOf).join(', ')}.</p>}
        </> : <p>{error.code === 'UNKNOWN_REQUIREMENT' ? `El catálogo referencia una materia ausente: ${error.detail.code}, requerida por ${titleOf(error.detail.subject)}.`
          : error.code === 'INVALID_STATUS' ? `Estado o código de progreso no reconocido: ${error.detail.code}.`
            : diagnosticText[error.code] || 'No se pudo interpretar un dato del escenario. No se modificó el progreso.'}</p>}
      </li>)}</ul></details>}
      {!generationFailed && <>
      {result.summary && <ProjectionSummary summary={result.summary} count={result.periods.length} />}
      {affected.length > 0 && <section className="side-card" role="status"><h3>Decisiones que necesitan revisión</h3><ul>{affected.map(d => <li key={d.code}>
        <strong>{titleOf(d.code)} · {periodLabel(d.period)}</strong>
        <p>{d.reason === 'ACADEMIC_REQUIREMENTS' ? 'Ya no cumple los requisitos al comienzo de ese cuatrimestre.'
          : d.reason === 'START_TERM' ? `Solo puede comenzar en ${(d.allowedStartTerms ?? []).join(' o ')}.` : d.reason === 'NOT_PENDING' ? 'Su estado actual ya no permite iniciar esa cursada.'
            : d.reason === 'CAPACITY' ? 'Se alcanzó el límite de materias simultáneas.'
              : d.reason === 'CONTINUATION_CAPACITY' ? 'Falta un cupo para la continuación anual.' : 'La proyección no alcanzó ese período.'}
          {d.regularized?.length > 0 && ` Falta regularizar: ${d.regularized.map(titleOf).join(', ')}.`}
          {d.approved?.length > 0 && ` Falta aprobar: ${d.approved.map(titleOf).join(', ')}.`}</p>
        <button type="button" className="projection-action" onClick={() => setScenario(s => ({ ...s, manualPeriods: s.manualPeriods.map(m => ({ ...m, codes: m.codes.filter(c => c !== d.code) })) }))}>Liberar decisión de {titleOf(d.code)}</button>
      </li>)}</ul></section>}
      {result.summary?.academicComplete && <p className="side-card">¡Carrera completada! No hay cursadas por proyectar.</p>}
      <div className="projection-timeline">{result.periods.map(entry => <ProjectionSemester key={periodLabel(entry.period)} career={career} entry={entry} result={result} onEdit={edit} />)}</div>
      {result.blockers.length > 0 && <details className="side-card"><summary>Materias con requisitos pendientes ({result.blockers.length})</summary><p>No podés cursarlas todavía.</p><ul>{result.blockers.map(s => <li key={s.code}><strong>{titleOf(s.code)}</strong>
        {s.regularized.length > 0 && <p>Falta regularizar: {s.regularized.map(titleOf).join(', ')}.</p>}
        {s.approved.length > 0 && <p>Falta aprobar: {s.approved.map(titleOf).join(', ')}.</p>}
      </li>)}</ul></details>}
      {result.summary && !result.summary.academicComplete && <PendingFinalsPanel finals={result.summary.pendingFinals} titleOf={titleOf} />}
      {result.summary?.pendingActivities.length > 0 && <details className="side-card"><summary>Actividades pendientes de acreditar ({result.summary.pendingActivities.length})</summary>
        <p>No se asigna una fecha ni se acredita automáticamente esta actividad.</p>
        <ul>{result.summary.pendingActivities.map(a => <li key={a.code}><strong>{titleOf(a.code)}</strong><p>{a.eligible ? 'Requisitos de inicio satisfechos' : 'Requisitos de inicio pendientes'} · {a.status}</p>
          {a.regularized.length > 0 && <p>Falta regularizar: {a.regularized.map(titleOf).join(', ')}.</p>}
          {a.approved.length > 0 && <p>Falta aprobar: {a.approved.map(titleOf).join(', ')}.</p>}
        </li>)}</ul>
      </details>}
      </>}
    </>}
  </div>
}
