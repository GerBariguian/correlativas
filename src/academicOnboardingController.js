import { createOnboardingDraft, prepareOnboardingChanges, mergeOnboardingChanges, onboardingScopeKey } from './academicOnboardingLogic'

// One controller per Bridge source/session. Nothing persists until confirm().
export function createAcademicOnboardingController({ scope, subjects, load, save, assertLive }) {
  let phase = 'idle', baseline = null, revision = null
  return {
    getPhase: () => phase,
    async load() {
      if (phase === 'loading' || phase === 'saving') throw new Error('ONBOARDING_BUSY')
      assertLive(); phase = 'loading'; baseline = null
      try {
        const progress = await load()
        assertLive()
        const draft = createOnboardingDraft({ scope, subjects, progress: { state: 'loaded', statusMap: progress.statusMap } })
        if (scope.model === 'instances' && progress.revision !== null
          && (!Number.isSafeInteger(progress.revision) || progress.revision < 1)) throw new Error('INVALID_ACADEMIC_PROGRESS')
        baseline = draft; revision = progress.revision; phase = 'ready'
        return draft
      } catch (error) { phase = 'error'; throw error }
    },
    async confirm(draft, choice = 'experienced') {
      if (phase === 'saving') throw new Error('ONBOARDING_BUSY')
      assertLive()
      if (phase !== 'ready' || !baseline) throw new Error('ONBOARDING_RELOAD_REQUIRED')
      if (onboardingScopeKey(draft.scope) !== onboardingScopeKey(scope)) throw new Error('ONBOARDING_SCOPE_MISMATCH')
      const changes = prepareOnboardingChanges(draft, choice)
      if (changes.entries.some(entry => !baseline.codes.includes(entry.code))) throw new Error('UNKNOWN_ONBOARDING_CODE')
      mergeOnboardingChanges(changes, scope, { state: 'loaded', statusMap: baseline.baseline })
      if (!changes.entries.length) return { saved: false }
      phase = 'saving'
      try {
        const progress = await save(changes, revision)
        assertLive(); phase = 'saved'
        return { saved: true, ...progress }
      } catch (error) {
        // Never retry a permission failure or ambiguous completion automatically.
        // Reload also prevents reusing a stale/possibly committed draft.
        phase = 'error'; throw error
      }
    },
  }
}

export function onboardingSaveError(error) {
  const code = error.code || error.message
  if (code === 'permission-denied') return { kind: 'permission', message: 'No tenés permiso para guardar. Actualizá el estado de la cuenta.' }
  if (/CONFLICT|RELOAD_REQUIRED/.test(code)) return { kind: 'conflict', message: 'El progreso cambió. Volvé a cargarlo antes de confirmar.' }
  if (/SESSION|AUTHORITY|SCOPE|INSTANCE_UNAVAILABLE/.test(code)) return { kind: 'context', message: 'La cuenta o carrera cambió o no está disponible. Volvé a cargar el onboarding.' }
  if (code === 'ONBOARDING_BUSY') return { kind: 'busy', message: 'Ya hay una operación en curso.' }
  return { kind: 'unavailable', message: 'No se pudo confirmar el guardado. Recargá el progreso antes de volver a intentar.' }
}
