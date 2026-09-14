import { useState } from 'react'
import Planner from './Planner'
import PlanningComparison from './PlanningComparison'
import usePlanningFriend from '../hooks/usePlanningFriend'
import { derivePlanningSnapshot } from '../planningLogic'

export default function PlannerPage({ user, career, statusMap, ...plannerProps }) {
  const [selectedId, setSelectedId] = useState('')
  const [view, setView] = useState('selection')
  const [attempt, setAttempt] = useState(0)
  const { friends, comparison } = usePlanningFriend(user, career, selectedId, attempt)
  const mine = derivePlanningSnapshot(career, statusMap, null, null)
  const friendName = friends.profiles[selectedId]?.name || 'tu amigo'
  return <section>
    <div className="side-card">
      <label className="friend-search">Planificar con:
        <select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); if (event.target.value) setView('comparison') }}>
          <option value="">+ Agregar amigo</option>
          {selectedId && !friends.ids.includes(selectedId) && <option value={selectedId}>Amigo no disponible</option>}
          {friends.ids.map((uid) => <option key={uid} value={uid}>{friends.profiles[uid]?.name || uid}</option>)}
        </select>
      </label>
      {selectedId && <button className="reset" onClick={() => { setSelectedId(''); setView('selection') }}>Quitar amigo</button>}
      {friends.state === 'loading' && <p role="status">Cargando amigos...</p>}
      {friends.state === 'ready' && !friends.ids.length && <p>No tenés amigos aceptados para comparar. Podés agregarlos desde Amigos.</p>}
      {(friends.state === 'error' || (selectedId && ['unavailable', 'stale'].includes(comparison.state))) && <button className="reset" onClick={() => setAttempt((n) => n + 1)}>Reintentar conexión</button>}
      <div className="top-nav">
        <button className={view === 'selection' ? 'active' : ''} onClick={() => setView('selection')}>Mi selección</button>
        <button className={view === 'comparison' ? 'active' : ''} onClick={() => setView('comparison')}>Comparar avance</button>
      </div>
    </div>
    {view === 'selection' ? <Planner {...plannerProps} /> : !selectedId ? <p>Seleccioná un amigo para comparar el avance.</p> :
      <PlanningComparison key={`${career.id}:${selectedId}`} career={career} mine={mine} comparison={comparison} friendName={friendName} />}
  </section>
}
