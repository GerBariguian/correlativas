import { subjects } from '../../src/data/utn/sistemas2023'

export const catalog = subjects
export const subjectCode = n => `UTN-ISI23-${String(n).padStart(2, '0')}`
export const approvedNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 13, 14, 16]
export const makeStatus = () => Object.fromEntries([
  ...approvedNumbers.map(n => [subjectCode(n), 'Aprobada']),
  ...[19, 20].map(n => [subjectCode(n), 'Regularizada']),
  ...[15, 17, 23].map(n => [subjectCode(n), 'Cursando']),
])
export const makeGrades = () => Object.fromEntries(approvedNumbers.map((n, i) => [subjectCode(n), [8, 9, 7, 9, 8, 10, 8, 7, 9, 8, 9, 8, 9][i]]))
export const friends = [
  { id: 'lucia', name: 'Lucía Fernández', initials: 'LF', color: 'lavender', detail: 'Sistemas · UTN', progress: 39 },
  { id: 'tomas', name: 'Tomás Rodríguez', initials: 'TR', color: 'peach', detail: 'Sistemas · UTN', progress: 32 },
  { id: 'martina', name: 'Martina López', initials: 'ML', color: 'mint', detail: 'Sistemas · UTN', progress: 45 },
]
export const groups = [
  { id: 'bd', title: 'Sale ese final de Bases de Datos', subject: 19, members: 4, membership: 'invited', detail: 'Repaso de consultas y normalización', initials: 'BD', color: 'lavender' },
  { id: 'ds', title: 'Desarrollo de Software', subject: 20, members: 3, membership: 'member', detail: 'Un paso más cerca del final', initials: 'DS', color: 'mint' },
]
export const makeJoined = () => groups.filter(group => group.membership === 'member').map(group => group.id)
export const notifications = [
  { id: 1, title: 'Lucía te invitó a estudiar', detail: 'Sale ese final de Bases de Datos', time: 'Hace 5 min · ficticio', target: 'group', group: 'bd' },
  { id: 2, title: 'Un nuevo compañero de carrera', detail: 'Tomás aceptó tu solicitud de amistad.', time: 'Hace 1 h · ficticio', target: 'friends', friend: 'tomas' },
  { id: 3, title: 'Tu próximo paso', detail: 'Tenés finales habilitados. Mirá cuáles podés preparar.', time: 'Hoy · ficticio', target: 'finals' },
]
