const { test } = require('node:test')
const assert = require('node:assert/strict')
const { runtime, plannerHarness, nodes, text, source } = require('./planner-ui-harness.cjs')
const plain = value => JSON.parse(JSON.stringify(value))
const s = (code, extra = {}) => ({ code, name: `Materia ${code}`, prereqs: [], durationPeriods: 1, ...extra })
const section = (h, label) => nodes(h.render()).find(n => n.props['aria-label'] === label)

for (const [date, expected] of [[new Date(2026, 0, 1), { year: 2026, term: '2C' }], [new Date(2026, 5, 30), { year: 2026, term: '2C' }], [new Date(2026, 6, 1), { year: 2027, term: '1C' }], [new Date(2026, 11, 31), { year: 2027, term: '1C' }]]) {
  test(`initial next local semester: ${date.toDateString()}`, () => {
    const result = runtime().api.initialPlannerSession('u', 'c', date)
    assert.deepEqual(plain(result.targetPeriod), expected)
    assert.equal(result.desiredCount, 4)
  })
}
test('period controls retain selection; incompatible item stays visible and removable', () => {
  const h = plannerHarness([s('A', { allowedStartTerms: ['2C'] }), s('B', { prereqs: ['A'] })], { targetPeriod: { year: 2027, term: '2C' }, selectedCodes: ['A'] })
  h.control('planner-term').props.onChange({ target: { value: '1C' } })
  assert.deepEqual(h.props.selectedCodes, ['A'])
  assert.match(text(section(h, 'Mi selección')), /Inicio incompatible/)
  assert.match(text(section(h, 'Impacto de tu selección')), /Elegidas válidas 0/)
  h.click('Quitar Materia A de Mi selección')
  assert.deepEqual(plain(h.props.selectedCodes), [])
})
test('unknown start and duration are visible without inventing close effects', () => {
  const h = plannerHarness([s('A', { durationPeriods: undefined }), s('B', { prereqs: ['A'] })], { selectedCodes: ['A'] })
  assert.match(h.text(), /El catálogo no confirma el dictado/)
  assert.match(h.text(), /Duración no informada/)
  assert.match(text(section(h, 'Impacto de tu selección')), /Nuevas habilitaciones al cierre 0/)
})
test('N defaults to four, supports large editable counts and never limits manual selection', () => {
  const h = plannerHarness([s('A'), s('B')])
  const label = 'Cantidad deseada para la sugerencia'
  assert.equal(h.control(label).props.value, 4)
  h.click('Aumentar cantidad sugerida'); assert.equal(h.props.desiredCount, 5)
  h.click('Reducir cantidad sugerida'); assert.equal(h.props.desiredCount, 4)
  h.control(label).props.onChange({ target: { value: '100' } }); assert.equal(h.props.desiredCount, 100)
  h.control(label).props.onChange({ target: { value: '1' } })
  for (const code of ['A', 'B']) nodes(h.render()).find(n => n.props.className?.startsWith('planner-subject') && text(n).includes(`Materia ${code}`)).props.onClick()
  assert.deepEqual(plain(h.props.selectedCodes), ['A', 'B'])
})
for (const value of ['', '0', '-1', '1.5']) test(`invalid N ${value} disables suggestion but keeps manual selection`, () => {
  const h = plannerHarness([s('A')], { selectedCodes: ['A'] })
  h.control('Cantidad deseada para la sugerencia').props.onChange({ target: { value } })
  assert.equal(h.button('Sugerir cursada').props.disabled, true)
  assert.deepEqual(h.props.selectedCodes, ['A'])
})
test('joint synergy and remaining approvals are explained by engine output', () => {
  const h = plannerHarness([s('A'), s('B'), s('D'), s('C', { prereqs: ['A', 'B'] }), s('E', { prereqs: ['A'], approvedPrereqs: ['D'] })], { selectedCodes: ['A', 'B'] })
  const impact = text(section(h, 'Impacto de tu selección'))
  assert.match(impact, /Nuevas habilitaciones al cierre 1/)
  assert.match(impact, /Contribución conjunta: Materia A, Materia B/)
  assert.match(impact, /Falta aprobar: Materia D/)
  assert.match(impact, /no aprobar su final/)
})
test('annual completion is separate from close, with no second timeline', () => {
  const h = plannerHarness([s('A', { durationPeriods: 2 }), s('B', { prereqs: ['A'] })], { selectedCodes: ['A'] })
  assert.match(h.text(), /Nuevas habilitaciones al cierre 0/)
  assert.match(h.text(), /Al completar las cursadas 1 adicionales/)
  assert.match(h.text(), /Incluye 1 materia anual/)
  assert.match(h.text(), /compromete dos períodos/)
})
test('ambiguous hours hide aggregate; homogeneous weekly units allow complete total', () => {
  const subjects = [s('A', { hours: 3, hoursUnit: 'horas cátedra semanales' }), s('B', { hours: 4, hoursUnit: 'horas cátedra semanales' })]
  const h = plannerHarness(subjects, { selectedCodes: ['A', 'B'] })
  assert.match(h.text(), /7 horas cátedra semanales/)
  h.props.subjects = [subjects[0], s('B', { hours: 200, hoursUnit: 'horas reloj totales' })]
  assert.doesNotMatch(h.text(), /\d+ horas cátedra semanales|Horas totales/)
})
test('activity and invalid selected code remain removable but never candidates', () => {
  const h = plannerHarness([s('A', { projectionKind: 'activity' })], { selectedCodes: ['A', 'MISSING'] })
  assert.equal(nodes(section(h, 'Materias disponibles')).filter(n => n.props.className?.startsWith('planner-subject')).length, 0)
  assert.match(h.text(), /Actividad no calendarizable/)
  assert.match(h.text(), /MISSING/)
  assert.match(h.text(), /Elegidas válidas 0/)
})
test('worker receives serializable input, duplicate requests blocked, result does not autoapply', () => {
  const h = plannerHarness([s('A'), s('B'), s('C', { prereqs: ['B'] })], { selectedCodes: ['A'], desiredCount: 1 })
  const trigger = h.button('Sugerir cursada')
  trigger.props.onClick(); trigger.props.onClick()
  assert.equal(h.workers.length, 1)
  assert.match(h.text(), /Calculando sugerencia/)
  assert.equal(h.button('Calculando sugerencia…').props.disabled, true)
  assert.deepEqual(h.workers[0].messages[0].input.selectedCodes, ['A'])
  assert.equal(h.workers[0].messages[0].input.scopeKey, undefined)
  h.complete()
  assert.deepEqual(h.props.selectedCodes, ['A'])
  assert.match(h.text(), /Entran: Materia B/)
  assert.match(h.text(), /Salen: Materia A/)
  assert.equal(h.workers[0].terminated, true)
  h.click('Mantener mi selección'); assert.deepEqual(h.props.selectedCodes, ['A'])
  assert.doesNotMatch(h.text(), /Entran:/)
  h.click('Sugerir cursada'); h.complete(); h.click('Usar sugerencia')
  assert.deepEqual(plain(h.props.selectedCodes), ['B'])
  assert.doesNotMatch(h.text(), /Entran:/)
})
test('empty selection shows proposal and explicit cancel; fewer candidates explained', () => {
  const h = plannerHarness([s('A')], { desiredCount: 7 })
  h.click('Sugerir cursada'); h.complete()
  assert.match(h.text(), /Pediste 7 materias; hay 1 candidatas/)
  assert.equal(nodes(h.render()).some(n => n.type === 'h4' && text(n) === 'Tu selección'), false)
  h.click('Cancelar'); assert.deepEqual(h.props.selectedCodes, [])
})
test('no improvement does not offer artificial replacement', () => {
  const h = plannerHarness([s('A'), s('B')], { selectedCodes: ['A'], desiredCount: 1 })
  h.click('Sugerir cursada'); h.complete()
  assert.match(h.text(), /No encontramos una alternativa con mayor impacto académico/)
  assert.equal(h.button('Usar sugerencia'), undefined)
})
test('bounded response uses qualified language with no optimality claim', () => {
  const h = plannerHarness([s('A')], { selectedCodes: ['A'], desiredCount: 1 })
  h.click('Sugerir cursada')
  const worker = h.workers[0], response = h.api.runPlannerWorkerRequest(worker.messages[0])
  response.result.method = 'bounded'
  worker.reply(response)
  assert.match(h.text(), /La búsqueda realizada no encontró/)
  assert.match(h.text(), /búsqueda acotada/)
  assert.doesNotMatch(h.text(), /óptima|mejor posible/)
})
for (const kind of ['selection', 'count', 'period', 'progress', 'career', 'user']) test(`changing ${kind} invalidates pending and ready proposal`, () => {
  const h = plannerHarness([s('A'), s('B')])
  const change = () => {
    if (kind === 'selection') h.props.selectedCodes = h.props.selectedCodes.length ? [] : ['A']
    if (kind === 'count') h.props.desiredCount++
    if (kind === 'period') h.props.targetPeriod = { year: h.props.targetPeriod.year + 1, term: '2C' }
    if (kind === 'progress') h.props.statusMap = { A: h.props.statusMap.A === 'Aprobada' ? 'Pendiente' : 'Aprobada' }
    if (kind === 'career' || kind === 'user') h.props.scopeKey += ':next'
  }
  h.click('Sugerir cursada'); const old = h.workers.at(-1)
  change(); h.render(false); old.complete(); h.flush()
  assert.doesNotMatch(h.text(), /Sugerencia lista/)
  assert.equal(old.terminated, true)
  h.click('Sugerir cursada'); h.complete(); assert.match(h.text(), /Sugerencia lista/)
  change(); assert.doesNotMatch(h.text(), /Sugerencia lista/)
})
test('worker error is recoverable and manual editing remains available', () => {
  const h = plannerHarness([s('A')])
  h.click('Sugerir cursada')
  h.workers[0].onerror({ preventDefault() {} })
  assert.match(h.text(), /No se pudo calcular/)
  nodes(h.render()).find(n => n.props.className?.startsWith('planner-subject')).props.onClick()
  assert.deepEqual(plain(h.props.selectedCodes), ['A'])
  h.click('Sugerir cursada'); h.complete(); assert.equal(h.workers.length, 2)
})
test('worker construction failure never calls search on main thread; can retry', () => {
  const h = plannerHarness([s('A')])
  h.failWorkers(true); h.click('Sugerir cursada')
  assert.match(h.text(), /No se pudo calcular/)
  assert.equal(h.workers.length, 0)
  h.failWorkers(false); h.click('Sugerir cursada'); h.complete()
  assert.match(h.text(), /Sugerencia lista/)
})
test('wrong request id and callbacks after unmount cannot deliver result', () => {
  const h = plannerHarness([s('A')])
  h.click('Sugerir cursada'); const worker = h.workers[0]
  worker.reply({ requestId: -1, ok: false }); assert.match(h.text(), /Calculando sugerencia/)
  h.unmount(); worker.complete(); assert.equal(worker.terminated, true)
})
test('native labels, pressed states, details and live status are available to keyboard users', () => {
  const h = plannerHarness([s('A')])
  const tree = h.render()
  for (const id of ['planner-year', 'planner-term']) assert.ok(nodes(tree).some(n => n.type === 'label' && n.props.htmlFor === id))
  assert.ok(h.control('Cantidad deseada para la sugerencia'))
  assert.ok(nodes(tree).some(n => n.type === 'summary' && text(n) === '¿Por qué?'))
  assert.ok(nodes(tree).some(n => n.props['aria-live'] === 'polite'))
  assert.ok(nodes(tree).some(n => n.type === 'button' && n.props['aria-pressed'] === false))
  assert.match(source('src/styles.css'), /planner-intelligent :is\(button, input, select, summary\):focus-visible/)
})
test('session hook preserves decisions through navigation and progress, resets before changed scope renders', () => {
  const r = runtime()
  const render = (uid = 'u', career = 'c') => r.render(() => r.api.usePlannerSession(uid, career))
  let state = render()
  state.setSelectedCodes(['A']); state.setTargetPeriod({ year: 2031, term: '2C' }); state.setDesiredCount(9)
  for (const page of ['dashboard', 'mapa', 'planificador', 'projection', 'planificador']) {
    state = render(); assert.deepEqual(plain(state.selectedCodes), ['A'], page)
    assert.equal(state.desiredCount, 9); assert.equal(state.targetPeriod.year, 2031)
  }
  const stale = state.setSelectedCodes
  state = render('u', 'other'); assert.deepEqual(plain(state.selectedCodes), []); assert.equal(state.desiredCount, 4)
  stale(['LEAK']); assert.deepEqual(plain(render('u', 'other').selectedCodes), [])
  state.setSelectedCodes(['B'])
  assert.deepEqual(plain(render('another', 'other').selectedCodes), [])
  assert.deepEqual(plain(render('u', 'c').selectedCodes), [])
  const app = source('src/App.jsx')
  assert.match(app, /usePlannerSession\(user\?\.uid \?\? null, activeCareerId\)/)
  assert.doesNotMatch(app, /setPlannerSelectedCodes\(\[\]\)/)
  assert.match(app, /targetPeriod=\{planner.targetPeriod\}/)
})

