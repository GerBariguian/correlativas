const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm')
const { transformSync } = require('rolldown/utils')
const clean = s => s.replace(/import[\s\S]*?from ['"][^'"]+['"]\s*/g, '').replace(/export default /g, '').replace(/export /g, '')
const nodes = n => n && typeof n === 'object' ? [n, ...(n.children || []).flatMap(nodes)] : []
const text = n => n && typeof n === 'object' ? (n.children || []).map(text).join(' ') : typeof n === 'string' ? n : ''
function harness(file, name, dependencies) {
  const slots = []; let cursor = 0, effects = []
  const api = { ...dependencies, Fragment: 'fragment',
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }] },
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value } },
    useMemo(fn, ds) { const i = cursor++; if (!slots[i] || ds.some((d, j) => !Object.is(d, slots[i].deps[j]))) slots[i] = { deps: ds, value: fn() }; return slots[i].value },
    useEffect(fn, ds) { const i = cursor++; if (!slots[i] || ds.some((d, j) => !Object.is(d, slots[i].deps[j]))) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps: ds, cleanup: fn() } }) },
    h: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
  }
  vm.createContext(api)
  let source = clean(fs.readFileSync(file, 'utf8'))
  if (file.endsWith('.jsx')) source = transformSync(file, source, { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' } }).code
  vm.runInContext(source, api)
  return { render(...args) { cursor = 0; const tree = api[name](...args), run = effects; effects = []; run.forEach(f => f()); return tree },
    stop() { slots.forEach(slot => slot?.cleanup?.()) } }
}
test('instance selector keeps null with several careers and writes only explicit navigation', async () => {
  const selections = [], bridge = { activeCareerInstanceId: null, capabilities: { select: true },
    instances: [{ careerInstanceId: 'one', catalogId: 'cat', lifecycle: 'active' }, { careerInstanceId: 'two', catalogId: 'other', lifecycle: 'active' }],
    repository: { selectInstance: async id => selections.push(id) } }
  const h = harness('src/components/InstanceSelection.jsx', 'InstanceSelection', {})
  const props = { bridge, careers: [{ id: 'cat', university: 'U', name: 'Carrera', plan: '1' }] }
  let tree = h.render(props)
  assert.equal(nodes(tree).find(n => n.type === 'select').props.value, '')
  assert.equal(selections.length, 0)
  await nodes(tree).find(n => n.type === 'select').props.onChange({ target: { value: 'one' } })
  await Promise.resolve(); assert.deepEqual(selections, ['one'])
  bridge.capabilities.select = false; tree = h.render(props)
  assert.equal(nodes(tree).find(n => n.type === 'select').props.disabled, true)
})
test('restricted planner has personal planning and history, without mounting academic-social hooks', () => {
  const h = harness('src/components/PlannerPage.jsx', 'PlannerPage', { Planner: 'personal', JointPlanHistory: 'history',
    usePlanningParticipants: () => { throw Error('academic sharing mounted') }, useJointPlans: () => { throw Error('legacy joint mounted') } })
  const tree = h.render({ academicSocial: false, user: { uid: 'u' }, career: { id: 'cat' }, subjects: [], statusMap: {} })
  assert.ok(nodes(tree).some(n => n.type === 'personal')); assert.ok(nodes(tree).some(n => n.type === 'history'))
})
test('read-only history does not auto-select a plan and exposes no mutation controls', () => {
  const h = harness('src/components/JointPlanHistory.jsx', 'JointPlanHistory', { useJointPlans: () => ({ state: 'ready', plans: [{ id: 'p', name: 'History' }], rows: null }) })
  const tree = h.render({ user: { uid: 'u' } })
  assert.equal(nodes(tree).find(n => n.type === 'select').props.value, '')
  assert.equal(nodes(tree).filter(n => n.type === 'button').length, 0)
  assert.match(text(tree), /temporalmente suspendidas/)
})
test('App switches source by context, gates freeze, null instances never onboard or default', async () => {
  const user = { uid: 'u' }, calls = []
  let bridge
  const source = model => ({ key: `u:${model}:id`, scope: { catalogId: 'cat' }, load: async () => { calls.push(model); return { statusMap: { A: model === 'legacy' ? 'Regularizada' : 'Aprobada' }, revision: 1 } } })
  const setBridge = (authority, selected = true) => {
    bridge = { authority, phase: authority === 'instances' ? 'complete' : 'pending', catalogId: selected ? 'cat' : null,
      activeCareerInstanceId: authority === 'instances' && selected ? 'id' : null,
      key: selected ? `u:${authority}:id` : null, source: selected ? source(authority) : null,
      scope: selected ? { catalogId: 'cat' } : null,
      capabilities: { academicWrite: !['frozen', 'invalid'].includes(authority), select: true, legacySocial: authority === 'legacy' },
      canWrite: () => bridge.capabilities.academicWrite, retry() {} }
  }
  setBridge('legacy')
  const components = Object.fromEntries(['Header', 'CareerSelector', 'InstanceSelection', 'JointPlanHistory', 'CareerProjectionPage', 'PlannerPage',
    'CareerMap', 'SubjectsPanel', 'Advisor', 'WelcomeSetup', 'FriendsPage', 'Dashboard', 'Route'].map(name => [name, name]))
  const h = harness('src/App.jsx', 'App', { ...components, auth: { currentUser: user }, googleProvider: {}, signInWithPopup() {},
    onAuthStateChanged: (auth, callback) => { callback(user); return () => {} },
    useAcademicBridge: () => bridge, useActivity: () => ({}), useSocialProfile: () => ({ ready: true }),
    useCareerProjection: () => ({ phase: 'empty', scenario: null }), usePlannerSession: () => ({ selectedCodes: [], setSelectedCodes() {} }),
    careers: [{ id: 'cat', name: 'Catalog', plan: '1', subjects: [], initialStatus: {} }],
    summary: () => ({}), availableToCourse: () => [], availableFinals: () => [], blockedSubjects: () => [], recommendations: () => [],
    localStorage: { setItem() {} }, console, window: { alert: message => { throw Error(message) } },
  })
  const settle = async () => { let tree; for (let i = 0; i < 8; i++) { tree = h.render(); await Promise.resolve() } return tree }
  await settle(); assert.deepEqual(calls, ['legacy'])
  bridge = { ...bridge, authority: 'frozen', capabilities: { academicWrite: false, select: false, legacySocial: false } }
  let tree = await settle(); assert.match(text(tree), /Estamos actualizando tu cuenta/)
  assert.ok(nodes(tree).some(n => n.props.inert === true)); assert.deepEqual(calls, ['legacy'])
  setBridge('instances')
  let resolveProgress
  bridge.source.load = () => { calls.push('instances'); return new Promise(resolve => { resolveProgress = resolve }) }
  tree = await settle()
  assert.ok(!nodes(tree).some(n => n.type === 'Dashboard' || n.type === 'SubjectsPanel'))
  assert.match(text(tree), /Cargando perfil/)
  resolveProgress({ statusMap: { A: 'Aprobada' }, revision: 1 })
  tree = await settle(); assert.deepEqual(calls, ['legacy', 'instances'])
  assert.ok(nodes(tree).some(n => n.type === 'InstanceSelection'))
  bridge = { ...bridge, activeCareerInstanceId: 'second', key: 'u:instances:second',
    source: { ...bridge.source, key: 'u:instances:second', load: () => new Promise(resolve => { resolveProgress = resolve }) } }
  tree = await settle()
  assert.ok(!nodes(tree).some(n => n.type === 'Dashboard' || n.type === 'SubjectsPanel'))
  assert.match(text(tree), /Cargando perfil/)
  resolveProgress({ statusMap: {}, revision: 1 })
  await settle()
  setBridge('instances', false); tree = await settle()
  assert.ok(!nodes(tree).some(n => n.type === 'WelcomeSetup' || n.type === 'Dashboard'))
  assert.match(text(tree), /No hay una trayectoria/)
  h.stop()
})
