import { socialMaintenance, socialMaintenanceMessage } from '../socialMaintenance'

export default function SocialMaintenanceNotice() {
  return socialMaintenance ? <aside className="activity-navigation-notice" role="status" aria-label="Actualización de funciones sociales">{socialMaintenanceMessage}</aside> : null
}
