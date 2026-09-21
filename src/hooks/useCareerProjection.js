import { useEffect, useRef, useState } from 'react'
import { createProjectionController } from '../projectionPersistenceController'
import { projectionRepository } from '../services/careerProjections'

export default function useCareerProjection(user, careerId, visible) {
  const contexts = useRef(new Map())
  const [, render] = useState(0)
  useEffect(() => {
    const controllers = contexts.current
    return () => { controllers.forEach(c => c.dispose()); controllers.clear() }
  }, [user])
  useEffect(() => {
    if (!user || !visible) return
    const key = `${user.uid}:${careerId}`
    if (!contexts.current.has(key)) {
      const controller = createProjectionController(projectionRepository(user.uid, careerId), () => render(n => n + 1))
      contexts.current.set(key, controller)
    }
    contexts.current.get(key).load()
  }, [user, careerId, visible])
  const controller = user ? contexts.current.get(`${user.uid}:${careerId}`) : null
  return controller ? { ...controller.getState(), change: controller.change, reset: controller.reset, retry: controller.retry }
    : { phase: 'loading', scenario: null }
}
