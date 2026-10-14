import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { finalGradeScope, finalGradePath, decodeFinalGrade, buildFinalGrade } from '../finalGradeLogic'
import { resolveUserDataAuthority } from '../userDataAuthorityLogic'

export function finalGradesRepository({ db, auth }, scope, subjects, assertLive = () => {}) {
  const captured = { ...scope }, path = finalGradeScope(captured), user = auth.currentUser
  const codes = new Set(subjects.map(subject => subject.code))
  const check = () => {
    if (!user || auth.currentUser !== user || user.uid !== captured.uid) throw Error('GRADE_SESSION_CHANGED')
    assertLive()
  }
  const progress = captured.model === 'legacy'
    ? `users/${captured.uid}/careers/${captured.id}`
    : `users/${captured.uid}/careerInstances/${captured.id}/academic/progress`
  check()
  return {
    subscribe(onData, onError) {
      check()
      return onSnapshot(collection(db, path), { includeMetadataChanges: true }, snap => {
        if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) return
        try {
          check()
          const grades = Object.fromEntries(snap.docs.map(row => [row.id, decodeFinalGrade(row.data())]))
          onData(grades)
        } catch (error) { onError(error) }
      }, onError)
    },
    async save(code, grade, expectedRevision) {
      check()
      if (!codes.has(code)) throw Error('UNKNOWN_GRADE_SUBJECT')
      const target = doc(db, finalGradePath(captured, code))
      // Validate before I/O. Original expected revision is never rebased.
      buildFinalGrade(grade, expectedRevision, null)
      await runTransaction(db, async tx => {
        check()
        const control = await tx.get(doc(db, 'migrationUsers', captured.uid))
        const authority = resolveUserDataAuthority(captured.uid, control.exists() ? control.data() : null)
        if (authority.authority !== captured.model || !authority.capabilities.academicWrite) throw Error('GRADE_AUTHORITY_CHANGED')
        if (captured.model === 'instances') {
          const metadata = await tx.get(doc(db, 'users', captured.uid, 'careerInstances', captured.id))
          if (metadata.data()?.schemaVersion !== 1 || metadata.data()?.lifecycle !== 'active' || metadata.data()?.catalogId !== captured.catalogId) throw Error('GRADE_INSTANCE_UNAVAILABLE')
          const membership = await tx.get(doc(db, 'users', captured.uid, 'catalogMemberships', captured.catalogId))
          if (membership.data()?.careerInstanceId !== captured.id) throw Error('GRADE_INSTANCE_UNAVAILABLE')
        }
        const currentProgress = await tx.get(doc(db, progress))
        if (grade !== null && currentProgress.data()?.statusMap?.[code] !== 'Aprobada') throw Error('GRADE_REQUIRES_APPROVED')
        const existing = await tx.get(target)
        const previous = existing.exists() ? decodeFinalGrade(existing.data()) : null
        if ((previous?.revision ?? null) !== expectedRevision) throw Error('GRADE_CONFLICT')
        check()
        if (grade === null && !previous) return
        tx.set(target, buildFinalGrade(grade, expectedRevision, serverTimestamp()))
      })
      check()
    },
  }
}
