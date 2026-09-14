import { useEffect, useRef, useState } from 'react'
import { auth } from '../firebase'
import { careers } from '../data/careers'
import { setPlanningSharing, subscribePlanningSharing } from '../services/planning'
import { friendsError } from '../services/friends'

export default function ProgressSharingSettings({ user, careerId }) {
  const [sharing, setSharing] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const active = useRef(false)
  const pending = useRef(false)
  useEffect(() => {
    active.current = true
    setError('')
    const stop = subscribePlanningSharing(user.uid, (value) => {
      if (active.current && auth.currentUser === user) setSharing(value)
    }, (failure) => {
      if (active.current && auth.currentUser === user) { setSharing(null); setError(friendsError(failure)) }
    })
    return () => { active.current = false; stop() }
  }, [user, attempt])

  async function change(enabled, targetCareer = careerId) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try { await setPlanningSharing(user.uid, targetCareer, enabled) }
    catch (failure) { if (active.current && auth.currentUser === user) setError(friendsError(failure)) }
    finally {
      pending.current = false
      if (active.current && auth.currentUser === user) setBusy(false)
    }
  }
  const sharedCareer = careers.find((career) => career.id === sharing?.sharedCareerId)
  return <section className="side-card planning-sharing">
    <h2>Privacidad del progreso</h2>
    <label><input type="checkbox" checked={Boolean(sharing?.enabled)} disabled={!sharing || busy}
      onChange={(event) => change(event.target.checked, sharing?.enabled ? sharing.sharedCareerId : careerId)} /> Compartir mi progreso con amigos</label>
    <p>Tus amigos podrán ver qué materias aprobaste y cuáles tenés habilitadas para cursar. No se comparten materias cursando, regularizadas ni otros estados.</p>
    <p>Se comparte con todos tus amigos aceptados, incluidos los que agregues después. No necesitás compartir para ver a un amigo que comparte con vos.</p>
    {sharing?.enabled && <>
      <p>Compartís: {sharedCareer?.university} · {sharedCareer?.name} · Plan {sharedCareer?.plan}.</p>
      <button className="reset" disabled={busy} onClick={() => change(true, careerId)}>
        {sharing.sharedCareerId === careerId ? 'Actualizar datos compartidos' : 'Compartir la carrera seleccionada'}
      </button>
    </>}
    {busy && <p role="status">Guardando en Firebase...</p>}
    {!sharing && !error && <p role="status">Esperando conexión con Firebase para verificar el consentimiento...</p>}
    {error && <div role="alert"><p>{error}</p><button className="reset" disabled={busy} onClick={() => setAttempt((n) => n + 1)}>Reintentar</button></div>}
  </section>
}
