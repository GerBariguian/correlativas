import { useEffect, useMemo, useRef, useState } from 'react'
import { auth, db } from '../firebase'
import { academicBridgeRepository } from '../services/academicBridge'
import { academicScope, academicScopeKey } from '../userDataAuthorityLogic'
import { loadLegacyProgress, subscribeLegacyProgress, saveUserStatus } from '../services/firestore'
import { projectionRepository } from '../services/careerProjections'
import { careerLifecycleRepository } from '../services/careerLifecycle'
import { careers } from '../data/careers'
import { createAcademicOnboardingController } from '../academicOnboardingController'
import { legacyOnboardingRepository } from '../services/academicOnboarding'

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
  const onboardingEpoch = useRef({ signature: null, user: null, generation: 0 })
  const signature = JSON.stringify([scope, context.authority, context.phase, context.capabilities.academicWrite])
  if (onboardingEpoch.current.signature !== signature || onboardingEpoch.current.user !== user) {
    onboardingEpoch.current = { signature, user, generation: onboardingEpoch.current.generation + 1 }
  }
  useEffect(() => () => { onboardingEpoch.current.generation++ }, [])
  const source = useMemo(() => {
    if (!scope) return null
    const allowed = () => auth.currentUser === user && latest.current.authority === scope.model && latest.current.capabilities.academicWrite
    const generation = onboardingEpoch.current.generation
    const assertCurrent = () => {
      if (!allowed() || onboardingEpoch.current.generation !== generation) throw new Error('ACADEMIC_SCOPE_CHANGED')
    }
    return { scope, key: nextKey,
      createOnboarding() {
        const generation = onboardingEpoch.current.generation
        const assertLive = () => {
          if (!allowed() || onboardingEpoch.current.generation !== generation
            || JSON.stringify(academicScope(latest.current, catalogId)) !== JSON.stringify(scope)
            || onboardingEpoch.current.signature !== signature) throw new Error('ACADEMIC_SCOPE_CHANGED')
        }
        assertLive()
        const career = careers.find(item => item.id === scope.catalogId)
        if (!career) throw new Error('INVALID_ACADEMIC_SCOPE')
        const legacy = scope.model === 'legacy' ? legacyOnboardingRepository({ db, auth }, scope, career, assertLive) : null
        return createAcademicOnboardingController({ scope, subjects: career.subjects, assertLive,
          load: () => legacy ? legacy.load() : repository.loadProgress(scope),
          save: (changes, revision) => legacy ? legacy.save(changes)
            : repository.saveOnboardingProgress(scope, changes, revision, assertLive) })
      },
      load: () => scope.model === 'legacy' ? loadLegacyProgress(user.uid, scope.id).then(document => ({ statusMap: document.exists ? document.statusMap : null, revision: document })) : repository.loadProgress(scope),
      subscribe: (onData, onError) => scope.model === 'legacy' ? subscribeLegacyProgress(user.uid, scope.id, document => onData({ statusMap: document.exists ? document.statusMap : null, revision: document }), onError)
        : repository.subscribeProgress(scope, onData, onError),
      async save(map, expected) {
        if (!allowed()) throw new Error('ACADEMIC_AUTHORITY_CHANGED')
        if (scope.model !== 'legacy') return repository.saveProgress(scope, map, expected)
        assertCurrent()
        const result = await saveUserStatus(user.uid, scope.id, map, assertCurrent)
        assertCurrent()
        return result
      },
      projection: () => scope.model === 'legacy' ? projectionRepository(user.uid, scope.id) : repository.projection(scope),
    }
  }, [nextKey, scope?.catalogId, signature, repository, user])
  const retained = useRef(null)
  if (source) retained.current = { user, source }
  const shownSource = (['frozen', 'invalid', 'loading'].includes(context.authority) || context.phase === 'blocked')
    && retained.current?.user === user ? retained.current.source : source
  return { ...context, repository, lifecycle, scope: shownSource?.scope ?? null, source: shownSource, key: shownSource?.key ?? null, retry: () => setAttempt(n => n + 1),
    canWrite: () => latest.current.capabilities.academicWrite,
    projectionRepository: shownSource?.projection ?? null }
}
