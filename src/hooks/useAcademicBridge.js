import { useEffect, useMemo, useRef, useState } from 'react'
import { auth, db } from '../firebase'
import { academicBridgeRepository } from '../services/academicBridge'
import { academicScope, academicScopeKey } from '../userDataAuthorityLogic'
import { loadUserStatus, subscribeUserStatus, saveUserStatus } from '../services/firestore'
import { projectionRepository } from '../services/careerProjections'
import { careerLifecycleRepository } from '../services/careerLifecycle'
import { careers } from '../data/careers'

const waiting = { authority: 'loading', capabilities: { academicWrite: false, select: false, legacySocial: false }, instances: [] }
export default function useAcademicBridge(user, catalogId) {
  const [state, setState] = useState({ user: null, context: waiting })
  const [attempt, setAttempt] = useState(0)
  const repository = useMemo(() => user ? academicBridgeRepository({ db, auth }, user.uid) : null, [user])
  const lifecycle = useMemo(() => user ? careerLifecycleRepository({ db, auth }, user.uid, careers) : null, [user])
  useEffect(() => {
    if (!repository) return
    let alive = true
    setState({ user, context: waiting })
    const stop = repository.subscribeContext(context => { if (alive) setState({ user, context }) }, () => {
      if (alive) setState({ user, context: { ...waiting, authority: 'invalid' } })
    })
    return () => { alive = false; stop() }
  }, [repository, user, attempt])
  const context = state.user === user ? state.context : waiting
  const scope = academicScope(context, catalogId), nextKey = academicScopeKey(scope)
  const latest = useRef(context); latest.current = context
  const source = useMemo(() => {
    if (!scope) return null
    const allowed = () => auth.currentUser === user && latest.current.authority === scope.model && latest.current.capabilities.academicWrite
    return { scope, key: nextKey,
      load: () => scope.model === 'legacy' ? loadUserStatus(user.uid, scope.id).then(statusMap => ({ statusMap, revision: null })) : repository.loadProgress(scope),
      subscribe: (onData, onError) => scope.model === 'legacy' ? subscribeUserStatus(user.uid, scope.id, statusMap => onData({ statusMap, revision: null }), onError)
        : repository.subscribeProgress(scope, onData, onError),
      async save(map, expected) {
        if (!allowed()) throw new Error('ACADEMIC_AUTHORITY_CHANGED')
        return scope.model === 'legacy' ? saveUserStatus(user.uid, scope.id, map).then(() => null) : repository.saveProgress(scope, map, expected)
      },
      projection: () => scope.model === 'legacy' ? projectionRepository(user.uid, scope.id) : repository.projection(scope),
    }
  }, [nextKey, repository, user])
  const retained = useRef(null)
  if (source) retained.current = { user, source }
  const shownSource = (['frozen', 'invalid', 'loading'].includes(context.authority) || context.phase === 'blocked')
    && retained.current?.user === user ? retained.current.source : source
  return { ...context, repository, lifecycle, scope: shownSource?.scope ?? null, source: shownSource, key: shownSource?.key ?? null, retry: () => setAttempt(n => n + 1),
    canWrite: () => latest.current.capabilities.academicWrite,
    projectionRepository: shownSource?.projection ?? null }
}
