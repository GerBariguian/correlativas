import test from 'node:test'
import assert from 'node:assert/strict'
import {lockAxis,swipeDirection} from './gesture.mjs'
const swipe=(dx,dy=0,width=350,duration=250)=>swipeDirection({dx,dy,width,duration})
test('left and right navigate without producing academic statuses',()=>{assert.equal(swipe(-140),'next');assert.equal(swipe(140),'previous')})
test('taps and short movements do not navigate',()=>{assert.equal(swipe(0),null);assert.equal(swipe(-20),null);assert.equal(lockAxis(5,5),null)})
test('vertical/diagonal scroll has priority',()=>{assert.equal(lockAxis(15,50),'vertical');assert.equal(swipe(-100,100),null);assert.equal(swipe(40,120),null)})
test('axis is undecided until deliberate movement',()=>{assert.equal(lockAxis(-30,5),'horizontal');assert.equal(lockAxis(10,8),null)})
test('long stationary touch followed by movement is not a swipe',()=>{assert.equal(swipe(-150,0,350,1300),null)})
test('gesture threshold follows card width with touch-friendly minimum',()=>{assert.equal(swipe(-60,0,200),null);assert.equal(swipe(-75,0,200),'next');assert.equal(swipe(-90,0,600),null)})
