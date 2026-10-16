import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {academicPresentation} from './academicPresentation.mjs'
import {dashboardPresentation} from './dashboardModel.mjs'
import {recommendations,summary,availableFinals,availableToCourse,STATUS} from '../../src/logic.js'
import {fixtureState,describeContext,changeContext} from './contextModel.mjs'
const root=new URL('../..',import.meta.url)
const source=(await fs.readFile(new URL('src/data/careers.js',root),'utf8')).replace(/from\s+'(\.[^']+)'/g,(_,p)=>`from '${new URL(`src/data/${p}.js`,root).href}'`)
const {careers}=await import('data:text/javascript,'+encodeURIComponent(source))
const model=(career,status={})=>academicPresentation({usable:true,key:career.id,career,record:{status}})
test('dashboard totals and eligibility agree with web/shared model across all catalogs and states',()=>{
 for(const career of careers)for(const state of STATUS){
  const status=Object.fromEntries(career.subjects.map(s=>[s.code,state])),vm=model(career,status),d=dashboardPresentation(vm)
  assert.equal(d.stats,vm.stats);assert.deepEqual(d.stats,summary(career.subjects,status))
  assert.equal(d.courseCount,availableToCourse(career.subjects,status).length)
  assert.equal(d.finalCount,availableFinals(career.subjects,status).length)
  const raw=recommendations(career.subjects,status)
  assert.deepEqual(d.guidance.map(r=>[r.title,r.type,r.score]),raw.map(r=>[r.title,r.type,r.score]))
  assert.equal(d.stats.approved+d.stats.regularized+d.stats.taking+d.stats.pending,d.stats.total)
 }
})
test('missing statuses, empty catalog and completion are distinct, with no zero-division',()=>{
 const empty=dashboardPresentation(model({id:'x',subjects:[]}));assert.equal(empty.noCatalogEntries,true);assert.equal(empty.stats.progress,0);assert.equal(empty.complete,false)
 const c={id:'x',subjects:[{code:'A',name:'A',year:1}]}
 assert.equal(dashboardPresentation(model(c)).noRecordedStates,true)
 assert.equal(dashboardPresentation(model(c,{A:'Pendiente'})).noRecordedStates,false)
 const done=dashboardPresentation(model(c,{A:'Aprobada'}));assert.equal(done.complete,true);assert.deepEqual(done.guidance,[])
})
test('guidance softens direct-unlock wording without reranking or promising automatic effects',()=>{
 const career={id:'x',subjects:[{code:'A',name:'A',year:1},{code:'B',name:'B',year:2,prereqs:['A']}]}
 const vm=model(career,{A:'Cursando'}),original=JSON.stringify(vm),d=dashboardPresentation(vm)
 assert.ok(d.guidance.some(r=>r.reason.includes('podría ayudar a habilitar')))
 assert.equal(JSON.stringify(vm),original)
 assert.equal(recommendations(career.subjects,vm.status)[0].reason.includes('desbloquea'),true)
})
test('duplicate subject names are not joined to arbitrary subject IDs',()=>{
 const d=dashboardPresentation(model({id:'x',subjects:[{code:'A',name:'Igual',year:1},{code:'B',name:'Igual',year:2}]}))
 assert.equal(d.guidance.length,2);assert.ok(d.guidance.every(r=>!Object.hasOwn(r,'code')))
})
test('context and account authority remain independent; dashboard never writes or transfers records',()=>{
 const before=fixtureState('instances',{status:{'UTN-ISI23-01':'Aprobada'}}),saved=structuredClone(before.records)
 const first=dashboardPresentation(academicPresentation(describeContext(before,careers)))
 const other=changeContext(before,'select','demo-industrial23',careers),second=dashboardPresentation(academicPresentation(describeContext(other,careers)))
 assert.equal(first.stats.approved,1);assert.equal(second.stats.approved,0);assert.equal(second.noRecordedStates,true)
 assert.deepEqual(before.records,saved);assert.deepEqual(other.records,saved)
 for(const scenario of ['unavailable','frozen','blocked','invalid','invalid-progress','empty','unselected']){
  const s=fixtureState(scenario),copy=structuredClone(s),vm=academicPresentation(describeContext(s,careers))
  assert.equal(vm.available,false);assert.deepEqual(dashboardPresentation(vm).guidance,[]);assert.deepEqual(s,copy)
 }
})
