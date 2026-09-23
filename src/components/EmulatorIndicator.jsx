import { isEmulator } from '../firebase'

export default function EmulatorIndicator() {
  return isEmulator ? <aside className="emulator-indicator" aria-label="Entorno de prueba">Emulator local</aside> : null
}
