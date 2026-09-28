import { collection, doc, getDocFromServer, getDocsFromServer, runTransaction, serverTimestamp } from 'firebase/firestore'
import { validateCareerInstances } from '../careerInstanceLogic.js'
import { resolveUserDataAuthority } from '../userDataAuthorityLogic.js'
import { careerPersistenceError, validateCareerPersistenceId, mapCareerPersistenceError, decodeCareerMetadata, decodeCatalogMembership } from '../careerInstancePersistenceLogic.js'

// Deliberately no import of ../firebase: nothing initializes or connects at import.
// Caller supplies authenticated context; App uses the product lifecycle facade.
export function careerInstancesRepository({ db, auth }, uid, product = null) {
  if (typeof uid !== 'string' || !uid || /[\s/\x00-\x1f\x7f]/.test(uid)) throw careerPersistenceError('INVALID_INPUT')
  const user = auth.currentUser
  const check = () => { if (!user || user.uid !== uid || auth.currentUser !== user) throw careerPersistenceError('CAREER_SESSION_CHANGED') }
  check()
  const instances = collection(db, 'users', uid, 'careerInstances')
  const ref = id => doc(instances, validateCareerPersistenceId(id))
  const membership = id => doc(db, 'users', uid, 'catalogMemberships', validateCareerPersistenceId(id))
  const safely = async operation => {
    try { check(); const result = await operation(); check(); return result }
    catch (error) { throw mapCareerPersistenceError(error) }
  }
  const decode = snapshot => decodeCareerMetadata(uid, snapshot.id, snapshot.data())
  const guardProduct = async tx => {
    if (!product) return null // Isolated metadata API retained for existing callers.
    check()
    const control = await tx.get(doc(db, 'migrationUsers', uid))
    const context = resolveUserDataAuthority(uid, control.exists() ? control.data() : null)
    if (context.authority !== 'instances' || !context.capabilities.academicWrite) throw careerPersistenceError('PERMISSION_DENIED')
    const profile = await tx.get(doc(db, 'users', uid))
    if (!profile.exists() || profile.data().schemaVersion !== 2) throw careerPersistenceError('INVALID_CAREER_DOCUMENT')
    check()
    return profile.data()
  }
  const metadataLifecycle = (id, lifecycle) => safely(async () => {
    const target = ref(id)
    await runTransaction(db, async tx => {
      check()
      const profile = await guardProduct(tx)
      const snapshot = await tx.get(target)
      check()
      if (!snapshot.exists()) throw careerPersistenceError('CAREER_INSTANCE_NOT_FOUND')
      const current = decode(snapshot)
      const index = await tx.get(membership(current.instance.catalogId))
      check()
      if (!index.exists() || decodeCatalogMembership(index.data()) !== id) throw careerPersistenceError('INVALID_CAREER_DOCUMENT')
      if (current.instance.lifecycle === lifecycle) return
      if (product && lifecycle === 'archived' && profile.activeCareerInstanceId === id) {
        tx.update(doc(db, 'users', uid), { activeCareerInstanceId: null, updatedAt: serverTimestamp() })
      }
      tx.update(target, { lifecycle, archivedAt: lifecycle === 'archived' ? serverTimestamp() : null, updatedAt: serverTimestamp() })
    })
    return id
  })
  return {
    create: catalogId => safely(async () => {
      if (product && !product.catalogs.some(catalog => catalog.id === catalogId)) throw careerPersistenceError('INVALID_INPUT')
      const index = membership(catalogId)
      const target = doc(instances) // Local opaque auto-ID; no standalone write.
      if (target.id === catalogId) throw careerPersistenceError('PERSISTENCE_CONFLICT')
      try {
        await runTransaction(db, async tx => {
          check()
          await guardProduct(tx)
          const existing = await tx.get(index)
          check()
          if (existing.exists()) { decodeCatalogMembership(existing.data()); throw careerPersistenceError('DUPLICATE_CATALOG_INSTANCE') }
          tx.set(target, { schemaVersion: 1, catalogId, lifecycle: 'active',
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(), archivedAt: null })
          tx.set(index, { schemaVersion: 1, careerInstanceId: target.id })
        })
      } catch (error) {
        // Rules can observe the winner before the SDK retries the losing transaction.
        // Reconcile read-only; never disguise a denial as success or weaken the rules.
        check()
        if (error?.code === 'permission-denied') {
          let winner = null
          try {
            winner = await runTransaction(db, async tx => {
              check()
              const indexSnapshot = await tx.get(index)
              if (!indexSnapshot.exists()) return null
              const winnerId = decodeCatalogMembership(indexSnapshot.data())
              const snapshot = await tx.get(ref(winnerId))
              check()
              if (!snapshot.exists()) return null
              const result = decode(snapshot)
              return result.instance.catalogId === catalogId ? winnerId : null
            })
          } catch { /* Preserve original denial unless a coherent winner is proven. */ }
          check()
          if (winner && winner !== target.id) throw careerPersistenceError('DUPLICATE_CATALOG_INSTANCE')
        }
        throw error
      }
      return target.id
    }),
    get: id => safely(async () => {
      const snapshot = await getDocFromServer(ref(id))
      return snapshot.exists() ? decode(snapshot) : null
    }),
    list: () => safely(async () => {
      const snapshot = await getDocsFromServer(instances)
      const rows = snapshot.docs.map(decode)
      validateCareerInstances(uid, rows.map(row => row.instance))
      return rows
    }),
    getByCatalog: catalogId => safely(async () => {
      // A transaction gives a coherent pair, rather than trusting cache or a dangling index.
      return runTransaction(db, async tx => {
        check()
        const index = await tx.get(membership(catalogId))
        if (!index.exists()) return null
        const snapshot = await tx.get(ref(decodeCatalogMembership(index.data())))
        check()
        if (!snapshot.exists()) throw careerPersistenceError('INVALID_CAREER_DOCUMENT')
        const result = decode(snapshot)
        if (result.instance.catalogId !== catalogId) throw careerPersistenceError('INVALID_CAREER_DOCUMENT')
        return result
      })
    }),
    archiveMetadata: id => metadataLifecycle(id, 'archived'),
    restoreMetadata: id => metadataLifecycle(id, 'active'),
  }
}
