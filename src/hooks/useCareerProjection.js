import { useEffect, useRef, useState } from 'react'
import { createProjectionController } from '../projectionPersistenceController'
import { projectionRepository } from '../services/careerProjections'

export default function useCareerProjection(user, careerId, visible, bridge = null) {
  const contexts = useRef(new Map())
  const [, render] = useState(0)
  const key = bridge ? bridge.key : user ? `${user.uid}:${careerId}` : null
  useEffect(() => {
    contexts.current.forEach((controller, controllerKey) => controller.setSuspended(Boolean(bridge)
      && (!bridge.capabilities.academicWrite || !controllerKey.startsWith(`${user?.uid}:${bridge.authority}:`)
        || (bridge.authority === 'instances' && !bridge.instances?.some(instance => instance.lifecycle === 'active'
          && controllerKey === `${user?.uid}:instances:${instance.careerInstanceId}`)))))
  }, [key, bridge?.authority, bridge?.capabilities.academicWrite, bridge?.instances, user])
  useEffect(() => {
    const controllers = contexts.current
    return () => { controllers.forEach(c => c.dispose()); controllers.clear() }
  }, [user])
  useEffect(() => {
    if (!user || !visible || !key || (bridge && !bridge.capabilities.academicWrite)) return
    if (!contexts.current.has(key)) {
      const repository = bridge ? bridge.projectionRepository() : projectionRepository(user.uid, careerId)
      const controller = createProjectionController(repository, () => render(n => n + 1))
      contexts.current.set(key, controller)
    }
    contexts.current.get(key).load()
  }, [user, careerId, visible, key, bridge?.capabilities.academicWrite])
  const controller = user && key ? contexts.current.get(key) : null
  const retainedDraft = Boolean(bridge && [...contexts.current.entries()].some(([oldKey, c]) => oldKey !== key
    && c.getState().suspended && c.getState().scenario && ['saving', 'error', 'conflict'].includes(c.getState().phase)))
  return controller ? { ...controller.getState(), retainedDraft, change: controller.change, reset: controller.reset, retry: controller.retry }
    : { phase: 'loading', scenario: null, retainedDraft }
}
