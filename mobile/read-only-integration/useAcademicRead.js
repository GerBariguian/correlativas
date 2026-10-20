import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { createAcademicQueryController, queryIdentity, academicQueryView } from './academicQueryController.mjs'
const idle = Object.freeze({ state: 'idle' })
// Each mounted consumer owns its query controller, never the injected connection.
export function useAcademicRead(connection, input) {
  let identity, failure = false
  try { identity = queryIdentity(input) } catch { failure = true; identity = { scope: null, key: null } }
  const key = identity.key
  const controller = useMemo(() => createAcademicQueryController(), [connection, key, failure])
  const stableScope = useMemo(() => identity.scope, [key])
  const subscribe = useMemo(() => listener => controller.subscribe(listener), [controller])
  const snapshot = useSyncExternalStore(subscribe, controller.getSnapshot, () => idle)
  useEffect(() => {
    if (failure) { controller.cancel(); return }
    return controller.start(connection, stableScope)
  }, [controller, connection, key, failure, stableScope])
  // Render-time gate: effects have not necessarily cleaned up the old scope yet.
  const state = academicQueryView(connection, input, snapshot)
  // Old render callbacks cannot refresh the previous binding before effect cleanup.
  const refresh = () => {
    const current = controller.getSnapshot()
    if (connection?.isCurrent() && current.connectionId === connection.id && current.key === key) return controller.refresh()
    return Promise.resolve()
  }
  return { ...state, refresh }
}
