import { useEffect, useRef, useState } from 'react'
import { createPlannerWorker } from '../workers/createPlannerWorker'
import { createPlannerWorkerController } from '../plannerWorkerController'

export default function usePlannerSuggestion(input, scopeKey) {
  const key = JSON.stringify([scopeKey, input])
  const currentKey = useRef(key)
  const changed = currentKey.current !== key
  currentKey.current = key
  const [state, setState] = useState({ phase: 'idle' })
  const controller = useRef(null)
  if (!controller.current) controller.current = createPlannerWorkerController(createPlannerWorker, next => {
    if (next.key === currentKey.current) setState(next)
  })
  useEffect(() => {
    controller.current.cancel()
    setState({ phase: 'idle' })
    return () => controller.current.cancel()
  }, [key])
  const visible = !changed && state.key === key ? state : { phase: 'idle' }
  return { ...visible, start: () => controller.current.start(input, key),
    dismiss: () => { controller.current.cancel(); setState({ phase: 'idle' }) } }
}
