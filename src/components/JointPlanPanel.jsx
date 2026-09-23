import { useEffect, useRef, useState } from 'react'
import { auth } from '../firebase'
import { socialMaintenance } from '../socialMaintenance'
import { closeJointPlan, createJointPlan, deleteJointPlan, removeJointSubject, updatePlanMembership, renameJointPlan, inviteJointParticipant } from '../services/jointPlans'
import { fallbackPlanName, invitedBy, planName } from '../jointPlanLogic'
import DeleteJointPlan from './DeleteJointPlan'
import PlanningDialog from './PlanningDialog'
import AcademicSummary from './AcademicSummary'

export default function JointPlanPanel({ user, career, data, people, friends, nameOf, titleOf, planId, onPlanChange, onRetry, onAdd, onCompare, showCreate, setShowCreate, onCreated }) {
  const { plans, selected: plan, rows, rowsState, state } = data
  const [newName, setNewName] = useState('')
  const [invitees, setInvitees] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [action, setAction] = useState('')
  const [expanded, setExpanded] = useState(null)
  const pending = useRef(false)
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  useEffect(() => { setAction(''); setExpanded(null); setError('') }, [planId])
  useEffect(() => { if (showCreate) { setNewName(''); setInvitees([]); setError('') } }, [showCreate])
  const member = plan?.memberIds.includes(user.uid)
  const owner = plan?.ownerId === user.uid
  const editing = member && !plan.closed && !plan.deleting
  const ids = plan ? [plan.ownerId, ...plan.inviteeIds] : []
  async function run(task) {
    if (pending.current || auth.currentUser !== user) return false
    pending.current = true; setBusy(true); setError('')
    try { await task(); return true } catch (failure) {
      if (live.current && auth.currentUser === user) setError(failure.code ? 'No se pudo completar la acción. Revisá la conexión y volvé a intentarlo.' : failure.message || 'No se pudo completar la acción.')
      return false
    } finally { pending.current = false; if (live.current && auth.currentUser === user) setBusy(false) }
  }
  return <section className="joint-plan planning-plan">
    <div className="planning-section-head"><label className="planning-field">Tus planes<select value={planId} disabled={busy} onChange={(event) => onPlanChange(event.target.value)}><option value="">Elegir plan</option>{planId && !plan && <option value={planId}>Plan no disponible</option>}{plans.map((p) => <option key={p.id} value={p.id}>{titleOf(p)}{p.closed ? ' · Cerrado' : !p.memberIds.includes(user.uid) ? ' · Invitación' : ''}</option>)}</select></label><button className="planning-secondary" disabled={socialMaintenance} onClick={() => setShowCreate(true)}>Nuevo plan</button></div>
    {state === 'loading' && <p role="status">Cargando planes...</p>}
    {state === 'unavailable' && <p role="alert">No pudimos cargar todos tus planes. <button className="planning-link" onClick={onRetry}>Reintentar</button></p>}
    {state === 'ready' && !plans.length && <div className="planning-empty"><h2>Todavía no tenés planes conjuntos</h2><p>Creá un plan e invitá a tus amigos para organizar materias juntos.</p><button className="planning-primary" disabled={socialMaintenance} onClick={() => setShowCreate(true)}>Crear un plan</button></div>}
    {planId && !plan && state === 'ready' && <p>Este plan ya no está disponible para vos.</p>}
    {plan && <>
      <header className="planning-plan-head">
        <div className="planning-section-head"><h2>{titleOf(plan)}</h2>{member && <details className="planning-options"><summary>Opciones del plan</summary><div>
          {editing && <><button onClick={() => { setNewName(titleOf(plan)); setAction('rename') }}>Renombrar</button><button disabled={socialMaintenance} onClick={() => setAction('invite')}>Agregar participante</button></>}
          {!owner && !plan.deleting && <button disabled={busy} onClick={() => run(async () => { await updatePlanMembership(user.uid, plan.id, false); if (live.current) onPlanChange('') })}>Salir del plan</button>}
          {owner && !plan.closed && <button disabled={busy} onClick={() => { if (window.confirm('¿Cerrar este plan? Quedará en modo solo lectura para sus miembros.')) run(() => closeJointPlan(user.uid, plan.id)) }}>Cerrar plan</button>}
          {owner && plan.closed && <DeleteJointPlan name={titleOf(plan)} busy={busy} onDelete={() => run(async () => { await deleteJointPlan(user.uid, plan.id); if (live.current && auth.currentUser === user) onPlanChange('') })} />}
        </div></details>}</div>
        <details className="planning-roster"><summary><span className="planning-avatar-row">{ids.slice(0, 3).map((uid) => <span className="planning-avatar" aria-hidden="true" key={uid}>{nameOf(uid).slice(0, 1).toUpperCase()}</span>)}</span><span>{ids.slice(0, 2).map(nameOf).join(', ')}{ids.length > 2 ? ` y ${ids.length - 2} más` : ''} · Ver participantes ({ids.length})</span></summary><ul>{ids.map((uid) => <li key={uid}>{nameOf(uid)} · {plan.memberIds.includes(uid) ? uid === plan.ownerId ? 'Miembro · Creador' : 'Miembro' : `Invitación pendiente · Invitado por ${nameOf(invitedBy(plan, uid))}`}</li>)}</ul></details>
        <p className="planning-muted">{member && rowsState === 'ready' ? `${rows.length} materias planificadas` : member ? 'Cargando materias...' : 'Invitación al plan'}{plan.closed ? ' · Cerrado' : ''}{plan.inviteeIds.some((uid) => !plan.memberIds.includes(uid)) ? ` · ${plan.inviteeIds.filter((uid) => !plan.memberIds.includes(uid)).length} invitaciones pendientes` : ''}</p>
        {editing && <div className="planning-actions"><button className="planning-primary" onClick={() => onAdd()}>Agregar materia</button><button className="planning-link" onClick={onCompare}>Comparar avance →</button></div>}
      </header>
      {!member && !plan.deleting && <div className="planning-invitation"><p>Al aceptar podrás ver y editar este plan. Tu progreso no se comparte por participar.</p><div className="planning-actions">{!plan.closed && <button className="planning-primary" disabled={busy} onClick={() => run(() => updatePlanMembership(user.uid, plan.id, true))}>Aceptar invitación</button>}<button className="planning-secondary" disabled={busy} onClick={() => run(async () => { await updatePlanMembership(user.uid, plan.id, false); if (live.current) onPlanChange('') })}>Rechazar</button></div></div>}
      {plan.deleting ? <p role="status">La eliminación quedó pendiente. El creador puede reintentar desde Opciones del plan.</p> : member && <>
        {rowsState === 'error' && <p role="alert">No pudimos cargar las materias. <button className="planning-link" onClick={onRetry}>Reintentar</button></p>}
        {rowsState === 'ready' && !rows.length && <p className="planning-empty">Todavía no hay materias planificadas.{editing && ' Usá Agregar materia para empezar.'}</p>}
        <div className="planning-plan-cards">{(rows || []).map((row) => <article className="planning-course-card" key={row.code}>
          <h3>{career.subjects.find((s) => s.code === row.code)?.name || row.code}</h3><p>Planeada para {row.proposedParticipantIds.map(nameOf).join(' · ')}</p>
          <AcademicSummary plan={plan} code={row.code} ids={row.proposedParticipantIds} people={people} nameOf={nameOf} />
          <button className="planning-link" aria-expanded={expanded === row.code} onClick={() => setExpanded(expanded === row.code ? null : row.code)}>{expanded === row.code ? 'Ocultar detalle' : 'Ver detalle'}</button>
          {expanded === row.code && <div className="planning-course-detail"><AcademicSummary plan={plan} code={row.code} ids={row.proposedParticipantIds} people={people} nameOf={nameOf} detail detailOnly /><p className="planning-muted">Agregada por {nameOf(row.addedByUid || plan.ownerId)}.</p>{editing && <button className="planning-link planning-danger" disabled={busy} onClick={() => run(() => removeJointSubject(user.uid, plan.id, row.code))}>Quitar materia del plan</button>}</div>}
        </article>)}</div>
      </>}
    </>}
    {(showCreate || (action && plan)) && <PlanningDialog open title={showCreate ? 'Crear un plan' : action === 'rename' ? 'Renombrar plan' : 'Agregar participante'} busy={busy} onClose={() => { setShowCreate(false); setAction('') }}>
      {showCreate ? <>
        <label className="planning-field">Nombre opcional<input value={newName} maxLength={80} disabled={busy} placeholder={fallbackPlanName(invitees.map(nameOf))} onChange={(event) => setNewName(event.target.value)} /></label><fieldset disabled={busy}><legend>Invitar amigos</legend>{friends.ids.map((uid) => <label key={uid} className="planning-check"><input type="checkbox" checked={invitees.includes(uid)} disabled={!invitees.includes(uid) && invitees.length >= 4} onChange={(event) => setInvitees((old) => event.target.checked ? [...old, uid] : old.filter((id) => id !== uid))} />{nameOf(uid)}</label>)}</fieldset><p>No necesitan compartir progreso para participar. Máximo cuatro amigos además de vos.</p>
        <button className="planning-primary" disabled={socialMaintenance || busy || friends.state !== 'ready' || !invitees.length || invitees.some((uid) => !friends.ids.includes(uid))} onClick={() => run(async () => { const id = await createJointPlan(user.uid, career.id, invitees, newName.trim() ? planName(newName) : fallbackPlanName(invitees.map(nameOf))); if (live.current && auth.currentUser === user) { setNewName(''); setInvitees([]); onCreated(id) } })}>{busy ? 'Guardando...' : 'Crear plan e invitar'}</button>
      </> : action === 'rename' ? <form onSubmit={(event) => { event.preventDefault(); run(async () => { await renameJointPlan(user.uid, plan.id, newName); if (live.current) setAction('') }) }}><label className="planning-field">Nombre del plan<input value={newName} maxLength={80} required disabled={busy} onChange={(event) => setNewName(event.target.value)} /></label><button className="planning-primary" disabled={busy || !editing}>{busy ? 'Guardando...' : 'Guardar cambios'}</button></form> : <>
        <label className="planning-field">Elegí uno de tus amigos<select value="" disabled={socialMaintenance || busy || !editing || plan.inviteeIds.length >= 4 || friends.state !== 'ready'} onChange={(event) => { const uid = event.target.value; if (uid) run(async () => { await inviteJointParticipant(user.uid, plan.id, uid); if (live.current) setAction('') }) }}><option value="">Agregar participante</option>{friends.ids.filter((uid) => !ids.includes(uid)).map((uid) => <option key={uid} value={uid}>{nameOf(uid)}</option>)}</select></label>{plan.inviteeIds.length >= 4 && <p>El plan ya tiene cinco personas, contando invitaciones.</p>}
      </>}
      {error && <p role="alert">{error}</p>}
    </PlanningDialog>}
    {busy && <p role="status">Guardando...</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
