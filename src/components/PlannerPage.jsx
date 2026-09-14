import { useState } from 'react'
import Planner from './Planner'
import PlanningComparison from './PlanningComparison'
import JointPlanPanel from './JointPlanPanel'
import usePlanningParticipants, { participantMessages } from '../hooks/usePlanningParticipants'
import { addComparisonFriend, derivePlanningSnapshot } from '../planningLogic'

export default function PlannerPage({ user, career, statusMap, ...plannerProps }) {
  const [selectedIds, setSelectedIds] = useState([])
  const [view, setView] = useState('selection')
  const [attempt, setAttempt] = useState(0)
  const [candidateCode, setCandidateCode] = useState('')
  const [visitedPlan, setVisitedPlan] = useState(false)
  const { friends, participants: others } = usePlanningParticipants(user, career, selectedIds, attempt)
  const participants = [{ uid: user.uid, name: 'Vos', isSelf: true, state: 'ready', snapshot: derivePlanningSnapshot(career, statusMap, null, null, true) }, ...others]
  function showPlan(code = '') { setCandidateCode(code); setVisitedPlan(true); setView('joint') }
  return <section>
    <div className="side-card planning-controls">
      <label className="friend-search">Planificar con:
        <select value="" disabled={selectedIds.length >= 4 || friends.state !== 'ready'} onChange={(event) => {
          setSelectedIds((ids) => addComparisonFriend(ids, event.target.value, friends.ids)); setView('comparison')
        }}>
          <option value="">{selectedIds.length >= 4 ? 'Máximo de 4 amigos' : '+ Agregar amigo'}</option>
          {friends.ids.filter((id) => !selectedIds.includes(id)).map((uid) => <option key={uid} value={uid}>{friends.profiles[uid]?.name || uid}</option>)}
        </select>
      </label>
      <ul className="planning-participants">
        {others.map((p) => <li key={p.uid}>
          <span>{p.name} · {p.state === 'ready' ? p.snapshot.schemaVersion === 1 ? 'Aprobadas y habilitadas; finales sin compartir' : 'Datos disponibles' : participantMessages[p.state]}</span>
          <button className="reset" aria-label={`Quitar a ${p.name} de la comparación`} onClick={() => setSelectedIds((ids) => ids.filter((id) => id !== p.uid))}>Quitar de la comparación</button>
        </li>)}
      </ul>
      {friends.state === 'loading' && <p role="status">Cargando amigos...</p>}
      {friends.state === 'ready' && !friends.ids.length && <p>No tenés amigos aceptados para comparar. Podés agregarlos desde Amigos.</p>}
      {(friends.state === 'error' || others.some((p) => ['unavailable', 'stale'].includes(p.state))) && <button className="reset" onClick={() => setAttempt((n) => n + 1)}>Reintentar conexión</button>}
      <div className="top-nav">
        <button className={view === 'selection' ? 'active' : ''} onClick={() => setView('selection')}>Mi selección</button>
        <button className={view === 'comparison' ? 'active' : ''} onClick={() => setView('comparison')}>Comparar avance</button>
        <button className={view === 'joint' ? 'active' : ''} onClick={() => { setVisitedPlan(true); setView('joint') }}>Plan conjunto</button>
      </div>
    </div>
    {view === 'selection' && <Planner {...plannerProps} />}
    {view === 'comparison' && (!selectedIds.length ? <p>Seleccioná al menos un amigo para comparar el avance.</p> : <PlanningComparison career={career} participants={participants} onPlan={showPlan} />)}
    {visitedPlan && <div hidden={view !== 'joint'}><JointPlanPanel user={user} career={career} participants={participants} friends={friends} candidateCode={candidateCode} onCandidateUsed={() => setCandidateCode('')} /></div>}
  </section>
}
