import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {academicPresentation} from './academicPresentation.mjs'
import {subjectDetailModel,resolveSubjectRoute} from './subjectDetailModel.mjs'
import {missingFinalPrereqs,missingCoursePrereqs,unlocks,canTakeFinal,canCourse,STATUS} from '../../src/logic.js'
const root=new URL('../..',import.meta.url)
const source=(await fs.readFile(new URL('src/data/careers.js',root),'utf8')).replace(/from\s+'(\.[^']+)'/g,(_,p)=>`from '${new URL(`src/data/${p}.js`,root).href}'`)
const {careers}=await import('data:text/javascript,'+encodeURIComponent(source))
const model=(subjects,status={})=>academicPresentation({usable:true,key:'test',career:{id:'test',subjects},record:{status}})
test('all catalog details use the same web requirements and dependencies for every state',()=>{
 for(const career of careers)for(const state of STATUS){
  const status=Object.fromEntries(career.subjects.map(s=>[s.code,state])),m=model(career.subjects,status)
  for(const subject of career.subjects){
   const d=subjectDetailModel(m,subject.code)
   assert.equal(d.courseRequirementsMet,canCourse(subject,status));assert.equal(d.finalRequirementsMet,canTakeFinal(subject,status,career.subjects))
   assert.deepEqual(d.courseRegularized.filter(x=>x.missing).map(x=>x.code),missingCoursePrereqs(subject,status).regularized)
   assert.deepEqual(d.courseApproved.filter(x=>x.missing).map(x=>x.code),missingCoursePrereqs(subject,status).approved)
   assert.deepEqual(d.finalRequired.filter(x=>x.missing).map(x=>x.code),missingFinalPrereqs(subject,status,career.subjects))
   assert.deepEqual(d.dependents,unlocks(career.subjects,subject.code))
  }
 }
})
test('regularization and approval requirements remain independent, including final fallback',()=>{
 const subjects=[{code:'A',name:'Álgebra'},{code:'B',name:'B'},{code:'S',name:'S',prereqs:['A'],approvedPrereqs:['B']}]
 const d=subjectDetailModel(model(subjects,{A:'Regularizada',B:'Regularizada',S:'Regularizada'}),'S')
 assert.equal(d.courseRegularized[0].missing,false);assert.equal(d.courseApproved[0].missing,true)
 assert.equal(d.finalRequired[0].code,'A');assert.equal(d.finalRequired[0].missing,true)
 assert.equal(d.finalLabel,'Correlativas de final pendientes')
})
test('ALL requirements keep exactly the web exclusions',()=>{
 const subjects=[{code:'A'},{code:'E',elective:true},{code:'X',excludeFromAllFinals:true},{code:'F',finalPrereqs:['ALL']}]
 const d=subjectDetailModel(model(subjects,{A:'Aprobada',F:'Regularizada'}),'F')
 assert.equal(d.allFinals,true);assert.deepEqual(d.finalRequired.map(r=>r.code),['A']);assert.equal(d.finalLabel,'Final habilitado')
})
test('meeting final prerequisites alone does not mean a final is enabled',()=>{
 const subjects=[{code:'A'},{code:'F',finalPrereqs:['A']}]
 assert.equal(subjectDetailModel(model(subjects,{A:'Aprobada',F:'Cursando'}),'F').finalLabel,'Todavía no está regularizada')
 assert.equal(subjectDetailModel(model(subjects,{A:'Aprobada',F:'Aprobada'}),'F').finalLabel,'Materia ya aprobada')
})
test('unknown metadata/requirements do not invent names, time conversions or equivalences',()=>{
 const m=model([{code:'S',prereqs:['MISSING'],hours:0,hoursUnit:'horas reloj totales'}])
 const d=subjectDetailModel(m,'S')
 assert.equal(d.courseRegularized[0].name,'MISSING');assert.equal(d.courseRegularized[0].known,false)
 assert.equal(d.displayLevel,'Nivel no informado');assert.equal(d.displayPeriod,'Período no informado')
 assert.equal(d.hoursLabel,'0 horas reloj totales')
 assert.equal(subjectDetailModel(model([{code:'A',level:'CBC',term:'CBC',hours:6,hoursUnit:'horas cátedra semanales'}]),'A').hoursLabel,'6 horas cátedra semanales')
})
test('unavailable or foreign subject never yields a usable detail or changes progress',()=>{
 const m=model([{code:'A'}]),before=JSON.stringify(m)
 assert.equal(subjectDetailModel(m,'foreign'),null)
 assert.equal(subjectDetailModel(academicPresentation({usable:false}), 'A'),null)
 subjectDetailModel(m,'A');assert.equal(JSON.stringify(m),before)
})

test('history routes resolve only live data in the exact academic scope',()=>{
 const m=model([{code:'A',name:'Live catalog name'}]),context={key:'test',catalogId:'test'},route={type:'subject',code:'A',scopeKey:'test',subject:{name:'Stale historical object'}}
 assert.equal(resolveSubjectRoute(m,context,route).name,'Live catalog name')
 assert.equal(resolveSubjectRoute(m,{key:'other',catalogId:'test'},route),null)
 assert.equal(resolveSubjectRoute(m,{key:'test',catalogId:'other-plan'},route),null)
 assert.equal(resolveSubjectRoute(m,context,{...route,code:'foreign'}),null)
 assert.equal(resolveSubjectRoute({...m,available:false},context,route),null)
})
