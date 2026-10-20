import { resolveUserDataAuthority } from '../../src/userDataAuthorityLogic.js'
import { decodeCareerMetadata, validateCareerPersistenceId } from '../../src/careerInstancePersistenceLogic.js'
import { onboardingScopeKey } from '../../src/academicOnboardingLogic.js'

// All capabilities are injected. No Firebase initialization, cache or writes.
export function academicReadRepository({ uid, currentUid, readDocument, loadProgress, assertLive = () => {} }) {
  validateCareerPersistenceId(uid)
  const check = () => { assertLive(); if (currentUid() !== uid) throw Error('C2_SESSION_CHANGED') }
  const read = async path => { check(); const data = await readDocument(path); check(); return data }
  return Object.freeze({
    async readProgress(input) {
      let scope
      try {
        onboardingScopeKey(input)
        scope = Object.freeze({ ...input })
        for (const key of ['uid', 'id', 'catalogId']) validateCareerPersistenceId(scope[key])
        check()
        if (scope.uid !== uid) return { state: 'blocked', scope, reason: 'OWNER_MISMATCH' }
        const control = await read(`migrationUsers/${uid}`)
        const authority = resolveUserDataAuthority(uid, control)
        if (authority.authority !== scope.model || authority.phase === 'blocked' || !authority.capabilities.academicWrite)
          return { state: 'blocked', scope, reason: 'AUTHORITY_UNAVAILABLE' }
        if (scope.model === 'instances') {
          const data = await read(`users/${uid}/careerInstances/${scope.id}`)
          if (data === null) return { state: 'absent', scope, reason: 'INSTANCE_MISSING' }
          const { instance } = decodeCareerMetadata(uid, scope.id, data)
          if (instance.catalogId !== scope.catalogId) return { state: 'blocked', scope, reason: 'CATALOG_MISMATCH' }
          if (instance.lifecycle === 'archived') return { state: 'archived', scope }
        }
        check()
        const progress = await loadProgress(scope)
        check()
        // Revalidate authority and lifecycle after the academic read. Never publish stale data.
        const after = await read(`migrationUsers/${uid}`)
        if (JSON.stringify(after) !== JSON.stringify(control)) return { state: 'blocked', scope, reason: 'AUTHORITY_CHANGED' }
        if (scope.model === 'instances') {
          const afterMetadata = await read(`users/${uid}/careerInstances/${scope.id}`)
          if (afterMetadata === null) return { state: 'absent', scope, reason: 'INSTANCE_MISSING' }
          const { instance } = decodeCareerMetadata(uid, scope.id, afterMetadata)
          if (instance.catalogId !== scope.catalogId) return { state: 'blocked', scope, reason: 'CATALOG_MISMATCH' }
          if (instance.lifecycle === 'archived') return { state: 'archived', scope }
        }
        check()
        return progress.statusMap === null ? { state: 'absent', scope, reason: 'PROGRESS_MISSING' }
          : { state: 'loaded', scope, progress: structuredClone(progress) }
      } catch (error) {
        return { state: 'error', scope: scope ?? null, code: error.code ?? error.message ?? 'READ_FAILED' }
      }
    },
  })
}
