const { test } = require('node:test')
const assert = require('node:assert/strict')
const { harness, nodes, text } = require('./academic-onboarding-ui-harness.cjs')
const button = (tree, name) => nodes(tree).find(n => n.type === 'button' && text(n) === name)
const node = (tree, type) => nodes(tree).find(n => n.type === type)
function appFixture(model = 'legacy', chosen = true) {
  const user = { uid: 'alice' }, auth = { currentUser: user }, calls = [], cache = []
  let authNext, stored = { A: 'Pendiente' }
  const careers = ['cat', 'other'].map(id => ({ id, name: id, plan: '1', subjects: [], initialStatus: {} }))
  const source = (id, catalogId = id) => ({ key: `alice:${model}:${id}`, scope: { uid: 'alice', model, id, catalogId },
    load: async () => { calls.push(['read', id]); return { statusMap: stored, revision: model === 'instances' ? 1 : { exists: true, statusMap: { ...stored }, updatedAt: 1 } } },
    save: async map => {
      calls.push(['ordinary-save', map])
      if (model === 'instances') return 2
      for (const op of map.operations) stored = { ...stored, [op.code]: op.status }
      return { exists: true, statusMap: { ...stored }, updatedAt: 2 }
    } })
  const bridge = { authority: model, phase: model === 'instances' ? 'complete' : 'pending', capabilities: { academicWrite: true, legacySocial: model === 'legacy', select: true },
    catalogId: chosen ? 'cat' : null, activeCareerInstanceId: model === 'instances' && chosen ? 'ix' : null, instances: [],
    canWrite: () => bridge.capabilities.academicWrite, retry() {}, lifecycle: { select: async id => { calls.push(['select', id]); setSource(id, 'other') } } }
  function setSource(id, catalogId) {
    bridge.catalogId = catalogId; bridge.activeCareerInstanceId = model === 'instances' ? id : null
    bridge.source = source(id, catalogId); bridge.scope = bridge.source.scope; bridge.key = bridge.source.key
  }
  setSource(model === 'instances' ? 'ix' : 'cat', 'cat'); if (!chosen) bridge.catalogId = null
  const components = Object.fromEntries(['Header', 'CareerSelector', 'InstanceSelection', 'MyCareers', 'JointPlanHistory', 'JointCWorkspace', 'CareerProjectionPage', 'PlannerPage', 'CareerMap', 'SubjectsPanel', 'Advisor', 'WelcomeSetup', 'FriendsPage', 'Dashboard', 'Route', 'AcademicOnboarding'].map(name => [name, name]))
  const ui = harness('src/App.jsx', 'App', { ...components, structuredClone, auth, careers, googleProvider: {}, signInWithPopup() {},
    onAuthStateChanged: (_auth, next) => { authNext = next; next(user); return () => {} },
    useAcademicBridge: () => bridge, useActivity: () => ({}), useSocialProfile: () => ({ ready: true }),
    useCareerProjection: () => ({ phase: 'empty' }), usePlannerSession: () => ({ selectedCodes: [], setSelectedCodes() {} }),
    summary: () => ({}), availableToCourse: () => [], availableFinals: () => [], blockedSubjects: () => [], recommendations: () => [],
    saveUserProfile: async (uid, data) => { calls.push(['profile', uid, data]); setSource(data.activeCareerId, data.activeCareerId) },
    localStorage: { setItem: (key, value) => cache.push([key, value]) }, console, window: { alert(message) { throw Error(message) } },
  })
  const render = () => ui.render()
  const settle = async () => { let tree; for (let i = 0; i < 15; i++) { await Promise.resolve(); tree = render() } return tree }
  return { ui, bridge, auth, user, calls, cache, careers, render, settle, setSource,
    setStored: value => { stored = value }, accountChange: () => { auth.currentUser = null; authNext(null) } }
}
test('legacy initial career setup offers onboarding only after profile success; exit rereads progress', async () => {
  const f = appFixture('legacy', false); f.render(); await f.settle()
  assert.ok(node(f.render(), 'WelcomeSetup'))
  await node(f.render(), 'WelcomeSetup').props.onContinue(); await f.settle()
  const onboarding = node(f.render(), 'AcademicOnboarding')
  assert.ok(onboarding); assert.equal(onboarding.props.source.scope.id, 'cat')
  assert.ok(!node(f.render(), 'SubjectsPanel'))
  f.setStored({ A: 'Pendiente', B: 'Aprobada' })
  const before = f.calls.filter(c => c[0] === 'read').length
  onboarding.props.onExit(); await f.settle()
  assert.equal(node(f.render(), 'AcademicOnboarding'), undefined)
  assert.ok(f.calls.filter(c => c[0] === 'read').length > before)
  assert.deepEqual(JSON.parse(f.cache.at(-1)[1]), { A: 'Pendiente', B: 'Aprobada' })
})
test('existing legacy account does not auto-onboard; explicit launch uses chosen career', async () => {
  const f = appFixture(); f.render(); await f.settle()
  assert.equal(node(f.render(), 'AcademicOnboarding'), undefined)
  await button(f.render(), 'Configurar mis materias →').props.onClick(); await f.settle()
  assert.ok(node(f.render(), 'AcademicOnboarding'))
  assert.equal(f.calls.filter(c => c[0] === 'profile').length, 0)
})
test('ordinary subject handlers retained before onboarding cannot overwrite its progress', async () => {
  const f = appFixture(); f.render(); await f.settle()
  button(f.render(), '📚 Materias').props.onClick(); await f.settle()
  const staleUpdate = node(f.render(), 'SubjectsPanel').props.updateStatus
  await button(f.render(), 'Configurar mis materias →').props.onClick(); await f.settle()
  await staleUpdate('B', 'Aprobada')
  assert.equal(f.calls.filter(c => c[0] === 'ordinary-save').length, 0)
})
test('instance configuration explicitly selects exact added instance; no legacy profile write', async () => {
  const f = appFixture('instances', false); f.render(); await f.settle()
  await node(f.render(), 'MyCareers').props.onConfigure({ id: 'new-instance', catalogId: 'other' }); await f.settle()
  const onboard = node(f.render(), 'AcademicOnboarding')
  assert.ok(onboard); assert.equal(onboard.props.source.scope.id, 'new-instance')
  assert.equal(onboard.props.career.id, 'other')
  assert.deepEqual(f.calls.filter(c => c[0] === 'select'), [['select', 'new-instance']])
  assert.equal(f.calls.filter(c => c[0] === 'profile').length, 0)
})
test('blocked authority cannot start instance flow and selection failure does not fall back', async () => {
  const f = appFixture('instances', false); f.render(); await f.settle()
  const configure = node(f.render(), 'MyCareers').props.onConfigure
  f.bridge.phase = 'blocked'; await configure({ id: 'new', catalogId: 'other' }); await f.settle()
  assert.equal(f.calls.filter(c => c[0] === 'select').length, 0)
  f.bridge.phase = 'complete'; f.bridge.lifecycle.select = async () => { throw Error('permission-denied') }
  await configure({ id: 'new', catalogId: 'other' }); await f.settle()
  assert.equal(node(f.render(), 'AcademicOnboarding'), undefined)
  assert.match(text(f.render()), /edición está suspendida/)
})
test('switching account or scope does not expose the previous onboarding', async () => {
  const f = appFixture(); f.render(); await f.settle()
  await button(f.render(), 'Configurar mis materias →').props.onClick(); await f.settle()
  f.setSource('other', 'other'); await f.settle()
  assert.equal(node(f.render(), 'AcademicOnboarding'), undefined)
  f.accountChange(); await f.settle(); assert.equal(node(f.render(), 'AcademicOnboarding'), undefined)
})
test('MyCareers successful add offers opt-in without implicit selection', async () => {
  const configured = [], calls = []
  const bridge = { authority: 'instances', phase: 'complete', capabilities: { academicWrite: true }, instances: [], lifecycle: {
    add: async id => { calls.push(['add', id]); return 'new-instance' }, select: async id => calls.push(['select', id]) } }
  const ui = harness('src/components/MyCareers.jsx', 'MyCareers')
  const props = { bridge, careers: [{ id: 'cat', name: 'Carrera', university: 'U', plan: '1' }], onConfigure: value => configured.push(value) }
  const render = () => ui.render(props)
  nodes(render()).find(n => n.type === 'select').props.onChange({ target: { value: 'cat' } })
  nodes(render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 10; i++) await Promise.resolve()
  assert.deepEqual(calls, [['add', 'cat']]); assert.equal(configured.length, 0)
  button(render(), 'Seleccionar y configurar materias').props.onClick()
  assert.equal(configured[0].id, 'new-instance'); assert.equal(configured[0].catalogId, 'cat')
  button(render(), 'Prefiero hacerlo después').props.onClick()
  assert.equal(button(render(), 'Seleccionar y configurar materias'), undefined)
})


test('ordinary legacy UI captures explicit expectation and adopts server map including concurrent keys', async () => {
  const f = appFixture(); f.render(); await f.settle()
  const subjectsTab = nodes(f.render()).find(n => n.type === 'button' && text(n).includes('Materias'))
  subjectsTab.props.onClick(); await f.settle()
  f.setStored({ A: 'Pendiente', OTHER: 'Aprobada' })
  await node(f.render(), 'SubjectsPanel').props.updateStatus('A', 'Cursando'); await f.settle()
  const intent = f.calls.find(c => c[0] === 'ordinary-save')[1]
  assert.deepEqual(JSON.parse(JSON.stringify(intent)), { type: 'patch', operations: [{ code: 'A', expected: { exists: true, status: 'Pendiente' }, operation: 'set', status: 'Cursando' }] })
  assert.deepEqual(JSON.parse(f.cache.at(-1)[1]), { A: 'Cursando', OTHER: 'Aprobada' })
})
