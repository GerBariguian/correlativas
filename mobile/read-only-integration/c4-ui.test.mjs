import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire, registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { filterSubjectRows, labScope, workspaceKey, SECTIONS, LAB_CONTEXTS, academicStateMessage, academicScreenModel } from './c4-ui-model.mjs'
import { academicViewModel } from './academicViewModel.mjs'
import { queryIdentity } from './academicQueryController.mjs'
import { C4_UI_GRAPH, C4_UI_FILES, assertC4UIModule, assertC4UISource } from './importPolicy.c4-ui.mjs'
const require = createRequire(import.meta.url)
const docs = require('../emulator-lab/fixtures.cjs').fixtureDocuments({ fromMillis: ms => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 }) })
const id = {}, S = labScope('lab-instances', 'systems'), I = labScope('lab-instances', 'industrial')
function model(scope = S, state = 'loaded') {
  const d = docs[`users/${scope.uid}/careerInstances/${scope.id}/academic/progress`]
  return academicViewModel({ scope, connectionId: id, connectionCurrent: true, snapshot: { state, scope, key: queryIdentity(scope).key, connectionId: id, progress: d && { revision: d.revision, statusMap: d.statusMap } } })
}
test('lab selector uses only exact existing fixture users and contexts; no silent fallback', () => {
  assert.deepEqual(Object.keys(LAB_CONTEXTS), ['lab-instances', 'lab-legacy', 'lab-empty', 'lab-blocked'])
  assert.equal(labScope('lab-legacy', 'systems').model, 'legacy')
  assert.equal(labScope('lab-legacy', 'absent').catalogId, 'utn-industrial-2023')
  assert.equal(labScope('lab-empty', 'systems').uid, 'lab-empty')
  assert.throws(() => labScope('production', 'systems')); assert.throws(() => labScope('lab-legacy', 'other'))
})
test('filters distinguish explicit Pending and unrecorded; combine search/year without mutating', () => {
  const view = model()
  assert.equal(filterSubjectRows(view).length, 44)
  assert.equal(filterSubjectRows(view, { status: 'Pendiente' }).length, 1)
  assert.equal(filterSubjectRows(view, { status: 'unrecorded' }).length, 40)
  assert.equal(filterSubjectRows(model(I), { status: 'Pendiente' }).length, 0)
  assert.equal(filterSubjectRows(model(I), { status: 'unrecorded' }).length, 45)
  assert.ok(filterSubjectRows(view, { query: 'analisis', year: '1' }).some(row => row.code === 'UTN-ISI23-01'))
  assert.equal(filterSubjectRows(view, { query: 'UTN-ISI23-04', status: 'Pendiente' }).length, 1)
  assert.equal(filterSubjectRows(view, { query: 'no match' }).length, 0)
  assert.equal(view.rows.length, 44)
})
test('context/connection changes produce different workspace keys, including returning A', () => {
  for (const scope of [I, { ...S, uid: 'lab-empty' }, labScope('lab-legacy', 'systems'), { ...S, catalogId: I.catalogId }]) {
    assert.notEqual(workspaceKey(1, S), workspaceKey(1, scope))
  }
  assert.notEqual(workspaceKey(1, S), workspaceKey(2, S))
})
test('every non-loaded state yields zero filtered rows and an explicit state message', () => {
  for (const state of ['idle', 'loading', 'absent', 'error', 'blocked', 'archived']) {
    const view = model(S, state); assert.deepEqual(filterSubjectRows(view), []); assert.ok(academicStateMessage(view)[0])
  }
  for (const state of ['loading', 'error']) {
    const screen = academicScreenModel({ state, code: 'C2_EMULATOR_UNAVAILABLE' }, model())
    assert.equal(screen.state, state); assert.deepEqual(screen.rows, []); assert.equal(screen.counts, null)
  }
})
test('UI graph rejects product modules, prototype App, storage, writers and extra catalogs', () => {
  for (const relative of ['../../src/firebase.js', '../../src/hooks/useAcademicBridge.js', '../../src/App.jsx', '../../prototypes/responsive-navigation/main.jsx', '../../mobile/integration-final/App.jsx', '../../src/data/uade/informatica.js']) {
    assert.throws(() => assertC4UIModule(new URL(relative, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), /OUTSIDE/)
  }
  for (const id of C4_UI_GRAPH) {
    const source = readFileSync(id, 'utf8'); assertC4UISource(source, id)
    if (id.endsWith('.html')) continue
    for (const [, specifier] of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
      if (!specifier.startsWith('.')) { assert.ok(['react', 'react-dom/client', 'firebase/app', 'firebase/auth', 'firebase/firestore'].includes(specifier)); continue }
      const target = new URL(/\.(?:js|jsx|mjs|css)$/.test(specifier) ? specifier : specifier + '.js', pathToFileURL(id))
      assertC4UIModule(target.pathname.replace(/^\/([A-Za-z]:)/, '$1'))
    }
  }
})
test('single persistent hook consumer; navigation and responsive CSS do not query', () => {
  const app = readFileSync(new URL('./C4App.jsx', import.meta.url), 'utf8')
  assert.equal((app.match(/\buseAcademicRead\s*\(/g) ?? []).length, 1)
  assert.match(app, /hidden=\{page !== 'Materias'\}/)
  assert.match(app, /key=\{workspaceKey\(epoch, scope\)\}/)
  assert.doesNotMatch(app, /addEventListener|matchMedia|ResizeObserver|onSnapshot|setInterval/)
  assert.deepEqual(SECTIONS, ['Inicio', 'Materias', 'Mapa', 'Planificar', 'Proyectar', 'Comunidad'])
  for (const id of C4_UI_FILES.filter(id => /\.(?:jsx|mjs)$/.test(id))) assert.doesNotMatch(readFileSync(id, 'utf8'), /\b(?:setDoc|updateDoc|deleteDoc|runTransaction)\s*\(/)
})

// Use installed Vite's JSX transform to exercise real React SSR without a DOM dependency.
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(new URL('../../src/', import.meta.url).href) && specifier.startsWith('.') && !/\.[A-Za-z]+$/.test(specifier)) return next(specifier + '.js', context)
  return next(specifier, context)
}, load(url, context, next) {
  if (url.startsWith(new URL('.', import.meta.url).href) && url.endsWith('.jsx')) {
    const file = new URL(url), source = require('node:fs').readFileSync(file, 'utf8')
    const { transformSync } = require('rolldown/utils')
    return { format: 'module', source: transformSync(file.pathname, source, { jsx: { runtime: 'classic' } }).code, shortCircuit: true }
  }
  return next(url, context)
} })
test('React SSR: subject counts, no editing, explicit states, static sections get no data', async () => {
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server')
  const { C4Subjects, C4SubjectDetail } = await import('./C4Subjects.jsx'), { C4StaticSection, default: App } = await import('./C4App.jsx')
  const html = renderToStaticMarkup(React.createElement(C4Subjects, { model: model(), refresh() {} }))
  assert.match(html, /44/); assert.match(html, /40/); assert.match(html, /Sin registro/); assert.match(html, /Pendiente/)
  assert.doesNotMatch(html, /Guardar|Editar estado|Agregar al plan/)
  const empty = renderToStaticMarkup(React.createElement(C4Subjects, { model: model(I), refresh() {} }))
  assert.equal((empty.match(/class="c4-status unrecorded"/g) ?? []).length, 45)
  for (const state of ['idle', 'loading', 'absent', 'error', 'blocked', 'archived']) {
    const markup = renderToStaticMarkup(React.createElement(C4Subjects, { model: model(S, state), refresh() {} }))
    assert.doesNotMatch(markup, /Análisis Matemático|UTN-ISI23-01|c4-subjects/)
  }
  for (const section of ['Planificar', 'Proyectar', 'Comunidad']) {
    const markup = renderToStaticMarkup(React.createElement(C4StaticSection, { section }))
    assert.match(markup, /PRÓXIMA INTEGRACIÓN|DEMOSTRACIÓN ESTÁTICA/); assert.doesNotMatch(markup, /lab-systems|UTN-ISI23|Aprobada/)
  }
  const detail = renderToStaticMarkup(React.createElement(C4SubjectDetail, { model: model(I), code: '950702', onClose() {} }))
  assert.match(detail, /Sin registro/); assert.match(detail, /No informado en el catálogo/); assert.match(detail, /Regularización para cursar/)
  assert.doesNotMatch(detail, /Guardar|Agregar al plan|Habilitada/)
  assert.equal(renderToStaticMarkup(React.createElement(C4SubjectDetail, { model: model(S, 'blocked'), code: 'UTN-ISI23-01' })), '')
  assert.equal(renderToStaticMarkup(React.createElement(C4SubjectDetail, { model: model(I), code: 'UTN-ISI23-01' })), '')
  const initial = renderToStaticMarkup(React.createElement(App))
  assert.match(initial, /Lecturas académicas iniciadas: 0/); assert.match(initial, /Sin conexión académica/)
})
