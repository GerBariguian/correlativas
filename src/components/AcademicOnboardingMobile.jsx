import { useRef, useState } from 'react'
import { decideOnboardingSubjects, undoOnboardingDecision, redoOnboardingDecision } from '../academicOnboardingLogic'
import './AcademicOnboardingMobile.css'

const states = ['Pendiente', 'Cursando', 'Regularizada', 'Aprobada']
const colors = ['pending', 'course', 'regular', 'approved']
const paths = ['M12 7v5l3 2', 'M12 5v15M12 6C9 4 5 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-2-1-6-1-9 1Z', 'm12 3 8 9-8 9-8-9Z', 'm5 12 4 4L19 6']
const direction = (x, y) => Math.abs(x) > Math.abs(y) ? (x > 0 ? 'Aprobada' : 'Pendiente') : (y < 0 ? 'Cursando' : 'Regularizada')

// Presentation only. Every decision updates the parent's existing draft.
export default function AcademicOnboardingMobile({ draft, subjects, change, onReview, initialCode }) {
  const eligible = subjects.filter(s => !Object.hasOwn(draft.baseline, s.code))
  const [index, setIndex] = useState(() => Math.max(0, eligible.findIndex(s => s.code === initialCode)))
  const [movement, setMovement] = useState(null), [notice, setNotice] = useState('')
  const drag = useRef(null)
  const subject = eligible[Math.min(index, eligible.length - 1)]
  const reviewed = Object.keys(draft.decisions).length
  function cancel() { drag.current = null; setMovement(null) }
  function next() { if (index >= eligible.length - 1) onReview(); else setIndex(i => i + 1) }
  function decide(status) {
    if (!subject) return
    cancel()
    change(d => decideOnboardingSubjects(d, [subject.code], status))
    setNotice(`${subject.name}: ${status}`); next()
  }
  function history(redo) {
    cancel()
    const target = (redo ? draft.future : draft.past).at(-1)
    if (!target) return
    const i = eligible.findIndex(s => draft.decisions[s.code] !== target[s.code])
    change(redo ? redoOnboardingDecision : undoOnboardingDecision)
    if (i >= 0) setIndex(i)
    setNotice(redo ? 'Decisión rehecha' : 'Decisión deshecha')
  }
  function start(e) {
    if (!e.isPrimary || e.button !== 0) return
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, draft }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function move(e) {
    const origin = drag.current
    if (!origin || origin.id !== e.pointerId) return
    if (origin.draft !== draft) { cancel(); return }
    setMovement({ x: e.clientX - origin.x, y: e.clientY - origin.y })
  }
  function end(e) {
    const origin = drag.current
    if (!origin || origin.id !== e.pointerId) return
    const x = e.clientX - origin.x, y = e.clientY - origin.y
    cancel()
    if (origin.draft === draft && Math.max(Math.abs(x), Math.abs(y)) >= 65
      && Math.max(Math.abs(x), Math.abs(y)) > Math.min(Math.abs(x), Math.abs(y)) * 1.25) decide(direction(x, y))
  }
  const state = movement && Math.max(Math.abs(movement.x), Math.abs(movement.y)) >= 18 ? direction(movement.x, movement.y) : null
  return <section className="onboarding-mobile" aria-label="Carga por tarjetas">
    <p className="eyebrow">Carga académica</p><h1>Una materia a la vez.</h1>
    <p className="muted">Marcá tu estado actual. Podés corregirlo después.</p>
    <strong className="mobile-count">{reviewed} de {eligible.length} materias revisadas</strong>
    <progress value={reviewed} max={eligible.length || 1} aria-label="Materias revisadas" />
    <p className="mobile-hint">{subjects.length - eligible.length} previas protegidas · No es avance académico</p>
    {subject ? <>
      <article className={`mobile-card ${movement ? 'dragging' : ''}`} aria-label={`Materia actual: ${subject.name}`}
        style={movement ? { '--drag-x': `${Math.max(-30, Math.min(30, movement.x / 4))}px`, '--drag-y': `${Math.max(-20, Math.min(20, movement.y / 4))}px`, '--drag-angle': `${Math.max(-5, Math.min(5, movement.x / 30))}deg` } : undefined}
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={cancel}>
        <span className="mobile-chip">{subject.level || (typeof subject.year === 'number' ? `${subject.year}.º año` : subject.year) || 'Año no especificado'} · {subject.term || 'Período no especificado'}</span>
        <h2>{subject.name}</h2><p className="mobile-hint">{subject.code} · {draft.decisions[subject.code] || 'Sin revisar'}</p>
        <small>Tarjeta {index + 1} de {eligible.length}</small>
        {state && <span aria-hidden="true" className={`mobile-stamp ${colors[states.indexOf(state)]}`}>{state.toUpperCase()}</span>}
      </article>
      <p className="mobile-hint">← Pendiente · ↑ Cursando · ↓ Regularizada · → Aprobada</p>
      <div className="mobile-actions">{states.map((s, i) => <div key={s}><button type="button" className={colors[i]} aria-label={s} onClick={() => decide(s)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{i === 0 && <circle cx="12" cy="12" r="8" />}<path d={paths[i]} /></svg>
      </button><span aria-hidden="true">{s}</span></div>)}</div>
    </> : <p>Todas las materias tienen progreso previo protegido.</p>}
    <div className="mobile-utility"><button disabled={!draft.past.length} onClick={() => history(false)}>↶ Deshacer</button>
      <button disabled={!subject} onClick={() => { cancel(); setNotice('Sin cambios en esta materia'); next() }}>{subject && Object.hasOwn(draft.decisions, subject.code) ? 'Siguiente →' : 'Omitir →'}</button>
      <button disabled={!draft.future.length} onClick={() => history(true)}>↷ Rehacer</button></div>
    <button className="primary" onClick={onReview}>Revisar decisiones</button>
    <p className="notice">Sin revisar ≠ Pendiente. Omitir no asigna estado. Deslizá fuera de la tarjeta para desplazar la página.</p>
    <p className="sr-only" role="status">{notice}</p>
  </section>
}
