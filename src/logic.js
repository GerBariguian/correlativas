export function getSubjectLevel(subject) {
  return subject.level ?? `${subject.year}° Año`
}

export const STATUS = ['Pendiente', 'Cursando', 'Regularizada', 'Aprobada']

export function getStatus(statusMap, code) {
  return statusMap[code] || 'Pendiente'
}

export function canCourse(subject, statusMap) {
  const regularizedPrereqs = subject.prereqs ?? []
  const approvedPrereqs = subject.approvedPrereqs ?? []

  const hasRegularizedPrereqs = regularizedPrereqs.every((code) =>
    isRegularized(statusMap, code)
  )

  const hasApprovedPrereqs = approvedPrereqs.every((code) =>
    isApproved(statusMap, code)
  )

  return hasRegularizedPrereqs && hasApprovedPrereqs
}

export function canTakeFinal(subject, statusMap, subjects = []) {
  const finalPrereqs = subject.finalPrereqs ?? subject.prereqs ?? []

  const requiresAllSubjects = finalPrereqs.includes('ALL')

  if (requiresAllSubjects) {
    return subjects
      .filter((item) => item.code !== subject.code)
      .filter((item) => !item.elective)
      .filter((item) => !item.excludeFromAllFinals)
      .every((item) => isApproved(statusMap, item.code))
  }

  return finalPrereqs.every((code) => isApproved(statusMap, code))
}

export function missingForCourse(subject, statusMap) {
  const missing = missingCoursePrereqs(subject, statusMap)

  return [
    ...missing.regularized,
    ...missing.approved,
  ]
}

export function missingForFinal(subject, statusMap, subjects = []) {
  return missingFinalPrereqs(subject, statusMap, subjects)
}

export function unlocks(subjects, code) {
  return subjects.filter((subject) => {
    const regularizedPrereqs = subject.prereqs ?? []
    const approvedPrereqs = subject.approvedPrereqs ?? []

    return (
      regularizedPrereqs.includes(code) ||
      approvedPrereqs.includes(code)
    )
  })
}

export function directBlockCount(subjects, code) {
  return unlocks(subjects, code).length
}

export function summary(subjects, statusMap) {
  const approved = subjects.filter((s) => getStatus(statusMap, s.code) === 'Aprobada').length
  const regularized = subjects.filter((s) => getStatus(statusMap, s.code) === 'Regularizada').length
  const taking = subjects.filter((s) => getStatus(statusMap, s.code) === 'Cursando').length
  const pending = subjects.filter((s) => getStatus(statusMap, s.code) === 'Pendiente').length

  return {
    total: subjects.length,
    approved,
    regularized,
    taking,
    pending,
    progress: Math.round((approved / subjects.length) * 100),
  }
}

export function availableToCourse(subjects, statusMap) {
  return subjects.filter((s) => getStatus(statusMap, s.code) === 'Pendiente' && canCourse(s, statusMap))
}

export function availableFinals(subjects, statusMap) {
  return subjects.filter((s) => getStatus(statusMap, s.code) === 'Regularizada' && canTakeFinal(s, statusMap, subjects))
}

export function blockedSubjects(subjects, statusMap) {
  return subjects.filter((s) => getStatus(statusMap, s.code) === 'Pendiente' && !canCourse(s, statusMap))
}

export function recommendations(subjects, statusMap) {
  const candidates = subjects
    .filter((subject) => getStatus(statusMap, subject.code) !== 'Aprobada')
    .map((subject) => {
      const directUnlocks = unlocks(subjects, subject.code)
      const unlocksCount = directUnlocks.length
      const isRegularized = getStatus(statusMap, subject.code) === 'Regularizada'
      const isPending = getStatus(statusMap, subject.code) === 'Pendiente'
      const isTaking = getStatus(statusMap, subject.code) === 'Cursando'
      const courseAvailable = canCourse(subject, statusMap)
      const finalAvailable = canTakeFinal(subject, statusMap, subjects)

      let score = unlocksCount * 20

      if (isRegularized) score += 60
      if (isTaking) score += 30
      if (isPending && courseAvailable) score += 20
      if (isRegularized && finalAvailable) score += 30
      if (subject.year <= 3) score += 10

      let type = 'Materia estratégica'
      let reason = `Desbloquea ${unlocksCount} materia(s) directa(s).`

      if (isRegularized) {
        type = 'Final pendiente'
        reason = finalAvailable
          ? 'Ya podés rendir este final. Conviene cerrarlo para evitar cuello de botella.'
          : 'Está regularizada, pero todavía puede depender de finales previos.'
      } else if (isTaking) {
        type = 'Cursando ahora'
        reason = `Si la aprobás, desbloquea ${unlocksCount} materia(s) directa(s).`
      } else if (isPending && courseAvailable) {
        type = 'Disponible para cursar'
        reason = `Podés cursarla ahora y desbloquea ${unlocksCount} materia(s) directa(s).`
      }

      return {
        type,
        title: subject.name,
        reason,
        score,
      }
    })

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
}

const APPROVED = 'Aprobada'
const REGULARIZED_STATUSES = ['Regularizada', 'Aprobada']

const isApproved = (statusMap, subjectCode) =>
  getStatus(statusMap, subjectCode) === APPROVED

const isRegularized = (statusMap, subjectCode) =>
  REGULARIZED_STATUSES.includes(getStatus(statusMap, subjectCode))

export function missingCoursePrereqs(subject, statusMap) {
  const missingRegularized = (subject.prereqs ?? []).filter(
    (code) => !isRegularized(statusMap, code)
  )

  const missingApproved = (subject.approvedPrereqs ?? []).filter(
    (code) => !isApproved(statusMap, code)
  )

  return {
    regularized: missingRegularized,
    approved: missingApproved,
  }
}

export function missingFinalPrereqs(subject, statusMap, subjects = []) {
  const finalPrereqs = subject.finalPrereqs ?? subject.prereqs ?? []

  if (finalPrereqs.includes('ALL')) {
    return subjects
      .filter((item) => item.code !== subject.code)
      .filter((item) => !item.elective)
      .filter((item) => !item.excludeFromAllFinals)
      .filter((item) => !isApproved(statusMap, item.code))
      .map((item) => item.code)
  }

  return finalPrereqs.filter((code) => !isApproved(statusMap, code))
}