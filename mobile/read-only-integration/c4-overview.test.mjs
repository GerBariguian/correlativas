import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire, registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { catalogHeading, groupRowsByYear, academicPanelModel, labScope, workspaceKey } from './c4-ui-model.mjs'
import { academicViewModel } from './academicViewModel.mjs'
import { queryIdentity } from './academicQueryController.mjs'
import { C4_UI_FILES, assertC4UISource } from './importPolicy.c4-ui.mjs'
const require = createRequire(import.meta.url), connectionId = {}
const docs = require('../emulator-lab/fixtures.cjs').fixtureDocuments({ fromMillis: ms => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 }) })
const S = labScope('lab-instances', 'systems'), I = labScope('lab-instances', 'industrial'), A = labScope('lab-instances', 'archived'), L = labScope('lab-legacy', 'systems')
function model(scope = S, state = 'loaded') {
  const d = docs[scope.model === 'legacy' ? `users/${scope.uid}/careers/${scope.id}` : `users/${scope.uid}/careerInstances/${scope.id}/academic/progress`]
  return academicViewModel({ scope, connectionId, connectionCurrent: true, snapshot: {
    state, scope, connectionId, key: queryIdentity(scope).key,
    progress: d ? { statusMap: d.statusMap, revision: scope.model === 'legacy' ? null : d.revision } : null,
  } })
}
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(new URL('../../src/', import.meta.url).href) && specifier.startsWith('.') && !/\.[A-Za-z]+$/.test(specifier)) return next(specifier + '.js', context)
  return next(specifier, context)
}, load(url, context, next) {
  if (url.startsWith(new URL('.', import.meta.url).href) && url.endsWith('.jsx')) {
    const { transformSync } = require('rolldown/utils')
    return { format: 'module', source: transformSync(new URL(url).pathname, readFileSync(new URL(url), 'utf8'), { jsx: { runtime: 'classic' } }).code, shortCircuit: true }
  }
  return next(url, context)
} })
const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server')
const { C4Home } = await import('./C4Home.jsx'), { C4Map, C4MapBoard } = await import('./C4Map.jsx'), { C4SubjectDetail } = await import('./C4Subjects.jsx')
const render = (component, props) => renderToStaticMarkup(React.createElement(component, { refresh() {}, ...props }))

