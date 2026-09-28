import { useEffect, useState } from 'react'
import useJointPlans from '../hooks/useJointPlans'

// Read-only membership history. No participant academic context or snapshot requests.
export default function JointPlanHistory({ user, activityIntent, onActivityConsumed }) {
  const [id, setId] = useState('')
  const data = useJointPlans(user, null, id, 0)
  useEffect(() => {
    if (!activityIntent || data.state === 'loading') return
    setId(data.plans.some(plan => plan.id === activityIntent.planId) ? activityIntent.planId : '')
    onActivityConsumed?.()
  }, [activityIntent, data.state, data.plans, onActivityConsumed])
  return <section className="side-card">
    <h2>Historia de planes conjuntos</h2>
    <p>La comparación académica, compartir avance y las modificaciones de planes están temporalmente suspendidas durante la transición multicarrera.</p>
    <label>Plan <select value={id} onChange={event => setId(event.target.value)}>
      <option value="">Elegir un plan</option>
      {data.plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name || 'Plan conjunto'}{plan.closed ? ' · Cerrado' : ''}</option>)}
    </select></label>
    {data.state === 'unavailable' && <p role="status">No se pudo cargar la historia de planes.</p>}
    {data.selected && <p>Catálogo: {data.selected.careerId}</p>}
    {data.rows && <ul>{data.rows.map(row => <li key={row.code}>{row.code}</li>)}</ul>}
    {data.selected && data.rowsState === 'unavailable' && <p>Las materias de este plan no están disponibles para tu participación actual.</p>}
  </section>
}
