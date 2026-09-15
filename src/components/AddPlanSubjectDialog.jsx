import { useEffect, useRef, useState } from 'react'
import { auth } from '../firebase'
import { saveJointSubject } from '../services/jointPlans'
import { groupCourseChoices, initialPlannedIds } from '../planningPresentation'
import PlanningDialog from './PlanningDialog'
import AcademicSummary from './AcademicSummary'

export default function AddPlanSubjectDialog({ user, career, request, plans, plan, onPlanChange, titleOf, nameOf, people, rows, rowsState, onClose, onCreate, onSaved }) {
  const [code, setCode] = useState(request.code || '')
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const active = useRef(true)
  const review = useRef(null)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const editable = plans.filter((p) => !p.closed && !p.deleting && p.memberIds.includes(user.uid))
  const canEdit = plan && editable.some((p) => p.id === plan.id)
  const existing = rows?.find((row) => row.code === code)
  const availableIds = plan ? [plan.ownerId, ...plan.inviteeIds] : []
  const contextKey = JSON.stringify([plan?.id, code, rowsState === 'ready', existing?.proposedParticipantIds, availableIds])
  useEffect(() => {
    setChosen(plan ? initialPlannedIds(plan, existing, code === request.code ? request.matchingIds || [] : []) : [])
    setError('')
  }, [contextKey])
  const subject = career.subjects.find((s) => s.code === code)
  const groups = groupCourseChoices(career.subjects, people, search)
  async function save() {
    if (pending.current || auth.currentUser !== user || !canEdit || !subject || rowsState !== 'ready' || chosen.length < 2 || chosen.some((uid) => !availableIds.includes(uid))) return
    pending.current = true; setBusy(true); setError('')
    try {
      await saveJointSubject(user.uid, plan.id, code, chosen)
      if (active.current && auth.currentUser === user) onSaved()
    } catch {
      if (active.current && auth.currentUser === user) setError('No se pudo guardar la materia. Revisá la conexión y que el plan siga abierto.')
    } finally { pending.current = false; if (active.current && auth.currentUser === user) setBusy(false) }
  }
  return <PlanningDialog open title="Agregar materia" onClose={onClose} busy={busy}>
    <label className="planning-field">Plan de destino<select value={canEdit ? plan.id : ''} disabled={busy} onChange={(event) => onPlanChange(event.target.value)}>
      <option value="">Elegir plan</option>{editable.map((p) => <option key={p.id} value={p.id}>{titleOf(p)}</option>)}
    </select></label>
    {!editable.length && <p>No tenés un plan abierto para agregar esta materia. <button className="planning-link" onClick={onCreate}>Crear un plan</button></p>}
    {canEdit && <>
      <p className="planning-muted">Contexto académico de {availableIds.length} participantes. La falta de información no significa que no puedan cursar.</p>
      <div className="planning-picker-layout">
        <section className="planning-picker-list" aria-label="Elegir materia">
          <label className="planning-field">Buscar materia<input value={search} disabled={busy} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o código" /></label>
          {groups.map((group) => !!group.rows.length && <div key={group.label}><h3>{group.label}</h3>{group.rows.map((row) => <button type="button" disabled={busy} key={row.subject.code} className={`planning-choice ${code === row.subject.code ? 'selected' : ''}`} aria-pressed={code === row.subject.code} onClick={() => { setCode(row.subject.code); if (window.matchMedia('(max-width: 760px)').matches) review.current?.focus() }}>
            <strong>{row.subject.name}</strong><small>{row.matches.length}/{row.total} pueden cursarla{row.missing.length ? ` · ${row.missing.length} sin información` : ''}{rows?.some((item) => item.code === row.subject.code) ? ' · Ya está en el plan' : ''}</small>
          </button>)}</div>)}
          {!groups.some((group) => group.rows.length) && <p>No encontramos materias con esa búsqueda.</p>}
        </section>
        <section className="planning-review" ref={review} tabIndex={-1} aria-label="Revisar antes de guardar">
          <h3>Revisar antes de guardar</h3>
          {subject ? <><h4>{subject.name}</h4><p>Plan: {titleOf(plan)}</p>
            {existing && <p className="planning-warning">Ya está en este plan. Guardar cambios reemplazará las personas seleccionadas.</p>}
            <fieldset disabled={busy}><legend>Planeada para</legend>{availableIds.map((uid) => <label className="planning-check" key={uid}><input type="checkbox" checked={chosen.includes(uid)} onChange={(event) => setChosen((ids) => event.target.checked ? [...ids, uid] : ids.filter((id) => id !== uid))} />{nameOf(uid)}{!plan.memberIds.includes(uid) ? ' · Invitación pendiente' : ''}</label>)}</fieldset>
            {(request.matchingIds || []).some((uid) => !availableIds.includes(uid)) && <p>Algunas personas de la comparación no participan en este plan. No se agregarán automáticamente.</p>}
            {!!chosen.length && <AcademicSummary plan={plan} code={code} ids={chosen} people={people} nameOf={nameOf} detail />}
            <p className="planning-muted">Elegí al menos dos personas. Esto no confirma intención individual, oferta ni inscripción.</p>
          </> : <p>Elegí una materia para revisar sus participantes.</p>}
        </section>
      </div>
    </>}
    {error && <p role="alert">{error}</p>}
    {canEdit && rowsState !== 'ready' && <p role="status">{rowsState === 'loading' ? 'Cargando materias...' : 'No pudimos cargar las materias del plan. Cerrá el diálogo y reintentá.'}</p>}
    <footer className="planning-dialog-footer"><button className="planning-secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="planning-primary" disabled={busy || !canEdit || !subject || chosen.length < 2 || rowsState !== 'ready'} onClick={save}>{busy ? 'Guardando...' : existing ? 'Guardar cambios' : 'Agregar al plan'}</button></footer>
  </PlanningDialog>
}
