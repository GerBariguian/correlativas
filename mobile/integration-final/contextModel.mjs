// In-memory demo adapter. Academic/lifecycle rules come from the existing web.
import { createCareerInstance, archiveCareerInstance, restoreCareerInstance, validateCareerInstances, resolveCareerSelection } from '../../src/careerInstanceLogic.js'
import { resolveUserDataAuthority, academicScope, academicScopeKey } from '../../src/userDataAuthorityLogic.js'

export const SCENARIOS = Object.freeze({ instances: 'Trayectorias · con selección', 'missing-progress': 'Trayectorias · sin registro de progreso', 'invalid-progress': 'Trayectorias · progreso no interpretable', empty: 'Trayectorias · sin carreras', unselected: 'Trayectorias · sin selección', legacy: 'Selección de carrera anterior', 'legacy-empty': 'Primera selección de carrera', frozen: 'Cuenta en actualización', blocked: 'Cuenta bloqueada', invalid: 'Estado no verificable', unavailable: 'Catálogo no disponible' })
export const SYSTEMS = 'utn-sistemas-2023'
const fail = code => { throw Object.assign(new Error(code), { code }) }
const control = (authority, phase, uid) => ({ schemaVersion: 1, generation: 'multicareer-v1', authority, phase, origin: 'legacy', manifestId: uid, updatedAt: { seconds: 1, nanoseconds: 0 } })
export function fixtureState(scenario = 'instances', seed = { status: {} }) {
  if (!Object.hasOwn(SCENARIOS, scenario)) fail('INVALID_SCENARIO')
  const uid = scenario.startsWith('legacy') ? 'demo-legacy-user' : 'demo-instance-user'
  const instance = (id, catalogId) => createCareerInstance({ uid, careerInstanceId: id, catalogId })
  let instances = scenario === 'empty' || scenario.startsWith('legacy') ? [] : [instance('demo-sistemas', SYSTEMS), instance('demo-industrial23', 'utn-industrial-2023'), archiveCareerInstance(instance('demo-industrial07', 'utn-industrial-2007'))]
  let selected = instances.length ? 'demo-sistemas' : null
  if (scenario === 'unselected') selected = null
  if (scenario === 'unavailable') { instances = [...instances, instance('demo-missing', 'catalogo-ficticio-no-disponible')]; selected = 'demo-missing' }
  const c = scenario.startsWith('legacy') ? null : scenario === 'invalid' ? { invalid: true } : control(scenario === 'frozen' ? 'frozen' : 'instances', scenario === 'frozen' ? 'copying' : scenario === 'blocked' ? 'blocked' : 'complete', uid)
  const profile = { activeCareerInstanceId: selected, activeCareerId: scenario === 'legacy' ? SYSTEMS : null }
  const key = `${uid}:${scenario.startsWith('legacy') ? 'legacy:'+SYSTEMS : 'instances:demo-sistemas'}`
  const records = scenario === 'missing-progress' ? {} : { [key]: scenario === 'invalid-progress' ? { status: { 'UTN-ISI23-01': 'Estado inválido ficticio' } } : structuredClone(seed) }
  return { scenario, uid, control: c, profile, instances, records, sharing: Object.fromEntries(instances.map(i => [i.careerInstanceId, { enabled: false, epoch: 0 }])), sequence: 0 }
}
export function describeContext(state, catalogs) {
  validateCareerInstances(state.uid, state.instances)
  const authority = resolveUserDataAuthority(state.uid, state.control, state.profile, state.instances)
  const career = catalogs.find(c => c.id === authority.catalogId) ?? null
  const scope = academicScope(authority, authority.catalogId)
  const key = academicScopeKey(scope)
  const empty = { status: authority.authority === 'legacy' ? career?.initialStatus ?? {} : {} }
  return { ...authority, career, key, usable: Boolean(career && key && authority.capabilities.academicWrite), record: key ? state.records[key] ?? empty : { status: {} } }
}
export function changeContext(state, operation, value, catalogs) {
  const context = describeContext(state, catalogs)
  if (!context.capabilities.select || context.phase === 'blocked') fail('ACADEMIC_AUTHORITY_CHANGED')
  if (operation === 'legacy-select') {
    if (context.authority !== 'legacy' || !catalogs.some(c => c.id === value)) fail('INVALID_INPUT')
    return { ...state, profile: { ...state.profile, activeCareerId: value } }
  }
  if (context.authority !== 'instances') fail('ACADEMIC_AUTHORITY_CHANGED')
  if (operation === 'select') {
    if (value !== null && resolveCareerSelection(state.uid, state.instances, value) !== value) fail('INVALID_INPUT')
    return { ...state, profile: { ...state.profile, activeCareerInstanceId: value } }
  }
  if (operation === 'add') {
    if (!catalogs.some(c => c.id === value)) fail('INVALID_INPUT')
    if (state.instances.some(i => i.catalogId === value)) fail('DUPLICATE_CATALOG_INSTANCE')
    const id = `demo-added-${state.sequence + 1}`
    const instance = createCareerInstance({ uid: state.uid, careerInstanceId: id, catalogId: value })
    return { ...state, instances: [...state.instances, instance], profile: { ...state.profile, activeCareerInstanceId: state.instances.length === 0 && !state.profile.activeCareerInstanceId ? id : state.profile.activeCareerInstanceId }, sharing: { ...state.sharing, [id]: { enabled: false, epoch: 0 } }, sequence: state.sequence + 1 }
  }
  const previous = state.instances.find(i => i.careerInstanceId === value)
  if (!previous) fail('INVALID_INPUT')
  const next = operation === 'archive' ? archiveCareerInstance(previous) : operation === 'restore' ? restoreCareerInstance(previous) : fail('INVALID_INPUT')
  if (next.lifecycle === previous.lifecycle) return state
  return { ...state, instances: state.instances.map(i => i === previous ? next : i),
    profile: { ...state.profile, activeCareerInstanceId: operation === 'archive' && state.profile.activeCareerInstanceId === value ? null : state.profile.activeCareerInstanceId },
    sharing: operation === 'archive' ? { ...state.sharing, [value]: { enabled: false, epoch: (state.sharing[value]?.epoch ?? 0) + 1 } } : state.sharing }
}
export function updateDemoRecord(state, expectedKey, field, update, catalogs) {
  const context = describeContext(state, catalogs)
  if (!context.usable || context.key !== expectedKey) fail('ACADEMIC_SCOPE_CHANGED')
  if (!['status'].includes(field)) fail('INVALID_INPUT')
  const next = typeof update === 'function' ? update(context.record[field]) : update
  const codes = new Set(context.career.subjects.map(s => s.code))
  if (!next || typeof next !== 'object' || Array.isArray(next) || Object.keys(next).some(c => !codes.has(c))) fail('INVALID_INPUT')
  if (field === 'status' && Object.values(next).some(v => !['Pendiente','Cursando','Regularizada','Aprobada'].includes(v))) fail('INVALID_INPUT')
  return { ...state, records: { ...state.records, [expectedKey]: { ...context.record, [field]: next } } }
}
