export function activityCopy(item, actor) {
  const name = typeof actor === 'string' && actor.trim() ? actor.trim() : 'Alguien'
  switch (item.type) {
    case 'FRIEND_REQUEST_RECEIVED': return `${name} te envió una solicitud de amistad`
    case 'FRIEND_REQUEST_ACCEPTED': return `${name} aceptó tu solicitud de amistad`
    case 'JOINT_PLAN_INVITATION': return `${name} te invitó a un Plan conjunto`
    default: return 'Actividad no disponible'
  }
}
export function activityTime(timestamp, now = Date.now()) {
  const date = new Date(timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1000000))
  const minutes = Math.max(0, Math.floor((now - date.getTime()) / 60000))
  const label = minutes < 1 ? 'Ahora' : minutes < 60 ? `Hace ${minutes} min`
    : minutes < 1440 ? `Hace ${Math.floor(minutes / 60)} h`
      : date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
  return { label, dateTime: date.toISOString(), title: date.toLocaleString('es-AR') }
}
export function activityBellLabel(badge) {
  return badge === null ? 'Actividad, cantidad sin leer no disponible'
    : badge.isCapped ? 'Actividad, más de 50 notificaciones sin leer'
      : badge.count ? `Actividad, ${badge.count} notificaciones sin leer` : 'Actividad, sin notificaciones sin leer'
}

// Even already-read items are checked: a rendered slot may have been reused.
// On failure, only a generic destination is safe; never select an unchecked plan.
export async function activateActivity(item, markRead, timeoutMs = 8000) {
  let timer
  let result
  try {
    result = await Promise.race([Promise.resolve().then(() => markRead(item)), new Promise(resolve => {
      timer = globalThis.setTimeout(() => resolve({ status: 'error' }), timeoutMs)
    })])
  } catch { result = { status: 'error' } }
  finally { globalThis.clearTimeout(timer) }
  if (result.status === 'cancelled') return { cancelled: true }
  if (['stale', 'missing'].includes(result.status)) return { notice: 'Esta actividad ya no está disponible.' }
  const destination = item.target.kind === 'friendship' ? 'friends' : 'joint'
  if (!['marked','alreadyRead'].includes(result.status)) return { destination, notice: 'No se pudo confirmar la lectura. Podés revisar la sección de destino.' }
  return { destination, planId: destination === 'joint' ? item.target.id : undefined }
}

// Uses only the Planner's authorized, current-career list. Never fetches a hidden target.
export function activityPlanSelection(intent, data) {
  if (data.state === 'loading') return null
  const plan = data.state === 'ready' && data.plans.find(p => p.id === intent.planId && !p.deleting)
  return plan ? { planId: plan.id, notice: '' } : { planId: '', notice: intent.notice || 'Esta actividad ya no está disponible en la carrera actual. Podés revisar tus planes o elegir otra carrera.' }
}
