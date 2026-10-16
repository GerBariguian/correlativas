import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { academicPresentation, visibleAcademicRows } from './academicPresentation.mjs'
import { createSimulatedAcademicOperations } from './simulatedAcademicOperations.mjs'
import { fixtureState, describeContext, changeContext, updateDemoRecord, SYSTEMS } from './contextModel.mjs'
import { summary, availableToCourse, availableFinals, blockedSubjects } from '../../src/logic.js'
const root=new URL('../..',import.meta.url)
const source=(await fs.readFile(new URL('src/data/careers.js',root),'utf8')).replace(/from\s+'(\.[^']+)'/g,(_,p)=>`from '${new URL(`src/data/${p}.js`,root).href}'`)
const {careers}=await import('data:text/javascript,'+encodeURIComponent(source))
const context=state=>describeContext(state,careers)
const vm=state=>academicPresentation(context(state))
const code='UTN-ISI23-01'
function harness(s=fixtureState()){
 let state=s, feedback, tasks=[]
 const controller=createSimulatedAcademicOperations({read:()=>state,write:v=>{state=v},catalogs:careers,publish:v=>{feedback=v},schedule:fn=>{tasks.push(fn);return fn},cancel:()=>{}})
 return {controller,get state(){return state},get feedback(){return feedback},flush(){const pending=tasks;tasks=[];pending.forEach(fn=>fn())},select(op,id){state=changeContext(state,op,id,careers);controller.invalidate()},set(v){state=v}}
}
test('every real catalog uses exactly the web metrics for all four states',()=>{
 for(const career of careers)for(const status of ['Pendiente','Cursando','Regularizada','Aprobada']){
  const map=Object.fromEntries(career.subjects.map(s=>[s.code,status]))
  const model=academicPresentation({usable:true,key:'test',catalogId:career.id,career,record:{status:map}})
  assert.deepEqual(model.stats,summary(career.subjects,map))
  assert.deepEqual(model.toCourse,availableToCourse(career.subjects,map))
  assert.deepEqual(model.finals,availableFinals(career.subjects,map))
  assert.deepEqual(model.blocked,blockedSubjects(career.subjects,map))
  assert.equal(model.rows.length,career.subjects.length)
 }
})
test('regularized/approved course prerequisites, finals and dependencies remain distinct',()=>{
 const subjects=[{code:'A',name:'Álgebra',year:1},{code:'B',name:'B',prereqs:['A']},{code:'C',name:'C',approvedPrereqs:['A']},{code:'D',name:'D',finalPrereqs:['A']}]
 const model=academicPresentation({usable:true,key:'x',career:{subjects},record:{status:{A:'Regularizada',D:'Regularizada'}}})
 assert.equal(model.byCode.B.canEnroll,true);assert.equal(model.byCode.C.canEnroll,false)
 assert.equal(model.byCode.D.canSitFinal,false);assert.equal(model.pendingFinalCount,2)
 assert.deepEqual(model.byCode.A.dependents.map(s=>s.code),['B','C'])
 assert.equal(model.byCode.B.hasRecordedStatus,false);assert.equal(model.byCode.B.status,'Pendiente')
 assert.equal(visibleAcademicRows(model,{query:'algebra'})[0].code,'A')
})
test('ALL excludes electives and flagged subjects but not normal mandatory subjects',()=>{
 const subjects=[{code:'A'},{code:'E',elective:true},{code:'X',excludeFromAllFinals:true},{code:'F',finalPrereqs:['ALL']}]
 const ctx={usable:true,key:'x',career:{subjects},record:{status:{A:'Aprobada',F:'Regularizada'}}}
 assert.equal(academicPresentation(ctx).byCode.F.canSitFinal,true)
 ctx.record.status.A='Regularizada';assert.equal(academicPresentation(ctx).byCode.F.canSitFinal,false)
 assert.deepEqual(academicPresentation(ctx).byCode.F.missingFinal,['A'])
})
test('empty, absent and malformed data are not conflated',()=>{
 const empty=academicPresentation({usable:true,key:'x',career:{subjects:[]},record:{status:{}}})
 assert.equal(empty.stats.progress,0);assert.equal(empty.stats.total,0)
 assert.equal(vm(fixtureState('missing-progress')).stats.approved,0)
 assert.equal(vm(fixtureState('invalid-progress')).dataError,true)
 assert.equal(academicPresentation({usable:true,key:'x',career:{subjects:[]},record:{status:null}}).canEdit,false)
 const legacy=fixtureState('legacy');legacy.records={}
 assert.deepEqual(context(legacy).record.status,careers.find(c=>c.id===SYSTEMS).initialStatus)
})
test('save waits for success and changes only the requested subject',()=>{
 const h=harness(), before=structuredClone(h.state.records)
 assert.equal(h.controller.begin({code,status:'Aprobada'}),true)
 assert.equal(h.feedback.phase,'saving');assert.deepEqual(h.state.records,before)
 assert.equal(h.controller.begin({code,status:'Cursando'}),false)
 h.flush();assert.equal(context(h.state).record.status[code],'Aprobada');assert.equal(h.feedback.phase,'success')
 assert.deepEqual(Object.keys(context(h.state).record.status),[code])
})
test('blocked subjects can be recorded without prerequisite enforcement or cascading',()=>{
 const h=harness();const blocked=vm(h.state).blocked[0].code
 h.controller.begin({code:blocked,status:'Aprobada'});h.flush()
 assert.deepEqual(context(h.state).record.status,{[blocked]:'Aprobada'})
 for(const status of ['Pendiente','Cursando','Regularizada','Aprobada']){h.controller.begin({code:blocked,status});h.flush();assert.equal(context(h.state).record.status[blocked],status)}
})
test('error and conflict preserve confirmed progress and require an explicit refresh',()=>{
 for(const mode of ['error','conflict']){
  const h=harness(),before=structuredClone(h.state.records)
  h.controller.begin({code,status:'Aprobada',mode});h.flush()
  assert.equal(h.feedback.phase,mode);assert.deepEqual(h.state.records,before)
  assert.equal(academicPresentation(context(h.state),h.feedback).canEdit,false)
  assert.equal(h.controller.begin({code,status:'Aprobada'}),false)
  h.controller.begin({kind:'load'});assert.equal(h.feedback.phase,'loading');h.flush()
  assert.equal(h.feedback.phase,'success');h.controller.begin({code,status:'Cursando'});h.flush()
  assert.equal(context(h.state).record.status[code],'Cursando')
 }
})
test('late results cannot alter B, or A after leaving and returning to A',()=>{
 for(const kind of ['save','load'])for(const mode of ['success','error','conflict']){
  const h=harness(),before=structuredClone(h.state.records)
  h.controller.begin({kind,code,status:'Aprobada',mode})
  h.select('select','demo-industrial23');h.select('select','demo-sistemas');h.flush()
  assert.deepEqual(h.state.records,before);assert.equal(h.feedback.phase,'idle')
 }
})
test('late A does not cancel or replace the newer pending B operation',()=>{
 const h=harness();h.controller.begin({code,status:'Aprobada'})
 h.select('select','demo-industrial23')
 const other=context(h.state).career.subjects[0].code
 h.controller.begin({code:other,status:'Cursando'});h.flush()
 assert.equal(context(h.state).record.status[other],'Cursando')
 h.select('select','demo-sistemas');assert.deepEqual(context(h.state).record.status,{})
})
test('legacy and instance identities never share records, even with the same catalog',()=>{
 const h=harness(fixtureState('legacy'));const oldKey=context(h.state).key
 h.controller.begin({code,status:'Aprobada'});h.set(fixtureState('instances'));h.controller.invalidate();h.flush()
 assert.notEqual(context(h.state).key,oldKey);assert.deepEqual(context(h.state).record.status,{})
})
test('archive, reset and dispose discard pending work; blocked contexts never schedule writes',()=>{
 const h=harness();h.controller.begin({code,status:'Aprobada'});h.select('archive','demo-sistemas');h.flush();assert.equal(context(h.state).key,null)
 for(const scenario of ['frozen','blocked','invalid','unavailable','unselected','empty','invalid-progress']){
  const x=harness(fixtureState(scenario));assert.equal(x.controller.begin({code,status:'Aprobada'}),false)
 }
 const x=harness();x.controller.begin({code,status:'Aprobada'});x.controller.dispose();x.flush();assert.deepEqual(context(x.state).record.status,{})
})
test('unknown codes and statuses cannot be submitted; an approved state is not a grade',()=>{
 const h=harness();assert.equal(h.controller.begin({code:'other-catalog',status:'Aprobada'}),false)
 assert.equal(h.controller.begin({code,status:'Promocionada'}),false)
 assert.throws(()=>updateDemoRecord(h.state,context(h.state).key,'grades',{},careers))
})
