const { test } = require('node:test'), assert = require('node:assert/strict')
const { harness, nodes, text } = require('./academic-onboarding-ui-harness.cjs')
const { finalGradeSummary } = require('./final-grades-harness.cjs')()
function fixture() {
  let emitGrades, emitProgress, fail, operation = async () => {}
  const saves = [], subjects = [{ code: 'A', name: 'Algebra' }, { code: 'B', name: 'Fisica' }]
  const source = { createFinalGrades: () => ({ subscribe(next, error) { emitGrades = next; fail = error; return () => {} },
    async save(...args) { saves.push(args); await operation() } }), subscribe(next) { emitProgress = next; return () => {} } }
  const h = harness('src/components/FinalGrades.jsx', 'FinalGrades', { finalGradeSummary })
  let props = { source, subjects, editable: true, subjectCode: 'A' }
  const render = () => h.render(props)
  render(); emitGrades({}); emitProgress({ statusMap: { A: 'Aprobada', B: 'Pendiente' } }); render()
  return { h, source, saves, render, grades: value => emitGrades(value), progress: statusMap => emitProgress({ statusMap }), fail: error => fail(error),
    operation(fn) { operation = fn }, props(value) { props = { ...props, ...value } },
    select(value) { nodes(render()).find(n => n.type === 'select').props.onChange({ target: { value } }) },
    save() { return nodes(render()).find(n => n.type === 'button' && text(n) === 'Guardar nota').props.onClick() } }
}
test('private UI, optional grade, no automatic write; explicit save and null deletion', async () => {
  const f = fixture(); assert.match(text(f.render()), /Nota final/)
  assert.equal(nodes(f.render()).filter(n => n.type === 'select').length, 1)
  f.select('8'); assert.equal(f.saves.length, 0); await f.save()
  assert.deepEqual(f.saves[0], ['A', 8, null])
  f.grades({ A: { grade: 8, revision: 1 } }); f.select(''); await f.save()
  assert.deepEqual(f.saves[1], ['A', null, 1]); f.h.stop()
})
test('dirty draft keeps original null revision when another tab creates note; double submission blocked', async () => {
  const f = fixture(); f.select('8'); f.grades({ A: { grade: 9, revision: 1 } }); f.select('7')
  let resolve; f.operation(() => new Promise(r => { resolve = r }))
  const first = f.save(); await f.save(); assert.equal(f.saves.length, 1)
  assert.equal(f.saves[0][2], null); resolve(); await first; f.h.stop()
})
test('reset/downgrade excludes retained grade; Dashboard is readonly', () => {
  const f = fixture(); f.grades({ A: { grade: 8, revision: 1 } }); f.props({ editable: false }); assert.match(text(f.render()), /1 de 1/)
  f.progress({}); assert.match(text(f.render()), /0 de 0/); f.props({ editable: true }); assert.match(text(f.render()), /Conservada/)
  const select = nodes(f.render()).find(n => n.type === 'select')
  assert.ok(select.children.filter(n => n.props?.value !== '').every(n => n.props.disabled))
  f.props({ editable: false }); assert.equal(nodes(f.render()).filter(n => n.type === 'select').length, 0); f.h.stop()
})
test('read failures never show fake zero average; conflict requires explicit refresh', async () => {
  const f = fixture(); f.fail(Error('read unavailable'))
  assert.ok(nodes(f.render()).some(n => n.props.role === 'alert')); assert.doesNotMatch(text(f.render()), /0 de 0/); f.h.stop()
  const c = fixture(); c.select('8'); c.operation(async () => { throw Error('GRADE_CONFLICT') }); await c.save()
  assert.match(text(c.render()), /otra pestaña/); assert.equal(nodes(c.render()).filter(n => n.type === 'select').length, 0); c.h.stop()
})
test('context change hides old notes and ignores completion from old source', async () => {
  const f = fixture(); f.select('8'); let resolve; f.operation(() => new Promise(r => { resolve = r }))
  const pending = f.save(); f.props({ source: { ...f.source } }); f.render(); resolve(); await pending
  assert.doesNotMatch(text(f.render()), /Nota guardada/); f.h.stop()
})
test('compact dashboard has empty dash, coverage and no permanent form', () => {
  const f = fixture(); f.props({ editable: false })
  assert.match(text(f.render()), /\u2014/)
  assert.match(text(f.render()), /0 de 1 aprobadas con nota/)
  assert.match(text(f.render()), /Privado/)
  assert.equal(nodes(f.render()).filter(n => n.type === 'select').length, 0)
  f.grades({ A: { grade: 8, revision: 1 } })
  assert.match(text(f.render()), /8,00/); f.h.stop()
})
test('subject cards expand inline without opening detail and hide retained grades', () => {
  let opened, editorCalls = 0
  const h = harness('src/components/SubjectCard.jsx', 'SubjectCard', {
    STATUS: [], getStatus: m => m.A, canCourse: () => true, canTakeFinal: () => true,
    unlocks: () => [], getSubjectLevel: () => '1', missingCoursePrereqs: () => ({}), missingFinalPrereqs: () => [],
    SubjectModal: props => ({ type: 'modal', props, children: [] }),
  })
  const props = { subject: { code: 'A', name: 'Algebra' }, subjects: [], statusMap: { A: 'Aprobada' }, expanded: null,
    setExpanded: code => { opened = code }, gradesUI: { toggle: code => { props.gradesUI.inlineCode = code }, ready: true, grades: { A: { grade: 8 } }, editor: () => { editorCalls++; return 'editor' } } }
  assert.match(text(h.render(props)), /Nota final: 8/)
  assert.equal(editorCalls, 0)
  props.statusMap = { A: 'Pendiente' }; assert.doesNotMatch(text(h.render(props)), /Nota final: 8|Agregar nota/)
  props.statusMap = { A: 'Aprobada' }; props.gradesUI.grades = {}
  nodes(h.render(props)).find(n => n.type === 'button' && text(n) === '+ Agregar nota').props.onClick({ stopPropagation() {} })
  assert.equal(opened, undefined)
  assert.equal(props.gradesUI.inlineCode, 'A')
  assert.match(text(h.render(props)), /editor/)
  props.expanded = 'A'; assert.equal(nodes(h.render(props)).find(n => n.type === 'modal').props.gradeEditor, 'editor')
  h.stop()
})

