const { test } = require('node:test')
const assert = require('node:assert/strict')
const { harness, nodes, text } = require('./academic-onboarding-ui-harness.cjs')
const { fixture, career } = require('./academic-onboarding-persistence-harness.cjs')
const button = (tree, name) => nodes(tree).find(n => n.type === 'button' && text(n) === name)
function setup(model = 'legacy') {
  const f = fixture(model)
  const catalog = { ...career, name: 'Carrera de prueba', university: 'Universidad', plan: '2026', subjects: career.subjects.map((s, i) => ({ ...s, name: `Materia ${s.code}`, year: 1, term: i === 2 ? 'Anual' : '1C' })) }
  const ui = harness('src/components/AcademicOnboarding.jsx', 'AcademicOnboarding', f.api)
  let exits = 0
  const props = { career: catalog, source: { createOnboarding: f.controller }, onExit: () => { exits++ } }
  const render = () => ui.render(props)
  const settle = async () => { let tree; for (let i = 0; i < 15; i++) { await Promise.resolve(); tree = render() } return tree }
  const click = name => { const b = button(render(), name); assert.ok(b, name); assert.ok(!b.props.disabled, `${name} enabled`); return b.props.onClick() }
  const select = code => nodes(render()).find(n => n.type === 'input' && n.props['aria-label'] === `Seleccionar Materia ${code}`).props.onChange({ target: { checked: true } })
  return { f, props, ui, render, settle, click, select, exits: () => exits }
}
for (const model of ['legacy', 'instances']) test(`${model}: real controller saves only at final confirmation, then explicit exit`, async () => {
  const s = setup(model); assert.match(text(s.render()), /Cargando tu progreso/); await s.settle()
  assert.equal(s.f.transactions, 0)
  s.click('Configurar mis materias →')
  assert.match(text(s.render()), /Sin revisar/)
  const protectedInput = nodes(s.render()).find(n => n.type === 'input' && n.props['aria-label'] === 'Seleccionar Materia A')
  assert.equal(protectedInput.props.disabled, true)
  s.select('B'); s.select('C'); s.click('○ Pendiente')
  assert.match(text(s.render()), /2 de 2 materias configuradas/)
  assert.equal(s.f.transactions, 0)
  s.click('Revisar 2 cambios →'); assert.equal(s.f.transactions, 0)
  await s.click('Confirmar y guardar ✓'); await s.settle()
  assert.match(text(s.render()), /Tu progreso quedó guardado/)
  assert.deepEqual(s.f.data.get(s.f.target).statusMap, { A: 'Pendiente', OLD: 'Regularizada', B: 'Pendiente', C: 'Pendiente' })
  assert.equal(s.f.writes.length, 1); assert.equal(s.exits(), 0)
  s.click('Ir a mi carrera →'); assert.equal(s.exits(), 1)
})
test('group selection excludes stored Pending; undo, redo and correction preserve no-write draft', async () => {
  const s = setup(); s.render(); await s.settle(); s.click('Configurar mis materias →')
  nodes(s.render()).find(n => n.type === 'input' && n.props['aria-label'] === 'Seleccionar 1.º año · 1C').props.onChange({ target: { checked: true } })
  assert.match(text(s.render()), /1 seleccionadas/)
  s.click('✓ Aprobada'); s.click('↶ Deshacer'); assert.match(text(s.render()), /0 de 2 materias configuradas/)
  s.click('↷ Rehacer'); assert.match(text(s.render()), /1 de 2 materias configuradas/)
  s.click('↶ Deshacer'); s.select('B'); s.click('◷ Cursando')
  assert.equal(button(s.render(), '↷ Rehacer').props.disabled, true)
  s.click('Revisar 1 cambios →'); s.click('← Volver a editar')
  assert.match(text(s.render()), /Cursando/); assert.equal(s.f.transactions, 0)
})
for (const choice of ['Estoy empezando', 'Prefiero hacerlo después']) test(`${choice}: confirmation performs no write`, async () => {
  const s = setup(); s.render(); await s.settle()
  nodes(s.render()).find(n => n.type === 'button' && text(n).includes(choice)).props.onClick()
  s.click('Continuar sin cargar estados →'); await s.click('Continuar sin cambios →'); await s.settle()
  assert.equal(s.f.transactions, 0); assert.match(text(s.render()), /Tu progreso se mantiene intacto/)
})
test('read failure gates editing and retry loads confirmed progress', async () => {
  const s = setup(); s.f.readError = { code: 'permission-denied', message: 'private path' }
  s.render(); await s.settle()
  assert.match(text(s.render()), /No tenés permiso/); assert.doesNotMatch(text(s.render()), /private path/)
  assert.equal(button(s.render(), 'Configurar mis materias →'), undefined)
  s.f.readError = null; s.click('Recargar progreso'); await s.settle()
  assert.ok(button(s.render(), 'Configurar mis materias →')); assert.equal(s.f.transactions, 0)
})
for (const mode of ['conflict', 'permission']) test(`${mode}: save failure requires explicit reload, never automatic retry`, async () => {
  const s = setup('instances'); s.render(); await s.settle(); s.click('Configurar mis materias →'); s.select('B'); s.click('✓ Aprobada'); s.click('Revisar 1 cambios →')
  if (mode === 'conflict') s.f.change(s.f.target, { ...s.f.data.get(s.f.target), revision: 2, statusMap: { A: 'Pendiente', B: 'Cursando', OLD: 'Regularizada' } })
  else s.f.writeError = { code: 'permission-denied', message: 'private path' }
  await s.click('Confirmar y guardar ✓'); await s.settle()
  assert.match(text(s.render()), mode === 'conflict' ? /El progreso cambió/ : /No tenés permiso/)
  assert.equal(button(s.render(), 'Confirmar y guardar ✓'), undefined); assert.equal(s.f.transactions, 1)
  assert.equal(s.f.writes.length, 0)
  s.f.writeError = null; s.click('Recargar progreso'); await s.settle()
  assert.equal(s.f.transactions, 1)
})
test('double confirmation uses one transaction, disables fieldset and exit', async () => {
  const s = setup(); s.render(); await s.settle(); s.click('Configurar mis materias →'); s.select('B'); s.click('✓ Aprobada'); s.click('Revisar 1 cambios →')
  const confirm = button(s.render(), 'Confirmar y guardar ✓').props.onClick
  const first = confirm(), second = confirm()
  assert.equal(nodes(s.render()).find(n => n.type === 'fieldset').props.disabled, true)
  assert.equal(button(s.render(), 'Salir sin confirmar').props.disabled, true)
  await Promise.all([first, second]); await s.settle(); assert.equal(s.f.transactions, 1)
})
test('source replacement gates old draft; no automatic transfer or save', async () => {
  const s = setup(); s.render(); await s.settle(); s.click('Configurar mis materias →'); s.select('B')
  s.props.source = { createOnboarding: () => { throw Error('must not load replacement') } }
  await s.settle(); assert.match(text(s.render()), /cuenta o carrera cambió/)
  assert.equal(s.f.transactions, 0); assert.equal(button(s.render(), 'Confirmar y guardar ✓'), undefined)
})
test('late read after unmount does not create a writable UI or exit callback', async () => {
  const s = setup(); let resolve
  s.props.source = { createOnboarding: () => ({ load: () => new Promise(r => { resolve = r }) }) }
  s.render(); s.ui.stop(); resolve({}); await Promise.resolve()
  assert.equal(s.f.transactions, 0); assert.equal(s.exits(), 0)
})
test('late confirmation from previous source cannot show success after context replacement', async () => {
  const s = setup(); let finish
  const real = s.props.source.createOnboarding
  s.props.source = { createOnboarding: () => { const c = real(); return { load: c.load, confirm: () => new Promise(resolve => { finish = resolve }) } } }
  s.render(); await s.settle(); s.click('Configurar mis materias →'); s.select('B'); s.click('✓ Aprobada'); s.click('Revisar 1 cambios →')
  const pending = s.click('Confirmar y guardar ✓')
  s.props.source = { createOnboarding() { throw Error('new source must not load') } }; await s.settle()
  finish({ saved: true }); await pending; await s.settle()
  assert.doesNotMatch(text(s.render()), /Tu progreso quedó guardado/)
  assert.match(text(s.render()), /cuenta o carrera cambió/)
})
test('all actual catalog formats can be grouped for onboarding without invented periods', () => {
  const { api } = fixture()
  for (const catalog of require('./projection-catalogs.cjs')()) {
    const groups = api.groupOnboardingSubjects(catalog.subjects)
    assert.equal(groups.reduce((sum, group) => sum + group.codes.length, 0), catalog.subjects.length)
    for (const group of groups) assert.ok(catalog.subjects.some(s => (s.term ?? null) === group.period))
  }
})
test('annual and absent periods are shown literally, with no invented semester', async () => {
  const s = setup(); delete s.props.career.subjects[1].term
  s.render(); await s.settle(); s.click('Configurar mis materias →')
  assert.match(text(s.render()), /Anual/); assert.match(text(s.render()), /Período no especificado/)
})
