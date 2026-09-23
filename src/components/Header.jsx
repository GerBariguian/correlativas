import ActivityBell from './ActivityBell'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'

function Header({ user, activity, onActivityNavigate }) {
  return (
    <header className="hero">
      <div>
        <p className="eyebrow">Planificador académico inteligente</p>
        <div className="brand-title">
      <img src="/logo.png" alt="Correlativas" />
      <h1>Correlativas</h1>
  </div>
        <p>
      Planificá tu carrera. Descubrí tu camino.
  </p>
      </div>

      {user && (
        <div className="header-personal">
          {activity && <ActivityBell key={user.uid} user={user} activity={activity} onNavigate={onActivityNavigate} />}
          <div className="user-pill">
          <img src={user.photoURL} alt={user.displayName} />
          <div>
            <strong>{user.displayName}</strong>
            <span>{user.email}</span>
        </div>
        <button onClick={() => signOut(auth)}>Salir</button>
    </div>
          </div>
       )}
    </header>
  )
}

export default Header
