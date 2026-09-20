const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { transformSync } = require('rolldown/utils')
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
const clean = text => text.replace(/import[^\n]*\n/g, '').replace(/export default /g, '').replace(/export /g, '')
const subject = (code, extra = {}) => ({ code, name: `Materia ${code}`, prereqs: [], ...extra })
const props = (subjects, statusMap = {}) => ({ career: { id: 'test', name: 'Carrera', plan: '1', subjects }, statusMap })
function harness(input) {
  const slots = []; let cursor = 0; let calls = 0
  const api = {
    Date, Fragment: 'fragment',
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next }]
    },
    useMemo: fn => fn(),
    h: (type, props, ...children) => typeof type === 'function' ? type({ ...props, children: children.flat(Infinity) })
      : { type, props: props || {}, children: children.flat(Infinity) },
  }
  vm.createContext(api)
  for (const file of ['src/logic.js', 'src/projectionLogic.js']) vm.runInContext(clean(source(file)), api)
  const engine = api.projectCareer
  api.projectCareer = input => { calls++; return engine(input) }
  vm.runInContext(transformSync('page.jsx', clean(source('src/components/CareerProjectionPage.jsx')),
    { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' } }).code, api)
  const render = () => { cursor = 0; return api.CareerProjectionPage(input) }
  const nodes = node => node && typeof node === 'object' ? [node, ...(node.children || []).flatMap(nodes)] : []
  const text = node => node && typeof node === 'object' ? (node.children || []).map(text).join(' ').replace(/\s+/g, ' ').trim() : typeof node === 'string' || typeof node === 'number' ? String(node) : ''
  const generate = () => nodes(render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
  return { render, nodes, text, generate, calls: () => calls,
    load(value) { nodes(render()).find(n => n.props.type === 'radio' && n.props.value === value).props.onChange() },
    start(year, term = '1C') {
      nodes(render()).find(n => n.props.type === 'number').props.onChange({ target: { value: String(year) } })
      nodes(render()).find(n => n.type === 'select').props.onChange({ target: { value: term } })
    },
    edit(action, code, period) {
      const label = `${action} Materia ${code} ${action === 'Quitar' ? 'de' : 'a'} ${period}`
      nodes(render()).find(n => n.props['aria-label'] === label).props.onClick()
    },
  }
}

test('setup waits for explicit generation, defaults to four and displays estimated dates', () => {
  const h = harness(props([subject('A')]))
  const initial = h.render()
  assert.match(h.text(initial), /¿Con qué carga querés comenzar/)
  assert.equal(h.nodes(initial).find(n => n.props.type === 'radio' && n.props.checked).props.value, 4)
  assert.equal(h.calls(), 0)
  h.start(2030); h.generate()
  const text = h.text(h.render())
  assert.match(text, /Fin estimado de cursadas 1C 2030/)
  assert.match(text, /pendiente de planificar finales/)
  assert.match(text, /Al cierre: Regularizada/)
  assert.doesNotMatch(text, /Al cierre: Aprobada/)
})

test('manual add and remove recalculate without refilling or mutating real progress', () => {
  const input = props(['A', 'B', 'C', 'D', 'E'].map(c => subject(c)))
  Object.freeze(input.statusMap)
  const before = JSON.stringify(input), h = harness(input)
  h.start(2030); h.generate()
  assert.match(h.text(h.render()), /Fin estimado de cursadas 2C 2030/)
  h.edit('Agregar', 'E', '1C 2030')
  assert.match(h.text(h.render()), /Fin estimado de cursadas 1C 2030/)
  h.edit('Quitar', 'A', '1C 2030')
  assert.match(h.text(h.render()), /Fin estimado de cursadas 2C 2030/)
  const first = h.nodes(h.render()).find(n => n.type === 'article')
  assert.equal(h.nodes(first).filter(n => n.props['aria-label']?.startsWith('Quitar')).length, 4)
  assert.equal(JSON.stringify(input), before)
})

test('academic blockers and pending finals distinguish regularization from approval', () => {
  const h = harness(props([subject('A'), subject('B', { prereqs: ['A'] }), subject('C', { approvedPrereqs: ['A'] })], { A: 'Regularizada' }))
  h.generate()
  const text = h.text(h.render())
  assert.match(text, /Finales pendientes/)
  assert.match(text, /Final bloqueado/)
  assert.match(text, /Falta aprobar: Materia A/)
  assert.match(text, /No podés cursarlas todavía/)
  assert.match(text, /Materia C/)
})

test('annual project shows same code at start and continuation, with simulated completion', () => {
  const input = props([subject('3.4.100', { year: 5 })])
  input.career.id = 'uade-informatica'; input.career.plan = '1621'
  const h = harness(input); h.start(2030); h.generate()
  const text = h.text(h.render())
  assert.match(text, /Anual · inicio/)
  assert.match(text, /Anual · continuación/)
  assert.match(text, /Una misma materia ocupa ambos cuatrimestres/)
  assert.match(text, /Fin estimado de cursadas 2C 2030/)
})

test('completed career has meaningful summary and no semester cards', () => {
  const h = harness(props([subject('A')], { A: 'Aprobada' })); h.generate()
  const tree = h.render()
  assert.match(h.text(tree), /¡Carrera completada!/)
  assert.equal(h.nodes(tree).filter(n => n.type === 'article').length, 0)
})

test('existing in-progress course occupies a slot and regularizes at first close', () => {
  const h = harness(props([subject('A')], { A: 'Cursando' })); h.generate()
  const text = h.text(h.render())
  assert.match(text, /Cursando/)
  assert.match(text, /Al cierre: Regularizada/)
  assert.match(text, /1 materias/)
})

test('finals and subject details are collapsed and picker excludes impossible subjects', () => {
  const h = harness(props([subject('A'), subject('B', { prereqs: ['A'] })])); h.start(2030); h.generate()
  const tree = h.render()
  const finals = h.nodes(tree).find(n => n.type === 'details' && n.props.className?.includes('projection-finals'))
  assert.ok(finals); assert.ok(!finals.props.open)
  const first = h.nodes(tree).find(n => n.type === 'article')
  assert.ok(!h.nodes(first).some(n => n.props['aria-label'] === 'Agregar Materia B a 1C 2030'))
  assert.doesNotMatch(h.text(tree), /Habilitadas no incluidas|Capacidad de/)
  assert.ok(h.nodes(first).filter(n => n.type === 'details').every(n => !n.props.open))
})

test('a later manual choice losing its requirements is explained to the user', () => {
  const h = harness(props([subject('A'), subject('B', { prereqs: ['A'] }), subject('C')]))
  h.start(2030); h.generate()
  h.edit('Quitar', 'B', '2C 2030')
  h.edit('Agregar', 'B', '2C 2030')
  h.edit('Quitar', 'A', '1C 2030')
  assert.match(h.text(h.render()), /Decisiones que necesitan revisión/)
  assert.match(h.text(h.render()), /Falta regularizar: Materia A/)
})

test('current semester displays all five real courses and no editing with loads three and four', () => {
  for (const load of [3, 4]) {
    const subjects = Array.from({ length: 14 }, (_, i) => subject(String(i)))
    const statusMap = Object.fromEntries(subjects.slice(0, 5).map(s => [s.code, 'Cursando']))
    const h = harness(props(subjects, statusMap))
    h.start(2032, '2C'); h.load(load); h.generate()
    const cards = h.nodes(h.render()).filter(n => n.type === 'article')
    assert.match(h.text(cards[0]), /2C 2032 · En curso 5 materias reales/)
    assert.doesNotMatch(h.text(cards[0]), /Agregar materia|Mover aquí/)
    assert.equal(h.nodes(cards[0]).filter(n => n.type === 'button').length, 0)
    assert.equal(h.nodes(cards[0]).filter(n => n.props.className === 'projection-subject-row').length, 5)
    assert.match(h.text(cards[1]), new RegExp(`1C 2033 ${load} materias`))
  }
})

test('five-course proposal displays manual three then six with a moved future course', () => {
  const h = harness(props(['A','B','C','D','E','F','G'].map(c => subject(c))))
  h.start(2030); h.load(5); h.generate()
  for (const c of ['A','B']) h.edit('Quitar', c, '1C 2030')
  assert.match(h.text(h.nodes(h.render()).find(n => n.type === 'article')), /1C 2030 3 materias/)
  for (const c of ['A','B','F']) h.edit('Agregar', c, '1C 2030')
  assert.match(h.text(h.nodes(h.render()).find(n => n.type === 'article')), /1C 2030 6 materias/)
})

test('invalid generation displays explanation without summary, timeline or finals', () => {
  const h = harness(props([subject('A')], { A: 'unknown' })); h.generate()
  const tree = h.render()
  assert.match(h.text(tree), /No pudimos proyectar/)
  assert.doesNotMatch(h.text(tree), /Fin estimado de cursadas|0 cuatrimestres|Finales pendientes/)
  assert.equal(h.nodes(tree).filter(n => n.type === 'article').length, 0)
})
