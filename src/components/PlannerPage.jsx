import { useEffect, useRef, useState } from 'react'
import { activityPlanSelection } from '../activityPresentation'
import Planner from './Planner'
import JointPlanHistory from './JointPlanHistory'
import PlanningComparison from './PlanningComparison'
import JointPlanPanel from './JointPlanPanel'
import AddPlanSubjectDialog from './AddPlanSubjectDialog'
import usePlanningParticipants from '../hooks/usePlanningParticipants'
import useJointPlans from '../hooks/useJointPlans'
import useJointProfiles from '../hooks/useJointProfiles'
import usePlanAcademicContext from '../hooks/usePlanAcademicContext'
import { addComparisonFriend, derivePlanningSnapshot } from '../planningLogic'
import { academicMessages } from '../planningPresentation'
import { fallbackPlanName } from '../jointPlanLogic'

export default function PlannerPage({ academicSocial = true, ...props }) {
  if (academicSocial) return <LegacyPlannerPage {...props} />
  const { user, career, statusMap, activityIntent, onActivityConsumed, ...plannerProps } = props
  return <section className="planning-ui">
    <Planner {...plannerProps} statusMap={statusMap} scopeKey={`${user.uid}:${career.id}`} />
  </section>
}

function LegacyPlannerPage({ user, career, statusMap, activityIntent, onActivityConsumed, ...plannerProps }) {
  const [selectedIds, setSelectedIds] = useState([])
  const [view, setView] = useState('selection')
  const [attempt, setAttempt] = useState(0)
  const [planId, setPlanId] = useState('')
  const [planComparison, setPlanComparison] = useState(false)
  const [request, setRequest] = useState(null)
  const [deferred, setDeferred] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [notice, setNotice] = useState('')
  const { friends, participants: others } = usePlanningParticipants(user, career, selectedIds, attempt)
  const mine = { uid: user.uid, name: 'Vos', isSelf: true, state: 'ready', snapshot: derivePlanningSnapshot(career, statusMap, null, null, true) }
  const comparison = [mine, ...others]
  const data = useJointPlans(user, career.id, planId, attempt)
  const consumedActivity = useRef(null)
  useEffect(() => {
    if (!activityIntent || consumedActivity.current === activityIntent.token) return
    setView('joint')
    const selection = activityPlanSelection(activityIntent, data)
    if (!selection) return
    consumedActivity.current = activityIntent.token
    setPlanId(selection.planId); setNotice(selection.notice)
    onActivityConsumed?.()
  }, [activityIntent, data.state, data.plans, onActivityConsumed])
  const profileIds = data.plans.flatMap((p) => [p.ownerId, ...p.inviteeIds, ...Object.values(p.invitedBy || {})])
    .concat((data.rows || []).flatMap((row) => [row.addedByUid, ...row.proposedParticipantIds]).filter(Boolean))
  const profiles = useJointProfiles(user, profileIds)
  const nameOf = (uid) => uid === user.uid ? user.displayName || 'Vos' : profiles[uid]?.name || friends.profiles[uid]?.name || 'Participante'
  const titleOf = (plan) => plan.name || fallbackPlanName(plan.inviteeIds.map(nameOf))
  const planIds = data.selected ? [data.selected.ownerId, ...data.selected.inviteeIds] : []
  const planPeople = usePlanAcademicContext(user, career, planIds, friends.state === 'ready' ? friends.ids : [], comparison, attempt)
    .map((p) => ({ ...p, name: nameOf(p.uid), isSelf: p.uid === user.uid }))
  function addSubject(code = '', matchingIds = []) {
    if (!data.selected || data.selected.closed || data.selected.deleting || !data.selected.memberIds.includes(user.uid)) {
      setPlanId(data.plans.find((p) => !p.closed && !p.deleting && p.memberIds.includes(user.uid))?.id || '')
    }
    setView('joint'); setNotice('Las invitaciones y modificaciones de estos planes anteriores están suspendidas. Usá Planes conjuntos para un plan nuevo.')
  }
  const comparePeople = planComparison ? planPeople : comparison
  return <section className="planning-ui">
    <nav className="top-nav planning-tabs" aria-label="Vistas del planificador">
      {[['selection', 'Mi selección'], ['comparison', 'Comparar avance'], ['joint', 'Plan conjunto']].map(([key, text]) => <button key={key} className={view === key ? 'active' : ''} aria-current={view === key ? 'page' : undefined} onClick={() => { setView(key); setNotice('') }}>{text}</button>)}
    </nav>
    {notice && <p role="status">{notice}</p>}
    {view === 'selection' && <Planner {...plannerProps} statusMap={statusMap} scopeKey={`${user.uid}:${career.id}`} />}
    {view === 'comparison' && <>
      <header className="planning-section-head"><h2>Comparar avance</h2></header>
      {planComparison ? <div className="planning-context"><p>{data.selected ? `Comparando participantes de ${titleOf(data.selected)}` : 'Este plan ya no está disponible para vos.'}</p><button className="planning-link" onClick={() => setPlanComparison(false)}>Volver a mi comparación</button></div> : <>
        <div className="planning-friend-picker"><span>Planificar con:</span>
          {others.map((p) => <span className="planning-chip" key={p.uid}><span>{p.name}{p.state !== 'ready' && <small>{academicMessages[p.state] || 'Información no disponible'}</small>}</span><button className="planning-icon" aria-label={`Quitar a ${p.name} de la comparación`} onClick={() => setSelectedIds((ids) => ids.filter((uid) => uid !== p.uid))}>×</button></span>)}
          <label className="planning-add-friend"><span className="planning-sr-only">Agregar amigo a la comparación</span><select value="" disabled={selectedIds.length >= 4 || friends.state !== 'ready'} onChange={(event) => { const uid = event.target.value; setSelectedIds((ids) => addComparisonFriend(ids, uid, friends.ids)) }}><option value="">{selectedIds.length >= 4 ? 'Máximo: 4 amigos' : '+ Agregar amigo'}</option>{friends.ids.filter((uid) => !selectedIds.includes(uid)).map((uid) => <option key={uid} value={uid}>{nameOf(uid)}</option>)}</select></label>
        </div>
        {friends.state === 'loading' && <p role="status">Cargando amigos...</p>}
        {friends.state === 'ready' && !friends.ids.length && <p>Podés agregar amigos desde Amigos para comparar su avance.</p>}
      </>}
      {(friends.state === 'error' || comparePeople.some((p) => ['unavailable', 'stale'].includes(p.state))) && <button className="planning-secondary" onClick={() => setAttempt((n) => n + 1)}>Reintentar</button>}
      {comparePeople.length >= 2 ? <PlanningComparison career={career} participants={comparePeople} onPlan={addSubject} /> : !planComparison && <p>Seleccioná al menos un amigo para comparar.</p>}
    </>}
    {view === 'joint' && <JointPlanHistory user={user} />}
  </section>
}
