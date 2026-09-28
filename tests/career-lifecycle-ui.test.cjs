const { test } = require('node:test')
const assert = require('node:assert/strict')
const { harness, nodes, text } = require('./lifecycle-ui-harness.cjs')
const careers = require('./projection-catalogs.cjs')()
const row = (index = 0, lifecycle = 'active') => ({ careerInstanceId: `opaque-${index}`, catalogId: careers[index].id, lifecycle })
function setup(instances = []) {
  const calls = []
  const bridge = { authority: 'instances', phase: 'complete', instances, activeCareerInstanceId: null,
    capabilities: { academicWrite: true }, lifecycle: Object.fromEntries(['add', 'select', 'archive', 'restore'].map(op => [op, async id => calls.push([op, id])])) }
  const h = harness('src/components/MyCareers.jsx', 'MyCareers')
  return { bridge, calls, render: () => h.render({ bridge, careers }) }
}
const button = (tree, label) => nodes(tree).find(n => n.type === 'button' && text(n) === label)
const choose = (s, id) => nodes(s.render()).find(n => n.type === 'select').props.onChange({ target: { value: id } })
const submit = s => nodes(s.render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
const tick = async () => { await Promise.resolve(); await Promise.resolve() }

test('zero careers offers explicit add, no selection and no implicit mutation', async () => {
  const s = setup(); assert.match(text(s.render()), /Todavía no agregaste/)
  assert.equal(button(s.render(), 'Agregar carrera').props.disabled, true)
  assert.deepEqual(s.calls, [])
  choose(s, careers[0].id); submit(s); await tick()
  assert.deepEqual(s.calls, [['add', careers[0].id]])
  assert.match(text(s.render()), /Seleccionala/)
})
test('real registry renders all university/career/plan options including distinct UTN plans', () => {
  const s = setup(), options = nodes(s.render()).filter(n => n.type === 'option')
  assert.equal(options.length, careers.length + 1)
  for (const career of careers) {
    const label = text(options.find(n => n.props.value === career.id))
    assert.ok(label.includes(career.university) && label.includes(career.name) && label.includes(career.plan))
  }
})
test('one and multiple universities retain explicit selection, no fallback', async () => {
  for (const rows of [[row()], [row(), row(2), row(5)]]) {
    const s = setup(rows); assert.equal(s.calls.length, 0)
    assert.ok(!text(s.render()).includes('Seleccionada actualmente'))
    await button(s.render(), 'Seleccionar').props.onClick()
    assert.deepEqual(s.calls, [['select', rows[0].careerInstanceId]])
    s.bridge.activeCareerInstanceId = rows[0].careerInstanceId
    assert.equal(button(s.render(), 'Seleccionar').props.disabled, true)
    assert.match(text(s.render()), /Seleccionada actualmente/)
  }
})
test('active and archived catalogs cannot be added again; archive restores same opaque identity', async () => {
  const s = setup([row(), row(1, 'archived')])
  for (const index of [0, 1]) assert.equal(nodes(s.render()).find(n => n.type === 'option' && n.props.value === careers[index].id).props.disabled, true)
  choose(s, careers[1].id); submit(s); assert.equal(s.calls.length, 0)
  await button(s.render(), 'Restaurar').props.onClick()
  assert.deepEqual(s.calls, [['restore', 'opaque-1']])
  assert.match(text(s.render()), /compartir sigue desactivado/)
})
test('archive requires explicit confirmation, supports cancellation and preserves explanatory text', async () => {
  const s = setup([row()])
  button(s.render(), 'Archivar').props.onClick(); assert.deepEqual(s.calls, [])
  assert.match(text(s.render()), /Se conservarán el progreso/)
  button(s.render(), 'Cancelar').props.onClick(); assert.equal(button(s.render(), 'Confirmar archivo'), undefined)
  button(s.render(), 'Archivar').props.onClick()
  await button(s.render(), 'Confirmar archivo').props.onClick()
  assert.deepEqual(s.calls, [['archive', 'opaque-0']])
})
test('double click submits one request; pending disables controls', async () => {
  const s = setup(); let finish
  s.bridge.lifecycle.add = id => { s.calls.push(id); return new Promise(resolve => { finish = resolve }) }
  choose(s, careers[0].id); submit(s); submit(s)
  assert.equal(s.calls.length, 1); assert.equal(button(s.render(), 'Agregar carrera').props.disabled, true)
  assert.match(text(s.render()), /Guardando cambios/)
  finish(); await tick(); assert.equal(nodes(s.render()).find(n => n.type === 'select').props.disabled, false)
})
for (const code of ['DUPLICATE_CATALOG_INSTANCE', 'PERMISSION_DENIED', 'PERSISTENCE_UNAVAILABLE', 'INVALID_INPUT']) test(`UI handles ${code} without exposing SDK details`, async () => {
  const s = setup(); s.bridge.lifecycle.add = async () => { throw { code, message: 'secret/technical/path' } }
  choose(s, careers[0].id); submit(s); await tick()
  assert.ok(nodes(s.render()).some(n => n.props.role === 'alert'))
  assert.ok(!text(s.render()).includes('secret')); assert.equal(nodes(s.render()).find(n => n.type === 'select').props.disabled, false)
})
for (const authority of ['legacy', 'frozen', 'invalid', 'loading']) test(`no lifecycle actions for ${authority}`, () => {
  const s = setup([row()]); s.bridge.authority = authority
  assert.equal(nodes(s.render()).filter(n => n.type === 'button' || n.type === 'select').length, 0)
  assert.equal(s.calls.length, 0)
})
test('blocked instances cannot mutate; unknown catalog hides internal identifiers', () => {
  const s = setup([{ ...row(), catalogId: 'unknown-secret-id' }])
  assert.ok(!text(s.render()).includes('unknown-secret-id')); assert.equal(button(s.render(), 'Seleccionar').props.disabled, true)
  s.bridge.phase = 'blocked'; assert.equal(button(s.render(), 'Archivar'), undefined)
})
