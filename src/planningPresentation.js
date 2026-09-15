import { compareParticipants } from './planningLogic'

export const academicMessages = {
  loading: 'Cargando información...', disabled: 'Progreso no compartido',
  incompatible: 'Otra carrera o plan', stale: 'Información no actualizada',
  unavailable: 'Información no disponible', unrelated: 'Progreso no compartido con vos',
}
export function comparisonLabel(row, layer) {
  const verb = { approved: 'aprobaron', available: 'pueden cursarla', finals: 'tienen final pendiente' }[layer]
  return `${row.all ? 'Todos · ' : ''}${row.matches.length}/${row.total} ${verb}`
}
export function groupCourseChoices(subjects, people, search = '') {
  const query = search.trim().toLocaleLowerCase('es-AR')
  const rows = compareParticipants(subjects, people, 'available')
    .filter((row) => `${row.subject.code} ${row.subject.name}`.toLocaleLowerCase('es-AR').includes(query))
  return [
    { label: 'Todos pueden cursarla', rows: rows.filter((row) => row.all) },
    { label: 'Coinciden dos o más', rows: rows.filter((row) => !row.all && row.matches.length >= 2) },
    { label: 'Otras materias', rows: rows.filter((row) => !row.all && row.matches.length < 2) },
  ]
}
export function coursePeople(plan, code, ids, people) {
  const active = [plan.ownerId, ...plan.inviteeIds]
  return ids.map((uid) => {
    const person = people.find((p) => p.uid === uid)
    const membership = !active.includes(uid) ? 'Ya no participa' : !plan.memberIds.includes(uid) ? 'Invitación pendiente' : 'Miembro'
    const state = !active.includes(uid) ? 'departed' : person?.state || 'unavailable'
    const known = state === 'ready' && Array.isArray(person?.snapshot?.availableToCourseCodes)
    return { uid, membership, known, eligible: known && person.snapshot.availableToCourseCodes.includes(code),
      label: state === 'departed' ? 'Ya no participa' : known ? person.snapshot.availableToCourseCodes.includes(code) ? 'Puede cursarla' : 'Ya no figura como habilitada' : academicMessages[state] || 'Información no disponible' }
  })
}
export function initialPlannedIds(plan, existing, matchingIds = []) {
  const active = [plan.ownerId, ...plan.inviteeIds]
  return [...new Set(existing ? existing.proposedParticipantIds : matchingIds)].filter((uid) => active.includes(uid))
}
