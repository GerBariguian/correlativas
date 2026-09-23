import { useEffect, useRef, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { auth } from '../firebase'
import { activateActivity, activityBellLabel } from '../activityPresentation'
import ActivityItem from './ActivityItem'

export default function ActivityBell({ user, activity, onNavigate }) {
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const root = useRef(null), trigger = useRef(null), panel = useRef(null), live = useRef(true), pending = useRef(false)
  const { state, actors, controller } = activity
  const { recent, unread, badge } = state
  const close = (restore = false) => { setOpen(false); if (restore) trigger.current?.focus() }
  useEffect(() => { live.current = true; return () => { live.current = false } }, [user])
  useEffect(() => {
    if (!open) return
    panel.current?.focus()
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); close(true) } }
    const outside = event => { if (!root.current?.contains(event.target)) close(false) }
    document.addEventListener('keydown', escape)
    document.addEventListener('pointerdown', outside)
    return () => { document.removeEventListener('keydown', escape); document.removeEventListener('pointerdown', outside) }
  }, [open])
  async function activate(item) {
    if (pending.current || !controller || auth.currentUser !== user) return
    pending.current = true; setBusy(true); setNotice('')
    const result = await activateActivity(item, controller.markRead)
    pending.current = false
    if (!live.current || auth.currentUser !== user) return
    setBusy(false)
    if (result.cancelled) return
    if (!result.destination) { setNotice(result.notice); return }
    close(true)
    onNavigate(result)
  }
  return <div className="activity-control" ref={root}>
    <button type="button" className="activity-trigger" ref={trigger} aria-label={activityBellLabel(badge)} aria-expanded={open} aria-controls="activity-quick-panel" title="Actividad" onClick={() => { setOpen(value => !value); setNotice('') }}>
      <Bell size={22} aria-hidden="true" />
      {badge && (badge.count > 0 || badge.isCapped) && <span className="activity-badge" aria-hidden="true">{badge.isCapped ? '50+' : badge.count}</span>}
    </button>
    {open && <section className="activity-panel" id="activity-quick-panel" role="region" aria-labelledby="activity-quick-title" tabIndex={-1} ref={panel}>
      <div className="activity-panel-head"><h2 id="activity-quick-title">Actividad</h2><button type="button" aria-label="Cerrar actividad" onClick={() => close(true)}><X size={18} aria-hidden="true" /></button></div>
      {notice && <p className="activity-message" role="status">{notice}</p>}
      {unread.status === 'error' && <p className="activity-message" role="status">No pudimos consultar la cantidad sin leer. <button type="button" onClick={() => controller?.retry()}>Reintentar</button></p>}
      {recent.status === 'loading' || recent.status === 'idle' ? <p className="activity-message" role="status">Cargando actividad…</p>
        : recent.status === 'error' ? <p className="activity-message" role="alert">No pudimos cargar tu actividad. <button type="button" onClick={() => controller?.retry()}>Reintentar</button></p>
          : <>
            {recent.diagnostics.length > 0 && <p className="activity-message" role="status">Algunas actividades no están disponibles.</p>}
            {!recent.items.length && !recent.diagnostics.length && <p className="activity-message">No tenés actividad reciente.</p>}
            <ul className="activity-list">{recent.items.map(item => <ActivityItem key={item.instanceKey} item={item} actor={actors[item.actorUid]} onActivate={activate} busy={busy} />)}</ul>
          </>}
      {busy && <p className="activity-message" role="status">Abriendo actividad…</p>}
    </section>}
  </div>
}
