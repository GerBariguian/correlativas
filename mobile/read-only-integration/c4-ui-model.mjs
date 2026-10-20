import { onboardingScopeKey } from '../../src/academicOnboardingLogic.js'
export const SECTIONS = Object.freeze(['Inicio', 'Materias', 'Mapa', 'Planificar', 'Proyectar', 'Comunidad'])
// Display metadata checked against src/data/careers.js; no import of its wider graph.
const CATALOG_HEADINGS = Object.freeze({
  'utn-sistemas-2023': Object.freeze({ university: 'UTN', name: 'Ingeniería en Sistemas de Información', plan: '2023' }),
  'utn-industrial-2023': Object.freeze({ university: 'UTN', name: 'Ingeniería Industrial', plan: 'I-23 (2023)' }),
  'utn-industrial-2007': Object.freeze({ university: 'UTN', name: 'Ingeniería Industrial', plan: '2007' }),
})
export function catalogHeading(catalogId) { return Object.hasOwn(CATALOG_HEADINGS, catalogId) ? CATALOG_HEADINGS[catalogId] : null }
export function groupRowsByYear(model) {
  if (model.state !== 'loaded') return []
  const groups = new Map()
  for (const row of model.rows) {
    if (!groups.has(row.year)) groups.set(row.year, [])
    groups.get(row.year).push(row)
  }
  return [...groups].map(([year, rows]) => ({ year, rows }))
}
export function academicPanelModel(model, scope) {
  if (model.state !== 'loaded') return model
  try { if (onboardingScopeKey(model.scope) === onboardingScopeKey(scope)) return model } catch {}
  return { state: 'error', code: 'C4_PANEL_SCOPE_MISMATCH', rows: [], counts: null }
}
const option = (key, label, model, id, catalogId) => Object.freeze({ key, label, model, id, catalogId })
export const LAB_CONTEXTS = Object.freeze({
  'lab-instances': Object.freeze([
    option('systems', 'Sistemas · 2023', 'instances', 'lab-systems', 'utn-sistemas-2023'),
    option('industrial', 'Industrial · 2023', 'instances', 'lab-industrial23', 'utn-industrial-2023'),
    option('archived', 'Industrial · 2007 (archivada)', 'instances', 'lab-industrial07', 'utn-industrial-2007'),
  ]),
  'lab-legacy': Object.freeze([
    option('systems', 'Sistemas · 2023 (legacy)', 'legacy', 'utn-sistemas-2023', 'utn-sistemas-2023'),
    option('absent', 'Industrial · 2023 (progreso ausente)', 'legacy', 'utn-industrial-2023', 'utn-industrial-2023'),
  ]),
  'lab-empty': Object.freeze([option('systems', 'Sistemas (instancia inexistente para este usuario)', 'instances', 'lab-systems', 'utn-sistemas-2023')]),
  'lab-blocked': Object.freeze([option('systems', 'Sistemas (contexto bloqueado)', 'instances', 'lab-systems', 'utn-sistemas-2023')]),
})
export function labScope(uid, key) {
  const item = Object.hasOwn(LAB_CONTEXTS, uid) ? LAB_CONTEXTS[uid].find(item => item.key === key) : null
  if (!item) throw Error('C4_INVALID_LAB_CONTEXT')
  const scope = { uid, model: item.model, id: item.id, catalogId: item.catalogId }
  onboardingScopeKey(scope); return Object.freeze(scope)
}
export function workspaceKey(epoch, scope) { return JSON.stringify([epoch, onboardingScopeKey(scope)]) }
export function academicScreenModel(session, model) {
  if (session.state === 'loading') return { state: 'loading', rows: [], counts: null }
  if (session.state === 'error') return { state: 'error', code: session.code, rows: [], counts: null }
  return model
}
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
export function filterSubjectRows(model, { query = '', status = '', year = '' } = {}) {
  if (model.state !== 'loaded') return []
  const text = normalize(query.trim())
  return model.rows.filter(row => (!text || normalize(`${row.name} ${row.code}`).includes(text))
    && (!status || (status === 'unrecorded' ? !row.recorded : row.recorded && row.status === status))
    && (!year || String(row.year) === year))
}
export function academicStateMessage(model) {
  const messages = {
    idle: ['Sin conexión académica', 'Conectá un usuario ficticio del laboratorio para consultar su recorrido.'],
    loading: ['Consultando información académica', 'No se muestran datos anteriores mientras cambia o se actualiza el contexto.'],
    absent: ['Datos ausentes', model.reason === 'INSTANCE_MISSING' ? 'Esta instancia no existe para el usuario seleccionado.' : 'No existe un documento de progreso para esta carrera. No se asignan estados automáticamente.'],
    error: ['No se pudo consultar', 'Revisá el contexto y la disponibilidad del laboratorio. Podés actualizar manualmente.'],
    blocked: ['Contexto bloqueado', 'No se muestra progreso académico para este contexto.'],
    archived: ['Carrera archivada', 'El repositorio no expone el progreso de esta instancia archivada.'],
  }
  return messages[model.state] ?? ['Estado no disponible', 'No hay información para mostrar.']
}
