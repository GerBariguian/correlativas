import { useEffect, useState } from 'react'
import { inviteJointParticipant, renameJointPlan, saveJointSubject } from '../services/jointPlans'

export default function JointPlanEditor({ user, plan, title, career, friends, names, candidateCode, onCandidateUsed, run, busy }) {
  const [code, setCode] = useState(candidateCode || '')
  const [chosen, setChosen] = useState([])
  const allIds = [plan.ownerId, ...plan.inviteeIds]
  const key = JSON.stringify(allIds)
  useEffect(() => { if (candidateCode) setCode(candidateCode) }, [candidateCode])
  useEffect(() => { setChosen((ids) => ids.filter((id) => allIds.includes(id))) }, [key])
  return <div className="joint-editors">
    <details><summary>Renombrar</summary>
      <form key={plan.name || title} className="friend-search" onSubmit={(event) => {
        event.preventDefault()
        const name = new FormData(event.currentTarget).get('planName')
        run(() => renameJointPlan(user.uid, plan.id, name))
      }}>
        <label>Nombre del plan<input name="planName" defaultValue={plan.name || title} maxLength={80} required disabled={busy} /></label>
        <button className="reset" disabled={busy}>Guardar nombre</button>
      </form>
    </details>
    <details><summary>Agregar participante</summary>
      <p>Podés invitar a tus amigos aceptados, aunque no sean amigos del creador. Máximo cinco personas contando miembros e invitados.</p>
      <label className="friend-search">Amigo a invitar
        <select value="" disabled={busy || plan.inviteeIds.length >= 4 || friends.state !== 'ready'} onChange={(event) => { const uid = event.target.value; if (uid) run(() => inviteJointParticipant(user.uid, plan.id, uid)) }}>
          <option value="">Seleccionar amigo</option>
          {friends.ids.filter((uid) => !allIds.includes(uid)).map((uid) => <option key={uid} value={uid}>{names([uid])}</option>)}
        </select>
      </label>
      {plan.inviteeIds.length >= 4 && <p>El plan alcanzó el máximo de cinco personas.</p>}
    </details>
    <details open={Boolean(candidateCode)}><summary>Agregar materia</summary>
      <fieldset className="joint-proposal" disabled={busy}>
        <legend>Propuesta del plan</legend>
        <label>Materia<select value={code} onChange={(event) => setCode(event.target.value)}><option value="">Elegir materia</option>
          {career.subjects.map((subject) => <option key={subject.code} value={subject.code}>{subject.name}</option>)}
        </select></label>
        <p>Planeada para:</p>
        {allIds.map((uid) => <label key={uid}><input type="checkbox" checked={chosen.includes(uid)} onChange={(event) => setChosen((ids) => event.target.checked ? [...ids, uid] : ids.filter((id) => id !== uid))} />{names([uid])}{!plan.memberIds.includes(uid) ? ' · Invitación pendiente' : ''}</label>)}
        <p>Elegí al menos dos participantes. Incluir una materia no confirma habilitación, intención individual, oferta ni inscripción. Guardar una materia existente reemplaza su propuesta.</p>
        <button className="reset" disabled={!code || chosen.length < 2 || chosen.some((uid) => !allIds.includes(uid))} onClick={() => run(async () => {
          await saveJointSubject(user.uid, plan.id, code, chosen)
          onCandidateUsed()
        })}>Guardar materia en el plan</button>
      </fieldset>
    </details>
  </div>
}
