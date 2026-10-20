import { initializeApp, deleteApp } from 'firebase/app'
import { initializeAuth, inMemoryPersistence, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth'
import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator } from 'firebase/firestore'
import { CONFIG, validateLocation, readiness } from './policy.mjs'
import { bindAcademicReads } from './academicReadAdapter.mjs'

const fixtureUsers = Object.freeze(['lab-legacy', 'lab-instances', 'lab-empty', 'lab-blocked'])
// Separate C2 capability: no UI integration and no arbitrary credentials/project/host.
export async function connectAcademicLab(uid) {
  if (!fixtureUsers.includes(uid)) throw Error('C2_FIXTURE_USER_REQUIRED')
  validateLocation(globalThis.location)
  await readiness(globalThis.fetch.bind(globalThis))
  const app = initializeApp({ projectId: CONFIG.projectId, apiKey: 'fake-lab-key', appId: 'lab-only', authDomain: 'localhost' }, 'c2-' + crypto.randomUUID())
  let closed = false
  try {
    const auth = initializeAuth(app, { persistence: inMemoryPersistence })
    connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true })
    const db = initializeFirestore(app, { localCache: memoryLocalCache() })
    connectFirestoreEmulator(db, '127.0.0.1', 8188)
    await signInWithEmailAndPassword(auth, uid + '@example.test', 'fixture-only-password')
    const repository = bindAcademicReads({ db, auth, uid, assertLive: () => { if (closed) throw Error('C2_CLOSED') } })
    return Object.freeze({
      async readProgress(scope) {
        if (closed) return { state: 'error', scope, code: 'C2_CLOSED' }
        try { await readiness(globalThis.fetch.bind(globalThis)) }
        catch { return { state: 'error', scope, code: 'C2_EMULATOR_UNAVAILABLE' } }
        return repository.readProgress(scope)
      },
      async close() { if (!closed) { closed = true; await deleteApp(app) } },
    })
  } catch (error) { closed = true; await deleteApp(app); throw error }
}
