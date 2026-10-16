import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {STATUS,blockedSubjects,availableFinals,availableToCourse,unlocks,getSubjectLevel} from '../../src/logic.js'
import {academicPresentation} from './academicPresentation.mjs'
import {filterAcademicRows,academicLevels,filterCount,cleanFilters,normalizeQuery} from './subjectFilters.mjs'
const root=new URL('../..',import.meta.url)
const source=(await fs.readFile(new URL('src/data/careers.js',root),'utf8')).replace(/from\s+'(\.[^']+)'/g,(_,p)=>`from '${new URL(`src/data/${p}.js`,root).href}'`)
const {careers}=await import('data:text/javascript,'+encodeURIComponent(source))
const model=(career,status)=>academicPresentation({usable:true,key:career.id,career,record:{status}})
test('accent/case-insensitive name and code search, trimmed whitespace and multiple tokens',()=>{
 const m=model({id:'test',subjects:[{code:'ÁLG-101',name:'Álgebra y Geometría',level:'CBC'}]}, {})
 assert.equal(filterAcademicRows(m,{},' ALGEBRA  alg-101 ').length,1)
 assert.equal(filterAcademicRows(m,{},'geometria').length,1)
 assert.equal(filterAcademicRows(m,{},'<script>').length,0)
 assert.equal(normalizeQuery('  ANÁLISIS  '),'analisis')
})
test('all academic condition subsets intersect exactly the web sets without reordering',()=>{
 for(const career of careers){
  const status=Object.fromEntries(career.subjects.map((s,i)=>[s.code,STATUS[i%4]])),m=model(career,status)
  const sets={course:new Set(availableToCourse(career.subjects,status).map(s=>s.code)),finals:new Set(availableFinals(career.subjects,status).map(s=>s.code)),blocked:new Set(blockedSubjects(career.subjects,status).map(s=>s.code)),unlocks:new Set(career.subjects.filter(s=>unlocks(career.subjects,s.code).length>0).map(s=>s.code))}
  for(let bits=0;bits<16;bits++){
   const criteria=Object.keys(sets).filter((_,i)=>bits&(1<<i))
   for(const state of ['',...STATUS])for(const level of ['',...academicLevels(m)]){
    const expected=career.subjects.filter(s=>(!state||(status[s.code]||'Pendiente')===state)&&(!level||getSubjectLevel(s)===level)&&criteria.every(k=>sets[k].has(s.code))).map(s=>s.code)
    assert.deepEqual(filterAcademicRows(m,{status:state,level,criteria}).map(r=>r.code),expected)
   }
  }
 }
})
test('CBC and nonnumeric levels retain source labels and first-occurrence order',()=>{
 const m=model({id:'x',subjects:[{code:'a',level:'CBC'},{code:'b',year:2},{code:'c',level:'Práctica final'},{code:'d',level:'CBC'}]}, {})
 assert.deepEqual(academicLevels(m),['CBC','2° Año','Práctica final'])
 assert.deepEqual(filterAcademicRows(m,{level:'CBC'}).map(r=>r.code),['a','d'])
})
test('incompatible criteria return zero; no silent relaxation or state updates',()=>{
 const career=careers[0],status={},m=model(career,status),before=JSON.stringify(m)
 assert.equal(filterAcademicRows(m,{criteria:['course','blocked']}).length,0)
 assert.equal(filterAcademicRows(m,{status:'Aprobada',criteria:['finals']}).length,0)
 assert.equal(JSON.stringify(m),before)
})
test('one status and level plus unique criteria count, sanitized without aliasing input',()=>{
 const input={status:'Aprobada',level:'CBC',criteria:['finals','finals','invalid']}
 assert.equal(filterCount(input),3)
 assert.deepEqual(cleanFilters(input),{status:'Aprobada',level:'CBC',criteria:['finals']})
 const f=cleanFilters(input);f.criteria.push('course');assert.equal(input.criteria.length,3)
 assert.equal(cleanFilters({status:'Promocionada'}).status,'')
})
test('empty catalogs, missing entries and unavailable model do not invent results',()=>{
 const empty=model({id:'x',subjects:[]},{})
 assert.deepEqual(filterAcademicRows(empty),[])
 const unavailable=academicPresentation({usable:false,career:null})
 assert.deepEqual(filterAcademicRows(unavailable),[])
 const m=model({id:'x',subjects:[{code:'A',name:'A'}]}, {})
 assert.equal(filterAcademicRows(m,{status:'Pendiente'}).length,1)
 assert.equal(m.rows[0].hasRecordedStatus,false)
})
test('large catalogs remain stable, searchable and scoped without mutating progress',()=>{
 const subjects=Array.from({length:1500},(_,i)=>({code:`DEMO-${i}`,name:`Materia ficticia ${i}`,level:i<50?'CBC':'Superior'}))
 const m=model({id:'large',subjects},{})
 assert.equal(filterAcademicRows(m).length,1500)
 assert.deepEqual(filterAcademicRows(m,{},'demo-1499').map(r=>r.code),['DEMO-1499'])
 assert.equal(filterAcademicRows(m,{level:'CBC',criteria:['course']}).length,50)
 assert.deepEqual(m.status,{})
})
