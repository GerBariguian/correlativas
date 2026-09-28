import { collection, doc, onSnapshot, getDocFromServer, runTransaction, serverTimestamp } from 'firebase/firestore'
import { resolveUserDataAuthority } from '../userDataAuthorityLogic'
import { decodeCareerMetadata } from '../careerInstancePersistenceLogic'
import { validateCareerInstances } from '../careerInstanceLogic'
import { decodeProjection, encodeProjectionScenario } from '../projectionPersistenceLogic'

// Injected Firebase context: no initialization, migration, ID allocation or remote fallback.
export function academicBridgeRepository({ db, auth }, uid) {
  const user = auth.currentUser
  const check = () => { if (!user || user.uid !== uid || auth.currentUser !== user) throw new Error('ACADEMIC_SESSION_CHANGED') }
  const controlRef = doc(db, 'migrationUsers', uid), profileRef = doc(db, 'users', uid)
  const metadataRef = id => doc(db, 'users', uid, 'careerInstances', id)
  const path = (scope, kind) => {
    if (scope.uid !== uid || scope.model !== 'instances' || !/^[A-Za-z0-9_-]{1,100}$/.test(scope.id)) throw new Error('INVALID_ACADEMIC_SCOPE')
    return doc(db, 'users', uid, 'careerInstances', scope.id, kind === 'progress' ? 'academic' : 'planning', kind)
  }
  const guard = async (tx, scope) => {
    check()
    const control = await tx.get(controlRef)
    const context = resolveUserDataAuthority(uid, control.exists() ? control.data() : null)
    if (context.authority !== 'instances' || !context.capabilities.academicWrite) throw new Error('ACADEMIC_AUTHORITY_CHANGED')
    const metadata = await tx.get(metadataRef(scope.id))
    const instance = metadata.exists() ? decodeCareerMetadata(uid, scope.id, metadata.data()).instance : null
    if (!instance || instance.lifecycle !== 'active' || instance.catalogId !== scope.catalogId) throw new Error('ACADEMIC_INSTANCE_UNAVAILABLE')
    check()
  }
  const decodeProgress = snap => {
    if (!snap.exists()) return { statusMap: null, revision: null }
    const d = snap.data()
    if (d.schemaVersion !== 1 || !Number.isSafeInteger(d.revision) || d.revision < 1
      || !d.statusMap || Array.isArray(d.statusMap) || typeof d.statusMap !== 'object'
      || Object.values(d.statusMap).some(value => !['Pendiente', 'Cursando', 'Regularizada', 'Aprobada'].includes(value))
      || !Number.isInteger(d.updatedAt?.seconds) || !Number.isInteger(d.updatedAt?.nanoseconds)
      || Object.keys(d).sort().join() !== 'revision,schemaVersion,statusMap,updatedAt') throw new Error('INVALID_ACADEMIC_PROGRESS')
    return { statusMap: d.statusMap, revision: d.revision }
  }
  const decodeInstanceProjection = (snap, scope) => {
    if (!snap.exists()) return null
    const d = snap.data()
    if (d.schemaVersion !== 3 || Object.keys(d).sort().join() !== 'revisionToken,scenario,schemaVersion,updatedAt') throw new Error('INCOMPATIBLE_PROJECTION_VERSION')
    return decodeProjection({ ...d, schemaVersion: 2, careerId: scope.catalogId }, scope.catalogId)
  }
  return {
    subscribeContext(onData, onError) {
      check()
      let alive = true, failed = false, generation = 0, controlReady = false, profileReady = false, control = null, profile = null
      let stopInstances = () => {}, instanceRows = null
      const emit = async () => {
        if (!controlReady || !profileReady || !alive || failed) return
        const token = ++generation
        try {
          check()
          const base = resolveUserDataAuthority(uid, control, profile)
          if (base.authority === 'instances' && instanceRows === null) return
          const rows = base.authority === 'instances' ? instanceRows : []
          if (alive && token === generation) onData(resolveUserDataAuthority(uid, control, profile, rows))
        } catch (error) { if (alive) onError(error) }
      }
      const fail = error => { failed = true; generation++; if (alive) onError(error) }
      const stopControl = onSnapshot(controlRef, { includeMetadataChanges: true }, snap => {
        if (!alive || failed) return
        if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) {
          controlReady = false
          if (alive) onData(resolveUserDataAuthority(uid, undefined))
          return
        }
        control = snap.exists() ? snap.data() : null; controlReady = true
        const context = resolveUserDataAuthority(uid, control)
        stopInstances(); stopInstances = () => {}; instanceRows = null
        if (context.authority === 'instances') {
          // Publish suspension before resolving a new source; never expose stale legacy capabilities.
          onData({ ...context, catalogId: null, activeCareerInstanceId: null, capabilities: { academicWrite: false, select: false, legacySocial: false } })
          stopInstances = onSnapshot(collection(db, 'users', uid, 'careerInstances'), { includeMetadataChanges: true }, rows => {
            if (rows.metadata.fromCache || rows.metadata.hasPendingWrites) return
            try {
              instanceRows = rows.docs.map(row => decodeCareerMetadata(uid, row.id, row.data()).instance)
              validateCareerInstances(uid, instanceRows); emit()
            } catch (error) { fail(error) }
          }, fail)
        }
        emit()
      }, fail)
      const stopProfile = onSnapshot(profileRef, { includeMetadataChanges: true }, snap => {
        if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) return
        profile = snap.exists() ? snap.data() : null; profileReady = true; emit()
      }, fail)
      return () => { alive = false; generation++; stopControl(); stopProfile(); stopInstances() }
    },
    async selectInstance(id) {
      await runTransaction(db, async tx => {
        check()
        const control = await tx.get(controlRef)
        const context = resolveUserDataAuthority(uid, control.exists() ? control.data() : null)
        if (context.authority !== 'instances' || !context.capabilities.select) throw new Error('ACADEMIC_AUTHORITY_CHANGED')
        if (id !== null) {
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error('INVALID_ACADEMIC_SCOPE')
          const snap = await tx.get(metadataRef(id))
          if (!snap.exists() || decodeCareerMetadata(uid, id, snap.data()).instance.lifecycle !== 'active') throw new Error('ACADEMIC_INSTANCE_UNAVAILABLE')
        }
        check(); tx.update(profileRef, { activeCareerInstanceId: id, updatedAt: serverTimestamp() })
      })
    },
    subscribeProgress(scope, onData, onError) {
      check()
      return onSnapshot(path(scope, 'progress'), { includeMetadataChanges: true }, snap => {
        if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) return
        try { check(); onData(decodeProgress(snap)) } catch (error) { onError(error) }
      }, onError)
    },
    async loadProgress(scope) {
      check(); const snap = await getDocFromServer(path(scope, 'progress')); check(); return decodeProgress(snap)
    },
    async saveProgress(scope, statusMap, expected) {
      const target = path(scope, 'progress')
      return runTransaction(db, async tx => {
        await guard(tx, scope)
        const previous = decodeProgress(await tx.get(target))
        if (previous.revision !== expected) throw new Error('ACADEMIC_PROGRESS_CONFLICT')
        const revision = (expected ?? 0) + 1
        if (!Number.isSafeInteger(revision)) throw new Error('ACADEMIC_PROGRESS_CONFLICT')
        check(); tx.set(target, { schemaVersion: 1, statusMap, revision, updatedAt: serverTimestamp() })
        return revision
      })
    },
    projection(scope) {
      const target = path(scope, 'projection')
      const mutate = async (scenario, expected, isLive) => {
        const revisionToken = crypto.randomUUID()
        await runTransaction(db, async tx => {
          await guard(tx, scope)
          const previous = decodeInstanceProjection(await tx.get(target), scope)
          if ((previous?.revisionToken ?? null) !== expected) throw new Error('PROJECTION_CONFLICT')
          check(); if (!isLive()) throw new Error('PROJECTION_SESSION_CHANGED')
          if (scenario === null) { if (previous) tx.delete(target) }
          else tx.set(target, { schemaVersion: 3, revisionToken, scenario: encodeProjectionScenario(scenario), updatedAt: serverTimestamp() })
        })
        check(); return revisionToken
      }
      return {
        async load() { check(); const snap = await getDocFromServer(target); check(); return decodeInstanceProjection(snap, scope) },
        save: (scenario, expected, isLive = () => true) => mutate(scenario, expected, isLive),
        reset: (expected, isLive = () => true) => mutate(null, expected, isLive),
      }
    },
  }
}
