import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {direction,previewStatus,swipeStatus} from './gesture.mjs'
const swipe=(dx,dy=0)=>swipeStatus({dx,dy})
test('four directions match the actual unchanged web implementation',()=>{
 const source=fs.readFileSync(new URL('../../src/components/AcademicOnboardingMobile.jsx',import.meta.url),'utf8')
 const expression=source.match(/const direction = (.*)\n/)[1]
 const web=Function('return ('+expression+')')()
 for(const [x,y,status] of [[-100,0,'Pendiente'],[100,0,'Aprobada'],[0,-100,'Cursando'],[0,100,'Regularizada']]){
  assert.equal(direction(x,y),web(x,y));assert.equal(swipe(x,y),status)
 }
})
test('web preview begins at 18px; release starts at 65px',()=>{
 assert.equal(previewStatus(-17,0),null);assert.equal(previewStatus(-18,0),'Pendiente')
 assert.equal(swipe(-64),null);assert.equal(swipe(-65),'Pendiente')
 assert.equal(swipe(0,-64),null);assert.equal(swipe(0,-65),'Cursando')
})
test('incomplete and ambiguous diagonals never decide',()=>{
 for(const [x,y] of [[0,0],[20,-10],[-64,-20],[90,90],[-100,100],[100,80]])assert.equal(swipe(x,y),null)
 assert.equal(swipe(101,80),'Aprobada')
})
test('slow deliberate drags are not mapped to navigation or omission',()=>{
 assert.equal(swipe(-150),'Pendiente');assert.equal(swipe(150),'Aprobada')
 assert.equal(swipe(0,150),'Regularizada');assert.equal(swipe(0,-150),'Cursando')
})
test('preview follows changing direction without persisting an earlier state',()=>{
 assert.equal(previewStatus(-40,0),'Pendiente');assert.equal(previewStatus(0,-40),'Cursando');assert.equal(previewStatus(0,40),'Regularizada');assert.equal(previewStatus(40,0),'Aprobada')
})
test('release threshold is symmetric on both axes, independent of card size',()=>{
 for(const [x,y] of [[65,0],[-65,0],[0,65],[0,-65]])assert.ok(swipe(x,y))
 for(const [x,y] of [[64,0],[-64,0],[0,64],[0,-64]])assert.equal(swipe(x,y),null)
})
