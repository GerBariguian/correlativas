import { useEffect, useRef, useState } from 'react'
import { auth } from '../firebase'
import useJointPlans from '../hooks/useJointPlans'
import useJointProfiles from '../hooks/useJointProfiles'
import { closeJointPlan, createJointPlan, deleteJointPlan, removeJointSubject, updatePlanMembership } from '../services/jointPlans'
import { fallbackPlanName, invitedBy, planName } from '../jointPlanLogic'
import { plannedEligibility } from '../planningLogic'
import JointPlanEditor from './JointPlanEditor'
import DeleteJointPlan from './DeleteJointPlan'

const eligibilityLabels = { eligible: 'Puede cursarla', 'no-longer-eligible': 'Ya no figura como habilitada', unknown: 'Sin datos actuales', 'not-member': 'Invitación pendiente o participante que salió' }

export default function JointPlanPanel({ user, career, participants, friends, candidateCode, onCandidateUsed }) {
  const [selectedId, setSelectedId] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const live = useRef(false)
  const pending = useRef(false)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const { plans, selected, rows, state } = useJointPlans(user, career.id, selectedId, attempt)
  const profileIds = plans.flatMap((plan) => [plan.ownerId, ...plan.inviteeIds, ...Object.values(plan.invitedBy || {})])
    .concat((rows || []).flatMap((row) => [row.addedByUid, ...row.proposedParticipantIds]).filter(Boolean))
  const profiles = useJointProfiles(user, profileIds)
  const nameOf = (uid) => uid === user.uid ? user.displayName || 'Vos' : profiles[uid]?.name || friends.profiles[uid]?.name || 'Participante'
  const names = (ids) => ids.map(nameOf).join(' · ')
  const title = (plan) => plan.name || fallbackPlanName(plan.inviteeIds.map(nameOf))
  const invitees = participants.filter((p) => !p.isSelf).map((p) => p.uid)
  const canCreate = invitees.length > 0 && friends.state === 'ready' && invitees.every((uid) => friends.ids.includes(uid))
  const member = selected?.memberIds.includes(user.uid)
  const owner = selected?.ownerId === user.uid
  async function run(action) {
    if (pending.current || auth.currentUser !== user) return false
    pending.current = true; setBusy(true); setError('')
    try { await action(); return true }
    catch (failure) {
      if (live.current && auth.currentUser === user) setError(failure.code ? 'No se pudo guardar. Revisá la conexión y los permisos. Si la eliminación se interrumpió, reintentala desde el plan cerrado.' : failure.message || 'No se pudo completar la operación.')
      return false
    } finally { pending.current = false; if (live.current && auth.currentUser === user) setBusy(false) }
  }
  return <section className="joint-plan">
    <h2>Planes conjuntos</h2>
    <p>Los miembros aceptados pueden proponer materias e invitar a sus amigos. Participar en un plan no crea amistades ni comparte progreso académico.</p>
    <details className="side-card"><summary>Crear un plan</summary>
      <p>Invitar a: {names(invitees) || 'seleccioná amigos arriba'}.</p>
      <label className="friend-search">Nombre opcional<input value={newName} maxLength={80} disabled={busy} onChange={(event) => setNewName(event.target.value)} placeholder={fallbackPlanName(invitees.map(nameOf))} /></label>
      <button className="reset" disabled={busy || !canCreate} onClick={() => run(async () => {
        const id = await createJointPlan(user.uid, career.id, invitees, newName.trim() ? planName(newName) : fallbackPlanName(invitees.map(nameOf)))
        if (live.current && auth.currentUser === user) { setSelectedId(id); setNewName('') }
      })}>Crear plan e invitar</button>
      {!canCreate && <p>Seleccioná entre uno y cuatro amigos aceptados. No necesitan compartir progreso para participar.</p>}
    </details>
    {state !== 'ready' && <p role="status">{state === 'loading' ? 'Cargando planes...' : 'No se pudieron verificar los planes. Revisá la conexión y reintentá.'}</p>}
    <button className="reset" disabled={busy} onClick={() => setAttempt((n) => n + 1)}>Actualizar planes</button>
    <label className="friend-search">Tus planes e invitaciones
      <select value={selectedId} disabled={busy} onChange={(event) => { setSelectedId(event.target.value); setError('') }}>
        <option value="">Seleccionar plan</option>
        {selectedId && !selected && <option value={selectedId}>Plan sin acceso o no disponible</option>}
        {plans.map((plan) => <option key={plan.id} value={plan.id}>{title(plan)}{plan.deleting ? ' · Eliminación pendiente' : plan.closed ? ' · Cerrado' : !plan.memberIds.includes(user.uid) ? ' · Invitación' : ''}</option>)}
      </select>
    </label>
    {state === 'ready' && !plans.length && <p>Todavía no hay planes ni invitaciones para esta carrera.</p>}
    {candidateCode && !selected && <p>Elegí un plan abierto para agregar la materia seleccionada, o creá uno.</p>}
    {selected && <div className="side-card">
      <h3>{title(selected)}{selected.closed ? ' · Cerrado' : ''}</h3>
      <p>Creado por {nameOf(selected.ownerId)}.</p>
      <h4>Participantes</h4>
      <ul>{[selected.ownerId, ...selected.inviteeIds].map((uid) => <li key={uid}>{nameOf(uid)} · {selected.memberIds.includes(uid) ? 'Miembro' : `Invitación pendiente · Invitado por ${nameOf(invitedBy(selected, uid))}`}</li>)}</ul>
      {!member && <p>Al aceptar podrás leer y editar las propuestas del plan. Los miembros podrán ver tu identidad social y las materias en las que te incluyan; no se comparte tu progreso.</p>}
      {selected.deleting ? <p role="status">Eliminación pendiente. El creador puede reintentar para completar la limpieza.</p> : <>
        {!owner && <div className="friend-actions">
          {!member && !selected.closed && <button className="reset" disabled={busy} onClick={() => run(() => updatePlanMembership(user.uid, selected.id, true))}>Aceptar invitación y unirme</button>}
          <button className="reset" disabled={busy} onClick={() => run(async () => {
            await updatePlanMembership(user.uid, selected.id, false)
            if (live.current && auth.currentUser === user) setSelectedId('')
          })}>{member ? 'Salir del plan' : 'Rechazar invitación'}</button>
        </div>}
        {member && !selected.closed && <JointPlanEditor key={selected.id} user={user} plan={selected} title={title(selected)} career={career} friends={friends} names={names} candidateCode={candidateCode} onCandidateUsed={() => { if (live.current && auth.currentUser === user) onCandidateUsed() }} run={run} busy={busy} />}
        {member && <>
          <h4>Materias</h4>
          <p>Incluidas como propuesta del plan, sin confirmar intención individual ni inscripción. La habilitación solo se muestra para amigos seleccionados con autorización académica independiente.</p>
          {rows === null ? <p role="status">Esperando acceso confirmado a las materias...</p> : !rows.length ? <p>No hay materias incluidas todavía.</p> : <ul className="joint-subjects">
            {rows.map((row) => <li key={row.code}>
              <h4>{career.subjects.find((s) => s.code === row.code)?.name || row.code}</h4>
              <p>Planeada para: {names(row.proposedParticipantIds)}.</p>
              <p>Agregada por {nameOf(row.addedByUid || selected.ownerId)}.</p>
              <ul>{plannedEligibility(row.code, row.proposedParticipantIds, participants, selected.memberIds).map((p) => <li key={p.uid}>{nameOf(p.uid)}: {participants.find((person) => person.uid === p.uid)?.state === 'disabled' ? 'Progreso no compartido' : !friends.ids.includes(p.uid) && p.uid !== user.uid && p.state === 'unknown' ? 'Progreso no compartido con vos' : eligibilityLabels[p.state]}</li>)}</ul>
              {!selected.closed && <button className="reset" disabled={busy} onClick={() => run(() => removeJointSubject(user.uid, selected.id, row.code))}>Quitar materia del plan</button>}
            </li>)}
          </ul>}
        </>}
      </>}
      {owner && <details className="progress-danger-zone"><summary>Administrar plan</summary><div className="friend-actions">
        {!selected.closed ? <button className="reset" disabled={busy} onClick={() => { if (window.confirm('¿Cerrar este plan? Quedará en modo solo lectura para sus miembros.')) run(() => closeJointPlan(user.uid, selected.id)) }}>Cerrar plan</button>
          : <DeleteJointPlan name={title(selected)} busy={busy} onDelete={() => run(async () => {
            await deleteJointPlan(user.uid, selected.id)
            if (live.current && auth.currentUser === user) setSelectedId('')
          })} />}
      </div></details>}
    </div>}
    {busy && <p role="status">Guardando en Firebase...</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
