// UTN Buenos Aires / FRBA, Ingeniería en Sistemas de Información, Ord. 1877.
// Levels, weekly teaching hours and modalities: plan grid supplied by the user.
// Prerequisites and official ordinal numbers: Correlativas-plan-2023.pdf.
// IDs below are application IDs based on those ordinals, not SIU/Guaraní codes.
// See docs/utn-sistemas-2023.md for source precedence and final-exam policy.
const codeOf = number => `UTN-ISI23-${String(number).padStart(2, '0')}`
// Nº, grid level, name, weekly hours, duration, regularized for course, approved.
const rows = [
  [1, 1, 'Análisis Matemático I', 5, 2, [], []],
  [2, 1, 'Álgebra y Geometría Analítica', 5, 2, [], []],
  [3, 1, 'Física I', 5, 2, [], []],
  [4, 2, 'Inglés I', 2, 2, [], []],
  [5, 1, 'Lógica y Estructuras Discretas', 3, 2, [], []],
  [6, 1, 'Algoritmos y Estructuras de Datos', 5, 2, [], []],
  [7, 1, 'Arquitectura de Computadoras', 4, 2, [], []],
  [8, 1, 'Sistemas y Procesos de Negocio', 3, 2, [], []],
  [9, 2, 'Análisis Matemático II', 5, 2, [1, 2], []],
  [10, 2, 'Física II', 5, 2, [1, 3], []],
  [11, 1, 'Ingeniería y Sociedad', 4, 1, [], []],
  [12, 3, 'Inglés II', 2, 2, [4], []],
  [13, 2, 'Sintaxis y Semántica de los Lenguajes', 4, 2, [5, 6], []],
  [14, 2, 'Paradigmas de Programación', 4, 2, [5, 6], []],
  [15, 2, 'Sistemas Operativos', 8, 1, [7], []],
  [16, 2, 'Análisis de Sistemas de Información', 6, 2, [6, 8], []],
  [17, 2, 'Probabilidad y Estadística', 6, 1, [1, 2], []],
  [18, 3, 'Economía', 6, 1, [], [1, 2]],
  [19, 3, 'Bases de Datos', 8, 1, [13, 16], [5, 6]],
  [20, 3, 'Desarrollo de Software', 8, 1, [14, 16], [5, 6]],
  [21, 3, 'Comunicación de Datos', 8, 1, [], [3, 7]],
  [22, 4, 'Análisis Numérico', 6, 1, [9], [1, 2]],
  [23, 3, 'Diseño de Sistemas de Información', 6, 2, [14, 16], [4, 6, 8]],
  [24, 4, 'Legislación', 4, 1, [11], []],
  [25, 4, 'Ingeniería y Calidad de Software', 6, 1, [19, 20, 23], [13, 14]],
  [26, 3, 'Redes de Datos', 8, 1, [15, 21], []],
  [27, 4, 'Investigación Operativa', 8, 1, [17, 22], []],
  [28, 4, 'Simulación', 6, 1, [17], [9]],
  [29, 4, 'Tecnologías para la Automatización', 6, 1, [10, 22], [9]],
  [30, 4, 'Administración de Sistemas de Información', 6, 2, [18, 23], [16]],
  [31, 5, 'Inteligencia Artificial', 6, 1, [28], [17, 22]],
  [32, 4, 'Ciencia de Datos', 6, 1, [28], [17, 19]],
  [33, 5, 'Sistemas de Gestión', 6, 1, [18, 27], [23]],
  [34, 5, 'Gestión Gerencial', 6, 1, [24, 30], [18]],
  [35, 5, 'Seguridad en los Sistemas de Información', 6, 1, [26, 30], [20, 21]],
  [36, 5, 'Proyecto Final', 6, 2, [25, 26, 30], [12, 20, 23]],
]
const electiveNames = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
const electives = electiveNames.map((name, index) => ({
  code: `UTN-ISI23-E${index + 1}`, name: `Electiva ${name}`,
  year: index === 0 ? 3 : index < 3 ? 4 : 5,
  term: 'Cuatrimestral', durationPeriods: 1,
  hours: 6, hoursUnit: 'horas cátedra semanales', elective: true,
  prereqs: [], approvedPrereqs: [], finalPrereqs: [],
}))
const pps = {
  code: 'UTN-ISI23-PPS', name: 'Práctica Profesional Supervisada', year: 5,
  term: 'Actividad', projectionKind: 'activity', hours: 200, hoursUnit: 'horas reloj totales',
  prereqs: [25, 26, 30].map(codeOf), approvedPrereqs: [12, 20, 23].map(codeOf),
  // Accreditation has the same requirements as initiation, not PF approval.
  finalPrereqs: [12, 20, 23].map(codeOf),
}
const compulsory = rows.map(([number, year, name, hours, durationPeriods, regularized, approved]) => ({
  code: codeOf(number), catalogNumber: number, name, year,
  term: durationPeriods === 2 ? 'Anual' : number === 11 ? '2C' : 'Cuatrimestral',
  durationPeriods, ...(durationPeriods === 2 ? { allowedStartTerms: ['1C'] }
    : number === 11 ? { allowedStartTerms: ['2C'] } : {}),
  hours, hoursUnit: 'horas cátedra semanales',
  prereqs: regularized.map(codeOf), approvedPrereqs: approved.map(codeOf),
  // The PDF explicitly applies its two columns to both course and exam.
  // Regularization requirements are not silently upgraded to approvals.
  finalPrereqs: number === 36
    ? [...rows.filter(r => r[0] !== 36).map(r => codeOf(r[0])), ...electives.map(s => s.code)]
    : approved.map(codeOf),
}))
export const subjects = [...compulsory, ...electives, pps].sort((a, b) => a.year - b.year)
export const initialStatus = Object.fromEntries(subjects.map(s => [s.code, 'Pendiente']))
