import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fixtureState, describeContext, changeContext, updateDemoRecord, SYSTEMS } from './contextModel.mjs'

// Load the real catalog source in memory, resolving its extensionless imports
// for Node. No repository files are rewritten and no browser/backend is used.
const root = new URL('../..', import.meta.url)
const text = (await fs.readFile(new URL('src/data/careers.js', root), 'utf8')).replace(/from\s+'(\.[^']+)'/g, (_, p) => `from '${new URL(`src/data/${p}.js`, root).href}'`)
const { careers } = await import('data:text/javascript,' + encodeURIComponent(text))
const c = state => describeContext(state, careers)
const act = (s, op, value) => changeContext(s, op, value, careers)

test('real catalogs expose eight distinct university/career/plan identities', () => {
  assert.equal(careers.length, 8)
  assert.equal(new Set(careers.map(x => x.id)).size, 8)
  assert.equal(careers.filter(x => x.university === 'UTN' && x.name === 'Ingeniería Industrial').length, 2)
})
test('default fixture resolves an instance identity distinct from catalog and user', () => {
  const s = fixtureState(); assert.equal(c(s).catalogId, SYSTEMS)
  assert.equal(c(s).key, 'demo-instance-user:instances:demo-sistemas')
})
test('first trajectory auto-selects; existing and archived catalogs stay reserved', () => {
  let s = fixtureState('empty')
  s = act(s, 'add', SYSTEMS); assert.ok(c(s).key)
  const id = s.instances[0].careerInstanceId
  s = act(s, 'archive', id)
  assert.throws(() => act(s, 'add', SYSTEMS), { code: 'DUPLICATE_CATALOG_INSTANCE' })
})
test('archive clears only the selected instance, preserves record and revokes sharing; restore never selects', () => {
  let s = fixtureState('instances', { status: { 'UTN-ISI23-01': 'Aprobada' }, grades: { 'UTN-ISI23-01': 8 } })
  const oldKey = c(s).key, original = structuredClone(s.records)
  s.sharing['demo-sistemas'] = { enabled: true, epoch: 4 }
  s = act(s, 'archive', 'demo-sistemas')
  assert.equal(c(s).key, null); assert.deepEqual(s.records, original)
  assert.deepEqual(s.sharing['demo-sistemas'], { enabled: false, epoch: 5 })
  s = act(s, 'restore', 'demo-sistemas')
  assert.equal(c(s).key, null); assert.equal(s.sharing['demo-sistemas'].enabled, false)
  s = act(s, 'select', 'demo-sistemas'); assert.deepEqual(c(s).record, original[oldKey])
})
test('plans and careers have separate records; stale writes and foreign codes are rejected', () => {
  let s = fixtureState(); const systemsKey = c(s).key
  s = updateDemoRecord(s, systemsKey, 'status', { 'UTN-ISI23-01': 'Regularizada' }, careers)
  s = act(s, 'select', 'demo-industrial23')
  assert.deepEqual(c(s).record.status, {})
  assert.throws(() => updateDemoRecord(s, systemsKey, 'status', {}, careers), { code: 'ACADEMIC_SCOPE_CHANGED' })
  assert.throws(() => updateDemoRecord(s, c(s).key, 'status', { 'UTN-ISI23-01': 'Aprobada' }, careers), { code: 'INVALID_INPUT' })
  s = act(s, 'select', 'demo-sistemas'); assert.equal(c(s).record.status['UTN-ISI23-01'], 'Regularizada')
})
test('legacy selection uses catalog scope and never changes account authority', () => {
  let s = fixtureState('legacy'); assert.equal(c(s).authority, 'legacy')
  const key = c(s).key
  s = act(s, 'legacy-select', 'utn-industrial-2007')
  assert.notEqual(c(s).key, key); assert.equal(c(s).authority, 'legacy')
  assert.throws(() => act(s, 'add', SYSTEMS), { code: 'ACADEMIC_AUTHORITY_CHANGED' })
})
test('frozen, blocked and invalid fail closed without deleting records or legacy fallback', () => {
  for (const name of ['frozen', 'blocked', 'invalid']) {
    const s = fixtureState(name); const saved = structuredClone(s.records)
    assert.equal(c(s).usable, false)
    assert.throws(() => act(s, 'select', 'demo-sistemas'))
    assert.throws(() => updateDemoRecord(s, null, 'status', {}, careers))
    assert.deepEqual(s.records, saved)
  }
})
test('missing selection, archived selection and absent catalog never choose a substitute', () => {
  const s = fixtureState('unselected'); assert.equal(c(s).key, null)
  assert.throws(() => act(s, 'select', 'demo-industrial07'), { code: 'INVALID_INPUT' })
  const missing = fixtureState('unavailable')
  assert.equal(c(missing).catalogId, 'catalogo-ficticio-no-disponible'); assert.equal(c(missing).career, null)
  assert.equal(c(missing).usable, false)
  assert.equal(c(act(missing, 'select', null)).catalogId, null)
})

import { universities, careerChoices, planChoices, matchesSearch } from './catalogSearch.mjs'
test('adding with an existing selection, no selection or archived-only never auto-selects', () => {
 for (const scenario of ['instances','unselected']) {
  const s=fixtureState(scenario), next=act(s,'add','uade-informatica')
  assert.equal(next.profile.activeCareerInstanceId,s.profile.activeCareerInstanceId)
 }
 let s=act(fixtureState('empty'),'add',SYSTEMS)
 s=act(s,'archive',s.instances[0].careerInstanceId)
 assert.equal(act(s,'add','uade-informatica').profile.activeCareerInstanceId,null)
})
test('duplicate retries preserve single instance and academic records', () => {
 const before=fixtureState('empty'), s=act(before,'add',SYSTEMS)
 assert.throws(()=>act(s,'add',SYSTEMS),{code:'DUPLICATE_CATALOG_INSTANCE'})
 assert.equal(s.instances.length,1);assert.deepEqual(s.records,before.records)
})
test('search is accent-insensitive, scoped, alphabetic and keeps exact catalog identities', () => {
 assert.ok(matchesSearch('Ingeniería en Sistemas','INGENIERIA sistemas'))
 assert.deepEqual(universities(careers),['UADE','UBA','UCA','UTN'])
 assert.equal(careerChoices(careers,'UTN','odontologia').length,0)
 const industrial=careerChoices(careers,'UTN','industrial')[0]
 assert.deepEqual(planChoices(careers,'UTN',industrial.key).map(c=>c.id),['utn-industrial-2007','utn-industrial-2023'])
 assert.ok(careers.some(c=>c.plan==='A confirmar'))
})
test('large catalog search remains scoped and does not merge homonymous faculties', () => {
 const large=Array.from({length:1500},(_,i)=>({id:`test-${i}`,university:`Universidad ${i%10}`,name:`Ingeniería ${String(i).padStart(4,'0')}`,faculty:'Facultad ficticia',plan:'Único'}))
 assert.equal(careerChoices(large,'Universidad 1').length,150)
 assert.equal(careerChoices(large,'Universidad 1','ingenieria 0001').length,1)
 assert.equal(careerChoices([...large,{...large[1],id:'other-faculty',faculty:'Otra facultad'}],'Universidad 1','0001').length,2)
})
