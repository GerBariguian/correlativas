import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {fixtureState,describeContext,changeContext,updateDemoRecord,SYSTEMS} from '../integration-final/contextModel.mjs'
import {startSession,sessionKey,confirmDecision,moveSession} from '../integration-final/onboardingModel.mjs'
import {restoreDemo} from '../integration-final/demoStorage.mjs'
const root=new URL('../..',import.meta.url)
const text=(await fs.readFile(new URL('src/data/careers.js',root),'utf8')).replace(/from\s+'(\.[^']+)'/g,(_,p)=>`from '${new URL(`src/data/${p}.js`,root).href}'`)
const {careers}=await import('data:text/javascript,'+encodeURIComponent(text))
const ctx=s=>describeContext(s,careers)
const restore=(state,sessions={})=>restoreDemo(JSON.stringify({version:1,state,sessions}),careers)
test('empty fixture and its first added trajectory restore without orphan records',()=>{
 const empty=fixtureState('empty',{status:{'UTN-ISI23-01':'Aprobada'}})
 assert.deepEqual(empty.records,{})
 assert.ok(restore(empty))
 const first=changeContext(empty,'add',SYSTEMS,careers)
 assert.ok(restore(first));assert.equal(ctx(first).activeCareerInstanceId,'demo-added-1')
})
test('first-career choice and correction cursor survive serialization unchanged',()=>{
 let state=changeContext(fixtureState('empty'),'add',SYSTEMS,careers),context=ctx(state),session=startSession(context)
 const code=careers.find(c=>c.id===SYSTEMS).subjects[0].code
 session=moveSession(confirmDecision(session,code,'Regularizada'),-1)
 state=updateDemoRecord(state,context.key,'status',{[code]:'Regularizada'},careers)
 const saved=restore(state,{[sessionKey(context)]:session})
 assert.ok(saved);assert.deepEqual(saved.state.records,state.records)
 assert.equal(saved.sessions[sessionKey(context)].cursor,0)
 assert.deepEqual(saved.sessions[sessionKey(context)].draft.decisions,{[code]:'Regularizada'})
})
test('adding and restoring other plans preserve the selection and independent records',()=>{
 let state=fixtureState('instances',{status:{'UTN-ISI23-01':'Aprobada'}}),before=structuredClone(state.records)
 state=changeContext(state,'add','uba-actuario',careers)
 state=changeContext(state,'restore','demo-industrial07',careers)
 const saved=restore(state)
 assert.ok(saved);assert.equal(saved.state.profile.activeCareerInstanceId,'demo-sistemas');assert.deepEqual(saved.state.records,before)
})
