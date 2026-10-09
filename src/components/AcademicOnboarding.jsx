import { useEffect, useRef, useState } from 'react'
import { STATUS } from '../logic'
import { groupOnboardingSubjects, selectOnboardingSubjects, assignOnboardingSelection, undoOnboardingDecision, redoOnboardingDecision, onboardingReviewProgress, prepareOnboardingChanges } from '../academicOnboardingLogic'
import { onboardingSaveError } from '../academicOnboardingController'
import './AcademicOnboarding.css'

const statusClass = { Pendiente: 'pending', Cursando: 'course', Regularizada: 'regular', Aprobada: 'approved' }
const marks = { Pendiente: '○', Cursando: '◷', Regularizada: '◇', Aprobada: '✓' }
function StateBadge({ value }) {
  return <span className={`status ${value ? statusClass[value] : 'unreviewed'}`}>{value ? `${marks[value]} ${value}` : 'Sin revisar'}</span>
}

// Mounted for one explicitly chosen Bridge source. Draft edits never call save.
export default function AcademicOnboarding({ career, source, onExit }) {
  const [phase, setPhase] = useState('loading'), [step, setStep] = useState(0)
  const [choice, setChoice] = useState('experienced'), [draft, setDraft] = useState(null)
  const [error, setError] = useState(''), [result, setResult] = useState(null), [attempt, setAttempt] = useState(0)
  const controller = useRef(null), alive = useRef(false), submitting = useRef(false), heading = useRef(null)
  const generation = useRef(0)
  const originalSource = useRef(source)
  const sameSource = originalSource.current === source
  useEffect(() => {
    alive.current = true
    generation.current++
    let current = true
    setPhase('loading'); setError(''); setDraft(null); controller.current = null
    async function load() {
      try {
        if (!sameSource) throw new Error('ACADEMIC_SCOPE_CHANGED')
        const next = source.createOnboarding()
        const loaded = await next.load()
        if (!current) return
        controller.current = next; setDraft(loaded); setPhase('ready')
      } catch (failure) {
        if (current) { setError(onboardingSaveError(failure).message); setPhase('error') }
      }
    }
    load()
    return () => { current = false; alive.current = false; generation.current++ }
  }, [source, attempt])
  useEffect(() => { heading.current?.focus() }, [step, phase])
  const busy = phase === 'saving'
  const ready = phase === 'ready' && sameSource
  function change(update) {
    if (!ready || submitting.current) return
    try { setDraft(update(draft)) } catch (failure) { setError(onboardingSaveError(failure).message); setPhase('error') }
  }
  async function confirm() {
    if (!ready || submitting.current) return
    submitting.current = true; setPhase('saving'); setError('')
    const token = generation.current
    try {
      const saved = await controller.current.confirm(draft, choice)
      if (alive.current && generation.current === token) { setResult(saved); setPhase('success') }
    } catch (failure) {
      if (alive.current && generation.current === token) { setError(onboardingSaveError(failure).message); setPhase('error') }
    } finally { submitting.current = false }
  }
  function navigate(next) { if (ready) setStep(next) }
  const review = draft ? onboardingReviewProgress(draft) : null
  const entries = draft ? prepareOnboardingChanges(draft, choice).entries : []
  const subjects = new Map(career.subjects.map(s => [s.code, s]))
  const groups = groupOnboardingSubjects(career.subjects)
  const years = [...new Set(groups.map(g => JSON.stringify([g.year, g.level])))].map(key => ({ key, groups: groups.filter(g => JSON.stringify([g.year, g.level]) === key) }))
  const yearLabel = group => group.level || (typeof group.year === 'number' ? `${group.year}.º año` : group.year) || 'Año no especificado'
  return <section className="academic-onboarding" aria-label="Configuración académica inicial" aria-busy={busy || phase === 'loading'}>
    <header className="brand-row"><div className="brand"><img src="/logo.png" alt="" /><div><strong>Correlativas</strong><span>Planificá tu carrera. Descubrí tu camino.</span></div></div>
      {phase !== 'success' && <button className="text-button" disabled={busy} onClick={onExit}>Salir sin confirmar</button>}</header>
    <nav aria-label="Pasos del onboarding" className="steps">{['Bienvenida', 'Carga académica', 'Revisión'].map((name, index) => <button key={name} className="step" aria-current={step === index ? 'step' : undefined}
      disabled={!ready || (index === 1 && choice !== 'experienced')} onClick={() => navigate(index)}><b>{index + 1}</b>{name}</button>)}</nav>
    {phase === 'loading' && <div className="empty" role="status"><h1 ref={heading} tabIndex={-1}>Cargando tu progreso…</h1><p>Verificamos los estados guardados antes de habilitar la edición.</p></div>}
    {(phase === 'error' || !sameSource) && <div className="empty"><h1 ref={heading} tabIndex={-1}>Necesitamos actualizar tu progreso</h1><p role="alert">{!sameSource ? 'La cuenta o carrera cambió. Cerrá este recorrido y abrilo nuevamente.' : error}</p>
      <p className="muted">La recarga descarta el borrador y consulta el estado guardado. No se reintenta ninguna escritura automáticamente.</p>
      {sameSource && <button onClick={() => { setStep(0); setAttempt(n => n + 1) }}>Recargar progreso</button>}</div>}
    {phase === 'success' && <div className="welcome success"><div className="success-icon" aria-hidden="true">✓</div><p className="eyebrow">Tu punto de partida</p>
      <h1 ref={heading} tabIndex={-1}>{result?.saved ? 'Tu progreso quedó guardado' : 'Tu progreso se mantiene intacto'}</h1>
      <p className="muted">{result?.saved ? 'Guardamos únicamente las decisiones nuevas de esta carrera.' : 'Continuaste sin agregar ni reemplazar estados.'}</p>
      <button className="primary" onClick={onExit}>Ir a mi carrera →</button></div>}
    {(ready || busy) && draft && <fieldset className="content" disabled={busy}>
      {step === 0 && <section className="welcome"><div className="welcome-intro"><div className="career-chip">{career.university} · {career.name} · Plan {career.plan}</div>
        <p className="eyebrow">Tu punto de partida</p><h1 ref={heading} tabIndex={-1}>Tu recorrido empieza donde estás.</h1><p className="muted">Contanos en qué momento de la carrera estás.<br />Después, te ayudamos a organizar lo que viene.</p></div>
        <div className="options" role="group" aria-label="Situación académica">
          {[['starting', '↗', 'Estoy empezando', 'Todavía no cursé materias. Quiero explorar mi carrera sin cargar estados ahora.'], ['experienced', '☷', 'Ya tengo materias cursadas', 'Quiero marcar mis avances y ver qué materias puedo cursar después.']].map(([id, icon, title, description]) =>
            <button key={id} className={`option ${choice === id ? 'selected' : ''}`} aria-pressed={choice === id} onClick={() => setChoice(id)}><span className="radio" aria-hidden="true" /><span className="option-icon" aria-hidden="true">{icon}</span><strong>{title}</strong><small>{description}</small></button>)}
        </div><button className={`later ${choice === 'later' ? 'selected' : ''}`} aria-pressed={choice === 'later'} onClick={() => setChoice('later')}>Prefiero hacerlo después →</button>
        <div className="notice"><span aria-hidden="true">ⓘ</span><p>{review.protected ? `${review.protected} materias ya tienen progreso guardado. ` : ''}Los estados existentes se conservan en todas las opciones. Empezar no significa reiniciar.</p></div>
        <div className="actions"><small>Podés revisar y corregir todo antes de confirmar.</small><button className="primary" onClick={() => navigate(choice === 'experienced' ? 1 : 2)}>{choice === 'experienced' ? 'Configurar mis materias' : 'Continuar sin cargar estados'} →</button></div>
      </section>}
      {step === 1 && <>
        <div className="page-heading"><div><p className="eyebrow">Carga académica</p><h1 ref={heading} tabIndex={-1}>Poné al día tu recorrido</h1><p>{career.name} · Plan {career.plan}</p><p>Seleccioná varias materias y asignales un estado en conjunto.</p></div>
          <div className="progress-card" role="status"><strong>{review.reviewed} de {review.editable} materias configuradas</strong><progress value={review.reviewed} max={review.editable || 1} aria-label="Materias configuradas" /><small>{review.protected} previas protegidas · No es porcentaje aprobado</small></div></div>
        <div className="toolbar"><strong className="selection-count" aria-live="polite">{draft.selected.length} seleccionadas</strong>
          {STATUS.map(status => <button key={status} className={`status ${statusClass[status]}`} disabled={!draft.selected.length} onClick={() => change(d => selectOnboardingSubjects(assignOnboardingSelection(d, status), []))}>{marks[status]} {status}</button>)}
          <button className="text-button" disabled={!draft.selected.length} onClick={() => change(d => selectOnboardingSubjects(d, []))}>Limpiar selección</button>
          <button disabled={!draft.past.length} onClick={() => change(undoOnboardingDecision)}>↶ Deshacer</button><button disabled={!draft.future.length} onClick={() => change(redoOnboardingDecision)}>↷ Rehacer</button></div>
        {years.map(year => <section key={year.key}><h2 className="year">{yearLabel(year.groups[0])}</h2><div className="period-grid">{year.groups.map(group => {
          const eligible = group.codes.filter(code => !Object.hasOwn(draft.baseline, code))
          return <section className="period" key={JSON.stringify(group)}><div className="period-header"><strong>{group.period || 'Período no especificado'}</strong>
            <label><input type="checkbox" aria-label={`Seleccionar ${yearLabel(group)} · ${group.period || 'Período no especificado'}`} disabled={!eligible.length} checked={eligible.length > 0 && eligible.every(code => draft.selected.includes(code))}
              onChange={event => { const checked = event.target.checked; change(d => selectOnboardingSubjects(d, checked ? [...d.selected, ...eligible] : d.selected.filter(code => !eligible.includes(code)))) }} /> Seleccionar grupo</label></div>
            {group.codes.map(code => { const protectedState = Object.hasOwn(draft.baseline, code)
              return <label key={code} className={`subject ${protectedState ? 'protected' : draft.selected.includes(code) ? 'selected' : ''}`}>
                <input type="checkbox" disabled={protectedState} checked={draft.selected.includes(code)} aria-label={`Seleccionar ${subjects.get(code).name}`}
                  onChange={event => { const checked = event.target.checked; change(d => selectOnboardingSubjects(d, checked ? [...d.selected, code] : d.selected.filter(item => item !== code))) }} />
                <span className="subject-title"><strong>{subjects.get(code).name}</strong><small>{code}{protectedState ? ' · Progreso previo · Protegida' : ''}</small></span><StateBadge value={protectedState ? draft.baseline[code] : draft.decisions[code]} /></label>
            })}</section>
        })}</div></section>)}
        <div className="notice"><span aria-hidden="true">ⓘ</span><p><b>Sin revisar ≠ Pendiente.</b> Sólo se guardan decisiones explícitas. Podés marcar como Aprobada una equivalencia reconocida oficialmente; no se infieren equivalencias entre carreras.</p></div>
        <div className="bottom-bar"><button className="text-button" onClick={() => navigate(0)}>← Volver</button><small>Los cambios todavía no se guardaron.</small><button className="primary" onClick={() => navigate(2)}>Revisar {entries.length} cambios →</button></div>
      </>}
      {step === 2 && <>
        <div className="page-heading"><div><p className="eyebrow">Antes de terminar</p><h1 ref={heading} tabIndex={-1}>Revisá tu punto de partida</h1><p>Estas decisiones corresponden sólo a {career.name} · Plan {career.plan}.</p></div></div>
        <div className="summary-grid">{STATUS.map(status => <div key={status} className="summary-card"><StateBadge value={status} /><b>{entries.filter(entry => entry.status === status).length}</b></div>)}</div>
        <div className="review-table">{entries.length ? <table><thead><tr><th>Materia</th><th>Ubicación</th><th>Estado elegido</th></tr></thead><tbody>{entries.map(entry => {
          const subject = subjects.get(entry.code)
          return <tr key={entry.code}><td><b>{subject.name}</b><small>{subject.code}</small></td><td>{yearLabel(subject)} · {subject.term || 'Período no especificado'}</td><td><StateBadge value={entry.status} /></td></tr>
        })}</tbody></table> : <div className="empty"><h2>No hay cambios para aplicar</h2><p className="muted">Continuar no marca todas las materias como Pendiente ni reinicia tu carrera.</p></div>}</div>
        <div className="notice"><p>{review.protected} materias previas se mantienen intactas. {review.editable - entries.length} quedan sin una nueva decisión.</p></div>
        <div className="bottom-bar"><button onClick={() => { setChoice('experienced'); navigate(1) }}>← Volver a editar</button><small>{entries.length} cambios nuevos · Sólo esta carrera</small>
          <button className="primary" disabled={busy} onClick={confirm}>{busy ? 'Guardando…' : entries.length ? 'Confirmar y guardar ✓' : 'Continuar sin cambios →'}</button></div>
      </>}
    </fieldset>}
  </section>
}
