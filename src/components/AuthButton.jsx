import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { auth, googleProvider } from '../firebase'

function AuthButton() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    return onAuthStateChanged(auth, setUser)
  }, [])

  if (user) {
    return (
      <div className="auth-box">
        <span>{user.displayName}</span>
        <button onClick={() => signOut(auth)}>Cerrar sesión</button>
      </div>
    )
  }

  return (
    <button className="auth-login" onClick={() => signInWithPopup(auth, googleProvider)}>
      Iniciar sesión con Google
    </button>
  )
}

export default AuthButton