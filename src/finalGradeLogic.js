const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 100 && !/[\/\u0000-\u001f]/.test(value) && !['.', '..'].includes(value)

export function finalGradeScope(scope) {
  if (!scope || !validId(scope.uid) || !validId(scope.id) || !validId(scope.catalogId)
    || !['legacy', 'instances'].includes(scope.model) || (scope.model === 'legacy' && scope.id !== scope.catalogId)) throw Error('INVALID_GRADE_SCOPE')
  return `users/${scope.uid}/${scope.model === 'legacy' ? 'careers' : 'careerInstances'}/${scope.id}/finalGrades`
}

export function finalGradePath(scope, code) {
  if (!validId(code)) throw Error('INVALID_SUBJECT_CODE')
  return `${finalGradeScope(scope)}/${code}`
}

export function validateFinalGrade(grade) {
  if (grade !== null && (!Number.isInteger(grade) || grade < 1 || grade > 10)) throw Error('INVALID_FINAL_GRADE')
  return grade
}

export function decodeFinalGrade(data) {
  if (!data || Object.keys(data).sort().join() !== 'grade,revision,schemaVersion,updatedAt' || data.schemaVersion !== 1
    || !Number.isSafeInteger(data.revision) || data.revision < 1
    || !Number.isInteger(data.updatedAt?.seconds) || !Number.isInteger(data.updatedAt?.nanoseconds)
    || data.updatedAt.nanoseconds < 0 || data.updatedAt.nanoseconds >= 1000000000) throw Error('INVALID_FINAL_GRADE_DOCUMENT')
  validateFinalGrade(data.grade)
  return { ...data }
}

export function buildFinalGrade(grade, expectedRevision, updatedAt) {
  validateFinalGrade(grade)
  if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) throw Error('INVALID_GRADE_REVISION')
  const revision = (expectedRevision ?? 0) + 1
  if (!Number.isSafeInteger(revision)) throw Error('GRADE_REVISION_EXHAUSTED')
  return { schemaVersion: 1, grade, revision, updatedAt }
}

export function finalGradeSummary(subjects, statusMap, grades) {
  let approved = 0, graded = 0, sum = 0
  for (const code of new Set(subjects.map(subject => subject.code))) {
    if (statusMap[code] !== 'Aprobada') continue
    approved++
    const grade = grades[code]?.grade
    if (grade == null) continue
    validateFinalGrade(grade); graded++; sum += grade
  }
  return { approved, graded, average: graded ? sum / graded : null }
}
