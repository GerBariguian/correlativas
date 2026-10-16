export const PAGE_TITLES = Object.freeze({
  'alta-universidad': 'Agregar · Universidad', 'alta-carrera': 'Agregar · Carrera', 'alta-plan': 'Agregar · Plan',
  onboarding: 'Carga académica', inicio: 'Inicio', materias: 'Materias', mapa: 'Mapa', comunidad: 'Comunidad',
  cuenta: 'Cuenta', carreras: 'Mis carreras', planificador: 'Planificar', proyeccion: 'Proyectar Carrera',
})
export function initialRoute(hash) {
  const raw = hash.replace(/^#/, '')
  const page = raw.startsWith('alta-') ? 'carreras' : raw
  return { page: Object.hasOwn(PAGE_TITLES, page) ? page : 'inicio', sheet: null, expanded: null }
}
export function pageRoute(page, sheet = null) {
  if (!Object.hasOwn(PAGE_TITLES, page)) throw new Error('Unknown navigation destination')
  return { page, sheet, expanded: null }
}