test('inline cancel discards draft without write; compact save and clear retain CAS', async () => {
  const f = fixture(); let ui
  f.props({ children: value => { ui = value; return value.editor('A', true) } })
  f.render(); ui.toggle('A'); f.select('9')
  nodes(f.render()).find(n => n.type === 'button' && text(n) === 'Cancelar').props.onClick()
  f.render(); assert.equal(ui.inlineCode, null); assert.equal(f.saves.length, 0)
  assert.equal(nodes(f.render()).find(n => n.type === 'select').props.value, '')
  ui.toggle('A'); f.select('8')
  await nodes(f.render()).find(n => n.type === 'button' && text(n) === 'Guardar').props.onClick()
  assert.deepEqual(f.saves[0], ['A', 8, null]); assert.match(text(f.render()), /Nota guardada/)
  f.grades({ A: { grade: 8, revision: 1 } }); f.select('')
  await nodes(f.render()).find(n => n.type === 'button' && text(n) === 'Guardar').props.onClick()
  assert.deepEqual(f.saves[1], ['A', null, 1]); f.h.stop()
})

test('successful inline save closes, waits for confirmed snapshot and reopens saved value', async () => {
  const f = fixture(); let ui
  f.props({ children: value => { ui = value; return value.editor('A', true) } })
  f.render(); ui.toggle('A'); f.select('7')
  let resolve; f.operation(() => new Promise(r => { resolve = r }))
  const clickSave = () => nodes(f.render()).find(n => n.type === 'button' && text(n) === 'Guardar').props.onClick()
  const saving = clickSave(); f.render(); ui.toggle('A'); await clickSave()
  assert.equal(ui.inlineCode, 'A'); assert.equal(f.saves.length, 1)
  resolve(); await saving; f.render()
  assert.equal(ui.inlineCode, null); assert.equal(ui.pending, true)
  ui.toggle('A'); f.render(); assert.equal(ui.inlineCode, null)
  f.grades({ A: { grade: 7, revision: 1 } }); f.render(); ui.toggle('A'); f.render()
  assert.equal(ui.inlineCode, 'A'); assert.equal(ui.pending, false)
  assert.equal(nodes(f.render()).find(n => n.type === 'select').props.value, '7')
  f.h.stop()
})
test('failed inline save stays open with error', async () => {
  const f = fixture(); let ui
  f.props({ children: value => { ui = value; return value.editor('A', true) } })
  f.render(); ui.toggle('A'); f.select('7'); f.operation(async () => { throw Error('GRADE_CONFLICT') })
  await nodes(f.render()).find(n => n.type === 'button' && text(n) === 'Guardar').props.onClick()
  assert.ok(nodes(f.render()).some(n => n.props.role === 'alert'))
  assert.equal(ui.inlineCode, 'A'); f.h.stop()
})
