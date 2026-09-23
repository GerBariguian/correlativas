import { initializeApp } from 'firebase/app'
import { getAuth, initializeAuth, inMemoryPersistence, browserPopupRedirectResolver, connectAuthEmulator, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { selectFirebaseRuntime } from './firebaseRuntime'

const runtime = selectFirebaseRuntime(import.meta.env, globalThis.location)
export const isEmulator = runtime.emulator
export const app = initializeApp(runtime.config)
export const auth = isEmulator ? initializeAuth(app, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver }) : getAuth(app)
export const db = getFirestore(app)
if (isEmulator) {
  // Synchronous, before importers can register listeners or issue operations.
  // Failure aborts module initialization; there is no remote fallback.
  connectAuthEmulator(auth, runtime.authUrl)
  connectFirestoreEmulator(db, runtime.firestoreHost, runtime.firestorePort)
}
export const googleProvider = new GoogleAuthProvider()