test('restoring an earlier input never resurrects its discarded proposal', () => {
  const h = plannerHarness([s('A')])
  h.click('Sugerir cursada'); h.complete(); assert.match(h.text(), /Sugerencia lista/)
  h.props.desiredCount = 5; h.render()
  h.props.desiredCount = 4
  assert.doesNotMatch(text(h.render(false)), /Sugerencia lista/)
  h.flush(); assert.doesNotMatch(h.text(), /Sugerencia lista/)
})
test('message decoding and postMessage failures recover without synchronous fallback', () => {
  const r = runtime(), states = []
  const controller = r.api.createPlannerWorkerController(() => ({ terminate() {}, postMessage() { throw new Error('clone failed') } }), next => states.push(next.phase))
  controller.start({}, 'k')
  assert.deepEqual(states, ['loading', 'error'])
  const h = plannerHarness([s('A')])
  h.click('Sugerir cursada'); h.workers[0].onmessageerror()
  assert.match(h.text(), /No se pudo calcular/)
  h.click('Sugerir cursada'); h.complete(); assert.match(h.text(), /Sugerencia lista/)
})
test('empty candidate worker response is explicit and preserves manual choices', () => {
  const h = plannerHarness([s('A')], { statusMap: { A: 'Aprobada' }, selectedCodes: ['A'] })
  h.click('Sugerir cursada'); h.complete()
  assert.match(h.text(), /No hay candidatas disponibles para sugerir/)
  assert.deepEqual(h.props.selectedCodes, ['A'])
})
test('actual App effects retain planner across projection load branch and isolate identities', async () => {
  const r = runtime(), api = r.api
  let authChanged, subscribed
  const careers = ['c1', 'c2'].map(id => ({ id, name: id, subjects: [s('A')], initialStatus: { A: 'Pendiente' } }))
  const auth = { currentUser: { uid: 'u1' } }
  Object.assign(api, { careers, auth, googleProvider: {},
    onAuthStateChanged(_auth, callback) { authChanged = callback; callback(auth.currentUser); return () => {} },
    loadUserProfile: async () => ({ activeCareerId: 'c1' }),
    loadUserStatus: async () => ({ A: 'Pendiente' }),
    subscribeUserStatus(_uid, _career, callback) { subscribed = callback; callback({ A: 'Pendiente' }); return () => {} },
    saveUserProfile: async () => {}, saveUserStatus: async () => {},
    useSocialProfile: () => ({}), useCareerProjection: () => ({ phase: 'empty', scenario: null }),
    localStorage: { setItem() {} }, window: { alert() { assert.fail('unexpected error') } },
  })
  for (const component of ['CareerSelector', 'CareerProjectionPage', 'Route', 'PlannerPage', 'CareerMap', 'Header', 'SubjectsPanel', 'Advisor', 'WelcomeSetup', 'FriendsPage', 'Dashboard']) api[component] = component
  r.load('src/App.jsx', 'App')
  const render = () => r.render(() => api.App())
  const settle = async () => { let tree; for (let i = 0; i < 20; i++) { tree = render(); await Promise.resolve() } return tree }
  const go = async label => { nodes(await settle()).find(n => n.type === 'button' && text(n).includes(label)).props.onClick(); return settle() }
  const planner = tree => nodes(tree).find(n => n.type === 'PlannerPage')
  await settle()
  let tree = await go('Planificador')
  planner(tree).props.setSelectedCodes(['A']); planner(tree).props.setDesiredCount(8)
  planner(tree).props.setTargetPeriod({ year: 2030, term: '2C' })
  await go('Dashboard'); tree = await go('Mapa de la carrera')
  const map = nodes(tree).find(n => n.type === 'CareerMap')
  assert.deepEqual(plain(map.props.plannerSelectedCodes), ['A'])
  map.props.setPlannerSelectedCodes(current => [...current, 'B'])
  map.props.setActivePage('planificador')
  tree = await settle()
  assert.deepEqual(plain(planner(tree).props.selectedCodes), ['A', 'B'])
  assert.equal(planner(tree).props.desiredCount, 8)
  assert.deepEqual(plain(planner(tree).props.targetPeriod), { year: 2030, term: '2C' })
  await go('Proyectar carrera')
  subscribed({ A: 'Aprobada' }); await settle()
  tree = await go('Planificador')
  assert.deepEqual(plain(planner(tree).props.selectedCodes), ['A', 'B'])
  assert.equal(planner(tree).props.desiredCount, 8)
  assert.equal(planner(tree).props.targetPeriod.year, 2030)
  await nodes(tree).find(n => n.type === 'CareerSelector').props.setActiveCareerId('c2')
  tree = await settle(); assert.deepEqual(plain(planner(tree).props.selectedCodes), [])
  assert.equal(planner(tree).props.desiredCount, 4)
  planner(tree).props.setSelectedCodes(['A'])
  auth.currentUser = { uid: 'u2' }; authChanged(auth.currentUser)
  tree = await settle(); assert.deepEqual(plain(planner(tree).props.selectedCodes), [])
  assert.equal(planner(tree).props.user.uid, 'u2')
  r.unmount()
})
test('worker entry executes pure protocol on a real isolated Node thread', async () => {
  const { Worker } = require('node:worker_threads')
  const path = require('node:path')
  const worker = new Worker(`
    const {parentPort, workerData, threadId} = require('node:worker_threads');
    const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
    const {api} = require(path.join(workerData, 'tests/planner-loader.cjs'))();
    api.self = {postMessage: value => parentPort.postMessage({value, threadId})};
    for (const file of ['src/workers/plannerWorkerProtocol.js','src/workers/planner.worker.js']) {
      vm.runInContext(fs.readFileSync(path.join(workerData,file),'utf8').replace(/^import .*\\r?\\n/gm,'').replace(/export /g,''),api);
    }
    parentPort.on('message', data => api.self.onmessage({data}));
  `, { eval: true, workerData: path.resolve(__dirname, '..') })
  try {
    const response = new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject) })
    worker.postMessage({ requestId: 42, input: { subjects: [s('A')], statusMap: {}, targetPeriod: { year: 2027, term: '1C' }, selectedCodes: [], desiredCount: 1 } })
    const result = await response
    assert.ok(result.threadId > 0)
    assert.equal(result.value.requestId, 42)
    assert.deepEqual(result.value.result.suggestedCodes, ['A'])
    assert.equal(result.value.comparison.valid, true)
  } finally { await worker.terminate() }
})

