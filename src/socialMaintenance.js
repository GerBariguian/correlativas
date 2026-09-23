// Build-time UX only. Firestore Rules enforce the pause independently.
// Normal builds have no remote flag, polling, or permanent version negotiation.
export const socialMaintenance = typeof __SOCIAL_MAINTENANCE__ !== 'undefined' && __SOCIAL_MAINTENANCE__ === true
export const socialMaintenanceMessage = 'Estamos actualizando las funciones sociales. Enviar y aceptar solicitudes, crear planes e invitar participantes está temporalmente pausado. Volvé a intentar en unos minutos; si la pausa continúa, recargá la página.'
export function assertSocialCreationAvailable() {
  if (socialMaintenance) throw new Error(socialMaintenanceMessage)
}
