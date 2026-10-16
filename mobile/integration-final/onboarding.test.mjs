import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {fixtureState,describeContext,changeContext,updateDemoRecord,SYSTEMS} from './contextModel.mjs'
import {startSession,sessionKey,editableCodes,sessionProgress,skipSession,moveSession,confirmDecision,restoreSession,sessionMatches} from './onboardingModel.mjs'
import {restoreDemo,readDemo,writeDemo,STORAGE_KEY} from './demoStorage.mjs'
import {createSimulatedAcademicOperations} from './simulatedAcademicOperations.mjs'
const root=new URL('../..',import.meta.url)
const text=(await fs.readFile(new URL('src/data/careers.js',root),'utf8')).replace(/from\s+'(\.[^']+)'/g,(_,p)=>`from '${new URL(`src/data/${p}.js`,root).href}'`)
const {careers}=await import('data:text/javascript,'+encodeURIComponent(text))
const ctx=s=>describeContext(s,careers)
const first=careers.find(c=>c.id===SYSTEMS).subjects[0].code
const second=careers.find(c=>c.id===SYSTEMS).subjects[1].code
const encode=(state,sessions={})=>JSON.stringify({version:1,state,sessions})
test('web eligibility protects explicit Pendiente, omitting never assigns it',()=>{
 const state=fixtureState('instances',{status:{[first]:'Pendiente'}}),s=startSession(ctx(state))
 assert.equal(sessionProgress(s).protected,1);assert.ok(!editableCodes(s).includes(first))
 assert.throws(()=>confirmDecision(s,first,'Aprobada'))
 const skipped=skipSession(s);assert.equal(skipped.skipped.length,1);assert.deepEqual(skipped.draft.decisions,{})
 assert.equal(sessionProgress(skipped).reviewed,0)
})
test('four states may be assigned regardless of prerequisites, back permits correction',()=>{
 let s=startSession(ctx(fixtureState()))
 for(const status of ['Pendiente','Cursando','Regularizada','Aprobada']){
  s=confirmDecision(moveSession(s,-100),first,status)
  assert.equal(s.draft.decisions[first],status);assert.equal(sessionProgress(s).reviewed,1)
 }
 assert.deepEqual(s.draft.baseline,{});assert.equal(s.draft.codes.length,44)
})
test('skips can be revisited; last card and boundaries do not wrap or discard choices',()=>{
 let s=skipSession(startSession(ctx(fixtureState())))
 s=confirmDecision(moveSession(s,-1),first,'Cursando')
 assert.deepEqual(s.skipped,[]);assert.equal(s.cursor,1)
 assert.equal(moveSession(s,1000).cursor,44);assert.equal(moveSession(s,-1000).cursor,0)
})
test('only a matching catalog, authority, user and instance can resume',()=>{
 const state=fixtureState(),s=startSession(ctx(state)),other=changeContext(state,'select','demo-industrial23',careers)
 assert.ok(sessionMatches(s,ctx(state)));assert.ok(!sessionMatches(s,ctx(other)))
 assert.ok(!sessionMatches(s,{...ctx(state),uid:'demo-other'}));assert.ok(!sessionMatches(s,{...ctx(state),catalogId:'other'}))
 assert.ok(!sessionMatches(s,ctx(fixtureState('legacy'))))
})
test('confirmed changes survive reload and retain the correction cursor',()=>{
 let state=fixtureState(),s=startSession(ctx(state))
 state=updateDemoRecord(state,ctx(state).key,'status',{[first]:'Aprobada'},careers)
 s=confirmDecision(s,first,'Aprobada');s=skipSession(s);s=moveSession(s,-2)
 const restored=restoreDemo(encode(state,{[sessionKey(ctx(state))]:s}),careers)
 assert.deepEqual(restored.state.records,state.records)
 assert.equal(restored.sessions[sessionKey(ctx(state))].cursor,0)
 assert.equal(sessionProgress(restored.sessions[sessionKey(ctx(state))]).reviewed,1)
 assert.ok(restoreSession(s,ctx(state)))
})
test('an edit made in detail makes the old session stale instead of overwriting it',()=>{
 let state=fixtureState(),s=startSession(ctx(state))
 state=updateDemoRecord(state,ctx(state).key,'status',{[first]:'Cursando'},careers)
 assert.equal(restoreSession(s,ctx(state)),null)
 const fresh=startSession(ctx(state));assert.ok(!editableCodes(fresh).includes(first))
})
test('malformed/oversize storage, unknown codes, credentials and wrong identity cannot restore',()=>{
 for(const raw of ['broken','x'.repeat(2000001),encode({...fixtureState(),uid:'real-user'}),encode({...fixtureState(),records:{x:{status:{unknown:'Aprobada'}}}})])assert.equal(restoreDemo(raw,careers),null)
 const state=fixtureState(),s=startSession(ctx(state));s.draft={...s.draft,decisions:{[first]:'9'}}
 assert.deepEqual(restoreDemo(encode(state,{[sessionKey(ctx(state))]:s}),careers).sessions,{})
 assert.equal(restoreDemo(encode({...state,control:{}}),careers),null)
})
test('blocked storage gives explicit warning and does not prevent memory-only operation',()=>{
 const storage={getItem(){throw Error('denied')},setItem(){throw Error('quota')}}
 assert.ok(readDemo(storage,careers).warning);assert.equal(writeDemo(storage,fixtureState(),{}),false)
 assert.ok(readDemo({getItem:()=>'{invalid'},careers).warning)
})
test('no-career, frozen, missing catalog and corrupt progress cannot create writable drafts',()=>{
 for(const scenario of ['empty','frozen','blocked','unavailable','invalid-progress'])assert.throws(()=>startSession(ctx(fixtureState(scenario))))
})
test('large catalogs retain source order, special CBC and independent contexts',()=>{
 const c=ctx(fixtureState()),subjects=Array.from({length:1500},(_,i)=>({code:'F-'+i,name:'Materia ficticia '+i,year:i===0?'CBC':1}))
 const s=startSession({...c,career:{...c.career,subjects}})
 assert.deepEqual(editableCodes(s),subjects.map(x=>x.code));assert.equal(sessionProgress(s).editable,1500)
})
for(const mode of ['success','error','conflict'])test('simulated '+mode+' changes session only after confirmed success',()=>{
 let state=fixtureState(),session=startSession(ctx(state)),finish,feedback
 const op=createSimulatedAcademicOperations({read:()=>state,write:v=>state=v,catalogs:careers,publish:v=>feedback=v,schedule:fn=>(finish=fn,1),cancel:()=>{}})
 const expected=confirmDecision(session,first,'Regularizada')
 assert.equal(op.begin({code:first,status:'Regularizada',mode,onResult:r=>{if(r==='success')session=expected}}),true)
 assert.equal(sessionProgress(session).reviewed,0);assert.equal(Object.keys(ctx(state).record.status).length,0)
 assert.equal(op.begin({code:second,status:'Aprobada'}),false)
 finish();assert.equal(feedback.phase,mode);assert.equal(sessionProgress(session).reviewed,mode==='success'?1:0)
 assert.equal(ctx(state).record.status[first],mode==='success'?'Regularizada':undefined)
})
test('late response discarded after A→B→A and repeated completion cannot leak',()=>{
 let state=fixtureState(),finish,results=[]
 const op=createSimulatedAcademicOperations({read:()=>state,write:v=>state=v,catalogs:careers,publish:()=>{},schedule:fn=>(finish=fn,1),cancel:()=>{}})
 op.begin({code:first,status:'Aprobada',delay:4000,onResult:r=>results.push(r)})
 state=changeContext(state,'select','demo-industrial23',careers);op.invalidate();state=changeContext(state,'select','demo-sistemas',careers)
 finish();assert.deepEqual(ctx(state).record.status,{});assert.deepEqual(results,['cancelled'])
})
