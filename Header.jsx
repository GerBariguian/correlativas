import { RotateCcw } from 'lucide-react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'

function Header({ reset, user }) {
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

      <button className="reset" onClick={reset}>
        <RotateCcw size={18} />
        Reiniciar
      </button>
      {user && (
  	<div className="user-pill">
          <img src={user.photoURL} alt={user.displayName} />
          <div>
            <strong>{user.displayName}</strong>
            <span>{user.email}</span>
    	  </div>
    	  <button onClick={() => signOut(auth)}>Salir</button>
  	</div>
       )}
    </header>
  )
}

export default Header