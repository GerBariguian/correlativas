// One disposable worker per request. Cancellation terminates CPU work as well as
// invalidating callbacks; errors never fall back to a main-thread search.
export function createPlannerWorkerController(createWorker, notify) {
  let active = null, sequence = 0
  const cancel = () => {
    sequence++
    if (active) { active.worker.terminate(); active = null }
  }
  return {
    cancel,
    start(input, key) {
      if (active) return false
      const requestId = ++sequence
      try {
        const worker = createWorker()
        active = { worker, requestId }
        const finish = state => {
          if (requestId !== sequence || active?.worker !== worker) return
          cancel()
          notify({ ...state, key })
        }
        worker.onmessage = ({ data }) => {
          if (data?.requestId !== requestId) return
          if (data.ok && data.result && data.comparison?.valid) finish({ phase: 'ready', result: data.result, comparison: data.comparison })
          else if (data.ok && data.result?.diagnostics?.length) finish({ phase: 'unavailable', diagnostics: data.result.diagnostics })
          else finish({ phase: 'error' })
        }
        worker.onerror = event => { event.preventDefault?.(); finish({ phase: 'error' }) }
        worker.onmessageerror = () => finish({ phase: 'error' })
        notify({ phase: 'loading', key })
        worker.postMessage({ requestId, input })
        return true
      } catch {
        cancel()
        notify({ phase: 'error', key })
        return false
      }
    },
  }
}