test('unknown durations give grouped coverage warning and useful additional completion impact', () => {
  const h = plannerHarness([s('A', { durationPeriods: undefined }), s('B', { durationPeriods: undefined }), s('C', { prereqs: ['A', 'B'] })], { selectedCodes: ['A', 'B'] })
  const impact = text(section(h, 'Impacto de tu selección'))
  assert.match(impact, /Nuevas habilitaciones al cierre 0/)
  assert.match(impact, /Al completar las cursadas 1 adicionales/)
  assert.match(impact, /Análisis parcial: no conocemos la duración de 2 materias seleccionadas/)
  assert.equal((h.text().match(/Análisis parcial:/g) || []).length, 1)
  assert.match(impact, /Contribución conjunta: Materia A, Materia B/)
  const card = nodes(section(h, 'Materias disponibles')).find(n => n.props.className?.startsWith('planner-subject'))
  assert.match(text(card), /Inicio no confirmado Duración no informada/)
  assert.doesNotMatch(text(card), /El catálogo no confirma|Análisis parcial/)
  assert.match(text(section(h, 'Mi selección')), /Válida académicamente/)
})
test('why detail lists close and completion targets once in disjoint categories', () => {
  const h = plannerHarness([s('A'), s('B', { durationPeriods: undefined }), s('C', { prereqs: ['A'] }), s('D', { prereqs: ['A', 'B'] })], { selectedCodes: ['A', 'B'] })
  const detail = nodes(section(h, 'Impacto de tu selección')).find(n => n.type === 'details')
  assert.match(text(detail), /Cursadas consideradas completadas al cierre: Materia A/)
  assert.match(text(detail), /Fuera del cierre por duración anual o no informada: Materia B/)
  const sections = nodes(detail).filter(n => n.type === 'section')
  assert.equal(sections.length, 2)
  assert.match(text(sections[0]), /Habilitaciones al cierre del período Materia C/)
  assert.doesNotMatch(text(sections[0]), /Materia D/)
  assert.match(text(sections[1]), /Habilitaciones adicionales al completar las cursadas \(sin fecha\) Materia D/)
  assert.doesNotMatch(text(sections[1]), /Materia C/)
})
test('annual with no downstream effects shows commitment instead of plus zero', () => {
  const h = plannerHarness([s('A', { durationPeriods: 2 })], { selectedCodes: ['A'] })
  assert.match(h.text(), /Incluye 1 materia anual: requiere completar toda la cursada/)
  assert.doesNotMatch(h.text(), /\+\s*0|0 habilitaciones adicionales al completar las anuales/)
})
test('worker comparison describes improvement from unknown duration as completion without date', () => {
  const h = plannerHarness([s('A'), s('B', { durationPeriods: undefined }), s('C', { prereqs: ['B'] })], { selectedCodes: ['A'], desiredCount: 1 })
  h.click('Sugerir cursada'); h.complete()
  const comparison = text(section(h, 'Comparación de selecciones'))
  assert.match(comparison, /1 habilitaciones adicionales al completar las cursadas, sin fecha/)
  assert.match(comparison, /Habilitaciones al cierre ganadas: Ninguna/)
  assert.match(comparison, /Habilitaciones adicionales al completar las cursadas \(sin fecha\) ganadas: Materia C/)
  assert.match(h.text(), /Prioriza habilitaciones al cierre y luego el impacto al completar las cursadas sin asignar fecha/)
  assert.deepEqual(h.props.selectedCodes, ['A'])
  h.click('Usar sugerencia'); assert.deepEqual(plain(h.props.selectedCodes), ['B'])
})
test('new four-metric summary retains responsive columns and keyboard detail', () => {
  const h = plannerHarness([s('A')])
  const summary = nodes(h.render()).find(n => n.props.className === 'planner-summary')
  assert.equal(nodes(summary).filter(n => n.type === 'article').length, 4)
  assert.match(source('src/styles.css'), /max-width: 640px[\s\S]*planner-intelligent \.planner-summary \{ grid-template-columns: 1fr/)
  assert.ok(nodes(h.render()).some(n => n.type === 'summary' && text(n) === '¿Por qué?'))
})
