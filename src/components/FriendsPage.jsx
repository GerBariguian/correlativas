import { useEffect, useRef, useState } from 'react'
import { auth } from '../firebase'
import { careers } from '../data/careers'
import {
  findUserByEmail, friendsError, loadSocialProfiles,
  respondToFriendRequest, sendFriendRequest, subscribeFriendships,
} from '../services/friends'

function Person({ profile, children }) {
  const career = careers.find((item) => item.id === profile?.careerId)
  const safePhoto = profile?.photoURL?.startsWith('https://') ? profile.photoURL : null
  return (
    <article className="friend-person">
      {safePhoto && <img src={safePhoto} alt="" referrerPolicy="no-referrer" />}
      <div className="friend-person-info">
        <strong>{profile?.name || 'Usuario de Correlativas'}</strong>
        {career && <small>{career.university} · {career.name} · Plan {career.plan}</small>}
      </div>
      <div className="friend-actions">{children}</div>
    </article>
  )
}

export default function FriendsPage({ user, socialProfile }) {
  const [email, setEmail] = useState('')
  const [result, setResult] = useState(null)
  const [searched, setSearched] = useState(false)
  const [relationships, setRelationships] = useState([])
  const [profiles, setProfiles] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const mounted = useRef(false)
  const action = useRef(false)
  const searchVersion = useRef(0)

  function current() {
    return mounted.current && auth.currentUser === user
  }

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; searchVersion.current += 1 }
  }, [])

  useEffect(() => {
    if (!socialProfile.ready) return
    let cancelled = false
    let version = 0
    setLoading(true)
    setError('')
    const unsubscribe = subscribeFriendships(user.uid, async (items) => {
      const request = ++version
      try {
        const visible = items.filter((item) => item.status !== 'rejected')
        const people = await loadSocialProfiles(visible.flatMap((item) => item.participants.filter((uid) => uid !== user.uid)))
        if (cancelled || !current() || request !== version) return
        setRelationships(items)
        setProfiles(people)
        setLoading(false)
      } catch (failure) {
        if (!cancelled && current() && request === version) {
          setError(friendsError(failure))
          setLoading(false)
        }
      }
    }, (failure) => {
      version += 1
      if (!cancelled && current()) { setError(friendsError(failure)); setLoading(false) }
    })
    return () => { cancelled = true; unsubscribe() }
  }, [user, socialProfile.ready, attempt])

  async function search(event) {
    event.preventDefault()
    if (action.current) return
    action.current = true
    setBusy(true)
    setError('')
    setNotice('')
    setResult(null)
    setSearched(false)
    const request = ++searchVersion.current
    try {
      const person = await findUserByEmail(email)
      if (!current() || request !== searchVersion.current) return
      setResult(person)
      setSearched(true)
    } catch (failure) {
      if (current() && request === searchVersion.current) setError(friendsError(failure))
    } finally {
      action.current = false
      if (current()) setBusy(false)
    }
  }

  async function mutate(operation, message) {
    if (action.current) return
    action.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await operation()
      if (current()) setNotice(message)
    } catch (failure) {
      if (current()) setError(friendsError(failure))
    } finally {
      action.current = false
      if (current()) setBusy(false)
    }
  }

  const received = relationships.filter((item) => item.status === 'pending' && item.recipientId === user.uid)
  const sent = relationships.filter((item) => item.status === 'pending' && item.senderId === user.uid)
  const friends = relationships.filter((item) => item.status === 'accepted')
  const relationship = result && relationships.find((item) => item.participants.includes(result.uid))

  return (
    <section className="friends-page">
      <div className="side-card">
        <h2>Amigos</h2>
        <p>Buscá por el email completo de Google que la otra persona usa en Correlativas.</p>
        <p className="friends-muted">Se comparten nombre, foto y carrera/plan. El email se usa solo para la búsqueda exacta. Tu progreso académico sigue siendo privado.</p>
        {socialProfile.error ? <div role="alert"><p>{socialProfile.error}</p><button className="reset" onClick={socialProfile.retry}>Reintentar</button></div> : !socialProfile.ready ? <p role="status">Preparando tu perfil...</p> : <>
          <form className="friend-search" onSubmit={search}>
            <label htmlFor="friend-email">Email</label>
            <input id="friend-email" type="email" required maxLength={254} value={email} placeholder="nombre@ejemplo.com" onChange={(event) => {
              setEmail(event.target.value)
              searchVersion.current += 1
              setResult(null)
              setSearched(false)
            }} />
            <button className="reset" disabled={busy || loading}>Buscar</button>
          </form>
          {searched && !result && <p role="status">No encontramos ese usuario. Debe haber ingresado a Correlativas con esta versión.</p>}
          {result && <Person profile={result}>
            {result.uid === user.uid ? <span>Este es tu perfil</span> : relationship ? <span>{relationship.status === 'accepted' ? 'Ya son amigos' : relationship.status === 'rejected' ? 'Solicitud rechazada' : relationship.recipientId === user.uid ? 'Tenés una solicitud recibida' : 'Solicitud enviada'}</span> : <button className="reset" disabled={busy} onClick={() => mutate(() => sendFriendRequest(user.uid, result.uid), 'Solicitud enviada.')}>
              Enviar solicitud
            </button>}
          </Person>}
        </>}
        {error && <div role="alert"><p>{error}</p><button className="reset" disabled={busy} onClick={() => setAttempt((value) => value + 1)}>Reintentar</button></div>}
        {notice && <p role="status">{notice}</p>}
      </div>
      {socialProfile.ready && <>
        <div className="side-card">
          <h2>Solicitudes recibidas</h2>
          {loading ? <p role="status">Cargando...</p> : !received.length && <p>No tenés solicitudes recibidas.</p>}
          {received.map((item) => <Person key={item.id} profile={profiles[item.senderId]}>
            <button className="reset" disabled={busy} onClick={() => mutate(() => respondToFriendRequest(user.uid, item.id, 'accepted'), 'Solicitud aceptada.')}>Aceptar</button>
            <button className="reset" disabled={busy} onClick={() => mutate(() => respondToFriendRequest(user.uid, item.id, 'rejected'), 'Solicitud rechazada.')}>Rechazar</button>
          </Person>)}
        </div>
        <div className="side-card">
          <h2>Mis amigos</h2>
          {loading ? <p role="status">Cargando...</p> : !friends.length && <p>Todavía no agregaste amigos.</p>}
          {friends.map((item) => <Person key={item.id} profile={profiles[item.participants.find((uid) => uid !== user.uid)]} />)}
        </div>
        {sent.length > 0 && <div className="side-card">
          <h2>Solicitudes enviadas</h2>
          {sent.map((item) => <Person key={item.id} profile={profiles[item.recipientId]}><span>Pendiente</span></Person>)}
        </div>}
      </>}
    </section>
  )
}