test('career and plan labels use exact local UTN descriptors, without fallback', () => {
  assert.equal(catalogHeading(S.catalogId).name, 'Ingeniería en Sistemas de Información')
  assert.equal(catalogHeading(I.catalogId).plan, 'I-23 (2023)'); assert.equal(catalogHeading(A.catalogId).plan, '2007')
  assert.equal(catalogHeading('unknown'), null); assert.equal(catalogHeading('toString'), null)
})
test('home summarizes only the four explicit systems records, without percentages', () => {
  const html = render(C4Home, { model: model(), scope: S })
  assert.match(html, /Ingeniería en Sistemas de Información/); assert.match(html, /Plan 2023/)
  for (const state of ['Aprobada', 'Regularizada', 'Cursando', 'Pendiente']) assert.ok(html.includes(`aria-label="${state}: 1 registrada"`))
  assert.match(html, /4 actividades con estado registrado/); assert.match(html, /40 sin registro académico/)
  assert.doesNotMatch(html, /role="progressbar"|aria-valuenow|\d+(?:[.,]\d+)?\s*%|Habilitada para cursar/)
})
test('empty industrial progress has zero registered states and 45 unrecorded activities', () => {
  const html = render(C4Home, { model: model(I), scope: I })
  for (const state of ['Aprobada', 'Regularizada', 'Cursando', 'Pendiente']) assert.ok(html.includes(`aria-label="${state}: 0 registrada"`))
  assert.match(html, /45 sin registro académico/); assert.match(html, /No hay estados registrados/)
  assert.match(html, /Plan I-23 \(2023\)/)
})
test('grouping preserves every catalog row and original order within each year', () => {
  for (const scope of [S, I]) {
    const view = model(scope), groups = groupRowsByYear(view)
    assert.deepEqual(groups.map(g => g.year), [1, 2, 3, 4, 5])
    assert.equal(groups.flatMap(g => g.rows).length, view.counts.total)
    assert.equal(new Set(groups.flatMap(g => g.rows).map(row => row.code)).size, view.counts.total)
    for (const group of groups) assert.deepEqual(group.rows, view.rows.filter(row => row.year === group.year))
  }
})
test('map renders 44/45 nodes with explicit recorded and unrecorded labels', () => {
  for (const [scope, total, unrecorded] of [[S, 44, 40], [I, 45, 45]]) {
    const html = render(C4Map, { model: model(scope), scope })
    assert.equal((html.match(/class="c4-map-node/g) ?? []).length, total)
    assert.equal((html.match(/class="c4-status unrecorded"/g) ?? []).length, unrecorded + 1) // plus legend
    assert.match(html, /5° año/); assert.doesNotMatch(html, /Agregar al plan|Editar estado|Guardar/)
  }
  const selected = render(C4MapBoard, { model: model(), selected: 'UTN-ISI23-01', onSelect() {} })
  assert.match(selected, /c4-map-node is-selected/)
})
test('map detail retains ALL, omitted requirements and source arrays without evaluating them', () => {
  const industrial = model(I)
  assert.deepEqual(groupRowsByYear(industrial).flatMap(g => g.rows).find(row => row.code === '032596').finalPrereqs, ['ALL'])
  const all = render(C4SubjectDetail, { model: industrial, code: '032596', onClose() {} })
  assert.match(all, /ALL: requisito global/)
  const omitted = render(C4SubjectDetail, { model: industrial, code: '950702', onClose() {} })
  assert.match(omitted, /No informado en el catálogo/)
  for (const row of groupRowsByYear(model()).flatMap(g => g.rows)) {
    assert.deepEqual(row.prereqs, row.subject.prereqs)
    assert.deepEqual(row.approvedPrereqs, row.subject.approvedPrereqs)
    assert.deepEqual(row.finalPrereqs, row.subject.finalPrereqs)
  }
})
test('all non-loaded states hide summary and map nodes, even with stale data attached', () => {
  for (const state of ['idle', 'loading', 'absent', 'error', 'blocked', 'archived']) {
    const stale = { ...model(), state, reason: 'INSTANCE_MISSING' }
    for (const component of [C4Home, C4Map]) {
      const html = render(component, { model: stale, scope: S })
      assert.doesNotMatch(html, /c4-map-node|c4-home-stat|4 actividades con estado registrado|UTN-ISI23-01/)
      assert.match(html, new RegExp('LECTURA ACADÉMICA · ' + state))
    }
    assert.deepEqual(groupRowsByYear(stale), [])
  }
})
test('panels reject loaded data from another owner, model, instance or catalog', () => {
  for (const scope of [I, { ...S, uid: 'lab-empty' }, L, { ...S, id: 'other' }, { ...S, catalogId: I.catalogId }]) {
    assert.equal(academicPanelModel(model(), scope).state, 'error')
    for (const component of [C4Home, C4Map]) {
      const html = render(component, { model: model(), scope })
      assert.match(html, /C4_PANEL_SCOPE_MISMATCH/); assert.doesNotMatch(html, /c4-map-node|c4-home-stat/)
    }
  }
  assert.notEqual(workspaceKey(1, S), workspaceKey(2, S))
  assert.equal(render(C4Home, { model: model(L), scope: L }).includes('Revisión null'), true)
})
test('new panels have no read capability; shell keeps exactly one session and hook', () => {
  for (const filename of ['C4Home.jsx', 'C4Map.jsx', 'C4AcademicState.jsx']) {
    const url = new URL(filename, import.meta.url), source = readFileSync(url, 'utf8')
    assert.ok(C4_UI_FILES.some(id => id.endsWith('/' + filename)))
    assertC4UISource(source, url.pathname.replace(/^\/([A-Za-z]:)/, '$1'))
    assert.doesNotMatch(source, /useAcademicRead|connectAcademicLab|readProgress|firebase|onSnapshot|setInterval|fetch\s*\(/)
  }
  const app = readFileSync(new URL('./C4App.jsx', import.meta.url), 'utf8')
  assert.equal((app.match(/\buseAcademicRead\s*\(/g) ?? []).length, 1)
  assert.equal((app.match(/\bcreateAcademicSessionController\s*\(/g) ?? []).length, 1)
  for (const section of ['Inicio', 'Materias', 'Mapa']) assert.ok(app.includes(`hidden={page !== '${section}'}`))
  assert.ok(app.includes('<C4Map key={workspaceKey(epoch, scope)}'))
})
