// Temporary bridge. Only a genuinely absent control permits legacy fallback.
export function resolveUserDataAuthority(uid, control, profile = null, instances = []) {
  const denied = { uid, authority: 'invalid', phase: null, origin: null, activeCareerInstanceId: null,
    catalogId: null, capabilities: { academicWrite: false, legacySocial: false, select: false }, instances: [] }
  const phases = { legacy: ['pending', 'blocked'], frozen: ['copying', 'validated', 'blocked'], instances: ['complete', 'blocked'] }
  const keys = ['schemaVersion', 'generation', 'authority', 'phase', 'origin', 'manifestId', 'updatedAt']
  if (control !== null && (!control || Object.keys(control).length !== keys.length
    || !keys.every(key => Object.hasOwn(control, key)) || control.schemaVersion !== 1
    || control.generation !== 'multicareer-v1' || !Object.hasOwn(phases, control.authority) || !phases[control.authority].includes(control.phase)
    || !['legacy', 'new'].includes(control.origin) || control.manifestId !== uid
    || !Number.isInteger(control.updatedAt?.seconds) || !Number.isInteger(control.updatedAt?.nanoseconds)
    || control.updatedAt.nanoseconds < 0 || control.updatedAt.nanoseconds >= 1000000000)) return denied
  const authority = control?.authority ?? 'legacy', phase = control?.phase ?? 'pending'
  const writable = phase !== 'blocked' && authority !== 'frozen'
  const owned = instances.filter(i => i.uid === uid)
  const selected = authority === 'instances' ? owned.find(i => i.careerInstanceId === profile?.activeCareerInstanceId && i.lifecycle === 'active') : null
  return { uid, authority, phase, origin: control?.origin ?? 'legacy',
    activeCareerInstanceId: selected?.careerInstanceId ?? null,
    catalogId: authority === 'legacy' ? profile?.activeCareerId ?? null : selected?.catalogId ?? null,
    instances: owned, capabilities: { academicWrite: writable, select: writable, legacySocial: writable && authority === 'legacy' } }
}

export function academicScope(context, catalogId) {
  if (!context.capabilities.academicWrite) return null
  if (context.authority === 'instances') return context.activeCareerInstanceId
    ? { uid: context.uid, model: 'instances', id: context.activeCareerInstanceId, catalogId: context.catalogId } : null
  return context.authority === 'legacy' && catalogId ? { uid: context.uid, model: 'legacy', id: catalogId, catalogId } : null
}
export function academicScopeKey(scope) {
  return scope ? `${scope.uid}:${scope.model}:${scope.id}` : null
}
