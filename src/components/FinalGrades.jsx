import { useEffect, useRef, useState } from 'react'
import { finalGradeSummary } from '../finalGradeLogic'
import './FinalGrades.css'

export function finalGradeError(error) {
  if (error.code === 'permission-denied') return 'No se pudo guardar: permisos insuficientes o datos modificados. Actualizá antes de reintentar.'
  if (/CONFLICT/.test(error.message)) return 'La nota cambió en otra pestaña. Actualizá antes de reintentar.'
  if (/APPROVED/.test(error.message)) return 'La materia ya no figura aprobada. Actualizá los datos.'
  if (/SESSION|SCOPE|AUTHORITY|INSTANCE/.test(error.message)) return 'Cambió la cuenta o la carrera. Volvé a abrir esta sección.'
  return 'No pudimos confirmar las notas. Actualizá para volver a intentar.'
}

export default function FinalGrades({ source, subjects, editable = false, subjectCode, children }) {
  const [state, setState] = useState({ source: null, grades: null, progress: null, error: null })
  const [attempt, setAttempt] = useState(0), [pending, setPending] = useState(false)
  const [draft, setDraft] = useState({}), [notice, setNotice] = useState('')
  const [inlineCode, setInlineCode] = useState(null)
  const [confirmedWrite, setConfirmedWrite] = useState(null)
  const repository = useRef(null), busy = useRef(false), generation = useRef(0)
  useEffect(() => {
    const token = ++generation.current
    let stopGrades = () => {}, stopProgress = () => {}
    setState({ source, grades: null, progress: null, error: null }); setDraft({}); setNotice(''); setInlineCode(null); setConfirmedWrite(null); setPending(false); busy.current = false
    const fail = error => { if (generation.current === token) setState(s => ({ ...s, error: finalGradeError(error) })) }
    try {
      repository.current = source.createFinalGrades()
      stopGrades = repository.current.subscribe(grades => {
        if (generation.current === token) setState(s => ({ ...s, grades }))
      }, fail)
      stopProgress = source.subscribe(({ statusMap }) => {
        if (generation.current === token) setState(s => ({ ...s, progress: statusMap ?? {} }))
      }, fail)
    } catch (error) { fail(error) }
    return () => { generation.current++; stopGrades(); stopProgress() }
  }, [source, attempt])
  const awaitingSnapshot = confirmedWrite && (state.grades?.[confirmedWrite.code]?.revision ?? 0) < confirmedWrite.revision
  const ready = state.source === source && state.grades !== null && state.progress !== null && !state.error
  const summary = ready ? finalGradeSummary(subjects, state.progress, state.grades) : null
  function edit(code, value) {
    if (!ready || busy.current || awaitingSnapshot) return
    setDraft(d => ({ ...d, [code]: { value, revision: Object.hasOwn(d, code) ? d[code].revision : state.grades[code]?.revision ?? null } }))
    setNotice('')
  }
  async function save(code) {
    if (!ready || busy.current || awaitingSnapshot || !draft[code]) return
    const token = generation.current, entry = draft[code]
    busy.current = true; setPending(true); setNotice('')
    try {
      await repository.current.save(code, entry.value === '' ? null : Number(entry.value), entry.revision)
      if (generation.current !== token) return
      setInlineCode(null)
      setConfirmedWrite({ code, revision: entry.value === '' && entry.revision === null ? 0 : (entry.revision ?? 0) + 1 })
      setNotice({ code, message: 'Nota guardada.' }); setDraft(d => { const next = { ...d }; delete next[code]; return next })
    } catch (error) {
      if (generation.current === token) setState(s => ({ ...s, error: finalGradeError(error) }))
    } finally { if (generation.current === token) { busy.current = false; setPending(false) } }
  }
  const feedback = state.source === source && state.error
    ? <div role="alert">{state.error} <button type="button" onClick={() => setAttempt(n => n + 1)}>Actualizar notas</button></div>
    : !ready ? <p role="status">Cargando notas…</p> : null
  function cancel(code) {
    if (busy.current || awaitingSnapshot) return
    setDraft(d => { const next = { ...d }; delete next[code]; return next })
    setNotice(''); setInlineCode(null)
  }
  function toggle(code) {
    if (busy.current || awaitingSnapshot) return
    if (inlineCode === code) { cancel(code); return }
    if (inlineCode !== null) cancel(inlineCode)
    setNotice(''); setInlineCode(code)
  }
  function editor(code, compact = false, onCancel) {
    const subject = subjects.find(s => s.code === code)
    if (!subject) return null
    const approved = ready && state.progress[code] === 'Aprobada'
    const value = draft[code]?.value ?? (state.grades?.[code]?.grade == null ? '' : String(state.grades[code].grade))
    return <section className={'final-grade-editor' + (compact ? ' final-grade-inline' : '')} aria-label="Nota final privada">
      <h3>Nota final <small>Privada</small></h3>
      {feedback || <>
        {!approved && <p>Conservada, fuera del promedio. Solo las materias aprobadas cuentan.</p>}
        <label>Nota final de {subject.name}
          <select value={value} disabled={pending || !!awaitingSnapshot} onChange={event => edit(code, event.target.value)}>
            <option value="">Sin nota</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={String(i + 1)} disabled={!approved}>{i + 1}</option>)}
          </select>
        </label>
        <button type="button" disabled={pending || !!awaitingSnapshot || !draft[code]} onClick={() => save(code)}>{compact ? 'Guardar' : 'Guardar nota'}</button>
        <p className="final-grade-help">Opcional, del 1 al 10. Elegí «Sin nota» para quitarla.</p>
      </>}
      {compact && <button type="button" className="grade-cancel" disabled={pending} onClick={() => { cancel(code); onCancel?.() }}>Cancelar</button>}
      <p role="status" aria-live="polite">{pending ? 'Guardando…' : notice.code === code ? notice.message : ''}</p>
    </section>
  }
  if (children) return children({ ready, grades: ready ? state.grades : {}, editor, inlineCode, toggle, pending: pending || !!awaitingSnapshot, notice })
  if (editable) return editor(subjectCode)
  return <section className="side-card final-grades" aria-label="Promedio académico">
    <div className="final-grade-heading"><p className="card-label">Promedio académico</p><small title="Solo vos podés ver tus notas">Privado</small></div>
    {feedback || <>
      <strong>{summary.average === null ? '—' : summary.average.toLocaleString('es-AR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}</strong>
      <p>{summary.graded} de {summary.approved} aprobadas con nota</p>
      {summary.average === null && <small>Agregá notas desde Materias.</small>}
    </>}
  </section>
}
