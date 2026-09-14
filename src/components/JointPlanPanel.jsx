import { useEffect, useRef, useState } from 'react'
import { auth } from '../firebase'
import useJointPlans from '../hooks/useJointPlans'
import { closeJointPlan, createJointPlan, removeJointSubject, saveJointSubject, updatePlanMembership } from '../services/jointPlans'
import { plannedEligibility } from '../planningLogic'

const eligibilityLabels = { eligible: 'Puede cursarla', 'no-longer-eligible': 'Ya no figura como habilitada', unknown: 'Sin datos actuales', 'not-member': 'Invitación pendiente o participante que salió' }

export default function JointPlanPanel({ user, career, participants, friends, candidateCode, onCandidateUsed }) {
  const [selectedId, setSelectedId] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [chosen, setChosen] = useState([])
  const live = useRef(false)
  const pending = useRef(false)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const acceptedIds = friends.state === 'ready' ? friends.ids : []
  const { plans, selected, rows, state } = useJointPlans(user, career.id, acceptedIds, selectedId, attempt)
  const candidate = career.subjects.find((subject) => subject.code === candidateCode)
  const invitees = participants.filter((p) => !p.isSelf && p.state === 'ready' && acceptedIds.includes(p.uid))
  const canCreate = invitees.length > 0 && invitees.length === participants.length - 1
  const eligible = candidate && selected ? participants.filter((p) => p.state === 'ready'
    && p.snapshot.availableToCourseCodes.includes(candidate.code) && [selected.ownerId, ...selected.inviteeIds].includes(p.uid)) : []
  const eligibleIds = eligible.map((p) => p.uid)
  const choiceKey = JSON.stringify([candidateCode, selectedId, eligibleIds])
  useEffect(() => { setChosen(eligibleIds) }, [choiceKey])
  const names = (ids) => ids.map((id) => id === user.uid ? 'Vos' : friends.profiles[id]?.name || id).join(' · ')
  async function act(action) {
    if (pending.current) return
    pending.current = true; setBusy(true); setError('')
    try { await action() }
    catch { if (live.current && auth.currentUser === user) setError('No se pudo guardar. Revisá la conexión, los permisos y que el plan siga abierto; luego reintentá.') }
    finally { pending.current = false; if (live.current && auth.currentUser === user) setBusy(false) }
  }
  return <section className="joint-plan">
    <h2>Plan conjunto</h2>
    <p>Las materias son propuestas del creador. Poder cursar una materia no significa querer cursarla. Unirse al plan permite ver sus propuestas, pero no confirma una intención individual ni una inscripción.</p>
    <div className="side-card">
      <p>Crear un plan invitará explícitamente a: {names(participants.filter((p) => !p.isSelf).map((p) => p.uid)) || 'seleccioná amigos arriba'}.</p>
      <p>Al unirte, los participantes del plan podrán ver tu identificador y las materias en las que el creador te propone participar. No se comparten datos académicos a través del plan.</p>
      <button className="reset" disabled={busy || !canCreate} onClick={() => act(async () => {
        const id = await createJointPlan(user.uid, career.id, invitees.map((p) => p.uid))
        if (live.current && auth.currentUser === user) setSelectedId(id)
      })}>Crear plan e invitar</button>
      {!canCreate && <p>Para crear, seleccioná entre uno y cuatro amigos con datos compartidos compatibles y disponibles.</p>}
    </div>
    {state !== 'ready' && <p role="status">{state === 'loading' ? 'Cargando planes...' : 'No se pudieron verificar todos los planes. No se muestran datos sin conexión confirmada.'}</p>}
    <button className="reset" disabled={busy} onClick={() => setAttempt((n) => n + 1)}>Actualizar planes</button>
    <label className="friend-search">Tus planes e invitaciones
      <select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setError('') }}>
        <option value="">Seleccionar plan</option>
        {selectedId && !selected && <option value={selectedId}>Plan sin acceso o no disponible</option>}
        {plans.map((plan) => <option key={plan.id} value={plan.id}>Plan de {names([plan.ownerId])} · {plan.id.slice(0, 6)}{plan.closed ? ' · Cerrado' : !plan.memberIds.includes(user.uid) ? ' · Invitación' : ''}</option>)}
      </select>
    </label>
    {state === 'ready' && !plans.length && <p>Todavía no hay planes ni invitaciones para esta carrera.</p>}
    {candidate && <p>Materia elegida desde la comparación: {candidate.name}. Elegí un plan propio abierto o creá uno para agregarla.</p>}
    {selected && <div className="side-card">
      <h3>Plan de {names([selected.ownerId])}</h3>
      <p>Participantes: {names(selected.memberIds)}.</p>
      <p>Invitaciones pendientes: {names(selected.inviteeIds.filter((id) => !selected.memberIds.includes(id))) || 'Ninguna'}.</p>
      {selected.closed ? <><p>Este plan está cerrado.</p>{selected.ownerId !== user.uid && <button className="reset" disabled={busy} onClick={() => act(() => updatePlanMembership(user.uid, selected.id, false))}>Salir del plan</button>}</> : <>
        {selected.ownerId !== user.uid && <div className="friend-actions">
          {!selected.memberIds.includes(user.uid) && <button className="reset" disabled={busy} onClick={() => act(() => updatePlanMembership(user.uid, selected.id, true))}>Aceptar invitación y unirme</button>}
          <button className="reset" disabled={busy} onClick={() => act(() => updatePlanMembership(user.uid, selected.id, false))}>{selected.memberIds.includes(user.uid) ? 'Salir del plan' : 'Rechazar invitación'}</button>
        </div>}
        {selected.ownerId === user.uid && <button className="reset" disabled={busy} onClick={() => { if (window.confirm('¿Cerrar este plan? Ya no se podrán editar sus materias ni aceptar invitaciones.')) act(() => closeJointPlan(user.uid, selected.id)) }}>Cerrar plan</button>}
        {selected.memberIds.includes(user.uid) && <>
          {candidate && selected.ownerId === user.uid && <fieldset className="joint-proposal" disabled={busy}>
            <legend>Proponer {candidate.name} para:</legend>
            {eligible.map((p) => <label key={p.uid}><input type="checkbox" checked={chosen.includes(p.uid)} onChange={(event) => setChosen((ids) => event.target.checked ? [...ids, p.uid] : ids.filter((id) => id !== p.uid))} /> {p.name}</label>)}
            <p>Solo se ofrecen participantes seleccionados con habilitación conocida. Para incluir otro miembro, agregalo a la comparación.</p>
            <button className="reset" disabled={chosen.length < 2 || chosen.some((id) => !eligibleIds.includes(id))} onClick={() => act(async () => {
              await saveJointSubject(user.uid, selected.id, candidate.code, chosen)
              if (live.current && auth.currentUser === user) onCandidateUsed()
            })}>Guardar propuesta en el plan</button>
          </fieldset>}
          {rows === null ? <p role="status">Esperando acceso confirmado a las materias del plan...</p> : !rows.length ? <p>Sin materias propuestas. Elegí una materia en la capa Habilitadas de Comparar avance.</p> : <ul className="joint-subjects">
            {rows.map((row) => <li key={row.code}>
              <h4>{career.subjects.find((s) => s.code === row.code)?.name || row.code}</h4>
              <p>Propuesta del creador: {names(row.proposedParticipantIds)}.</p>
              <ul>{plannedEligibility(row.code, row.proposedParticipantIds, participants, selected.memberIds).map((p) => <li key={p.uid}>{names([p.uid])}: {eligibilityLabels[p.state]}</li>)}</ul>
              {selected.ownerId === user.uid && <button className="reset" disabled={busy} onClick={() => act(() => removeJointSubject(user.uid, selected.id, row.code))}>Quitar materia del plan</button>}
            </li>)}
          </ul>}
        </>}
      </>}
    </div>}
    {busy && <p role="status">Guardando en Firebase...</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
