const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { harness, nodes, text } = require('./academic-onboarding-ui-harness.cjs')
const { fixture, career } = require('./academic-onboarding-persistence-harness.cjs')
async function setup(model = 'legacy') {
  const f = fixture(model)
  const subjects = career.subjects.map(s => ({ ...s, name: `Materia ${s.code}`, year: 1, term: 'Anual' }))
  const parent = harness('src/components/AcademicOnboarding.jsx', 'AcademicOnboarding', { ...f.api, AcademicOnboardingMobile: 'mobile' })
  const props = { career: { ...career, subjects }, source: { createOnboarding: f.controller }, onExit() {} }
  const render = () => parent.render(props)
  const click = (tree, name) => { const b = nodes(tree).find(n => n.type === 'button' && (n.props['aria-label'] === name || text(n) === name)); assert.ok(b, name); assert.ok(!b.props.disabled); return b.props.onClick() }
  const settle = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); render() } }
  render(); await settle(); click(render(), 'Configurar mis materias →')
  const child = harness('src/components/AcademicOnboardingMobile.jsx', 'AcademicOnboardingMobile', f.api)
  const mobile = () => child.render(nodes(render()).find(n => n.type === 'mobile').props)
  const event = (x, y) => ({ isPrimary: true, button: 0, pointerId: 1, clientX: x, clientY: y, currentTarget: { setPointerCapture() {} } })
  const swipe = (x, y, cancel = false) => {
    const card = () => nodes(mobile()).find(n => n.type === 'article')
    card().props.onPointerDown(event(100, 100)); card().props.onPointerMove(event(100 + x, 100 + y))
    const preview = text(mobile())
    if (cancel) card().props.onPointerCancel(); else card().props.onPointerUp(event(100 + x, 100 + y))
    return preview
  }
  return { f, props, render, mobile, click, swipe, settle, draft: () => nodes(render()).find(n => n.type === 'mobile').props.draft }
}
for (const [state, x, y] of [['Aprobada', 80, 0], ['Pendiente', -80, 0], ['Cursando', 0, -80], ['Regularizada', 0, 80]]) {
  test(`mobile ${state}: swipe equals accessible button; no transaction`, async () => {
    const a = await setup(), b = await setup()
    assert.match(a.swipe(x, y), new RegExp(state.toUpperCase()))
    b.click(b.mobile(), state)
    assert.equal(a.draft().decisions.B, state)
    assert.equal(b.draft().decisions.B, state)
    assert.equal(a.f.transactions + b.f.transactions, 0)
    assert.equal(a.draft().baseline.A, 'Pendiente')
  })
}
for (const [label, x, y, cancel] of [['short', 64, 0, false], ['diagonal', 80, 80, false], ['cancelled', 90, 0, true]]) {
  test(`mobile ${label} drag never decides`, async () => {
    const s = await setup(); s.swipe(x, y, cancel)
    assert.equal(Object.keys(s.draft().decisions).length, 0); assert.equal(s.f.transactions, 0)
  })
}
test('mobile skip, undo/redo and prior Pending protection share the desktop draft', async () => {
  const s = await setup()
  assert.equal(nodes(s.mobile()).find(n => n.type === 'article').props['aria-label'], 'Materia actual: Materia B')
  s.click(s.mobile(), 'Omitir →'); assert.equal(Object.keys(s.draft().decisions).length, 0)
  s.click(s.mobile(), 'Pendiente')
  s.click(s.render(), '← Volver a editar')
  s.click(s.mobile(), '↶ Deshacer'); assert.equal(Object.keys(s.draft().decisions).length, 0)
  s.click(s.mobile(), '↷ Rehacer'); assert.equal(s.draft().decisions.C, 'Pendiente')
  assert.equal(s.f.transactions, 0)
})
for (const model of ['legacy', 'instances']) test(`mobile ${model} review and explicit confirm use existing real controller`, async () => {
  const s = await setup(model)
  s.click(s.mobile(), 'Aprobada'); s.click(s.mobile(), 'Cursando')
  assert.match(text(s.render()), /Revisá tu punto de partida/); assert.equal(s.f.transactions, 0)
  await s.click(s.render(), 'Confirmar y guardar ✓'); await s.settle()
  assert.match(text(s.render()), /Tu progreso quedó guardado/)
  assert.deepEqual(s.f.data.get(s.f.target).statusMap, { A: 'Pendiente', OLD: 'Regularizada', B: 'Aprobada', C: 'Cursando' })
})
test('mobile source replacement removes editable cards; permission error remains fail closed', async () => {
  const s = await setup(); s.click(s.mobile(), 'Aprobada'); s.click(s.mobile(), 'Revisar decisiones')
  s.f.writeError = { code: 'permission-denied' }
  await s.click(s.render(), 'Confirmar y guardar ✓'); await s.settle()
  assert.doesNotMatch(text(s.render()), /Tu progreso quedó guardado/)
  assert.equal(s.f.writes.length, 0)
  s.props.source = { createOnboarding: s.f.controller }; s.render(); await s.settle()
  assert.equal(nodes(s.render()).filter(n => n.type === 'mobile').length, 0)
})
test('mobile CSS confines gestures, keeps desktop and respects reduced motion', () => {
  const css = fs.readFileSync('src/components/AcademicOnboardingMobile.css', 'utf8')
  assert.match(css, /@media\(max-width:600px\)/)
  assert.match(css, /\.desktop-editor\{display:none\}/)
  assert.match(css, /touch-action:none/)
  assert.match(css, /prefers-reduced-motion:reduce/)
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/)
})
